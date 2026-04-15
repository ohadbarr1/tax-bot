"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import type {
  AppState,
  TaxPayer,
  FinancialData,
  TaxYearDraft,
  FilingType,
  FilingGoal,
  AdvisorMessage,
  VaultDocMeta,
  VaultDocType,
  VaultDocStatus,
  IncomeSourceId,
  FieldProvenance,
  MinedField,
  UserPreferences,
} from "@/types";
import { INITIAL_STATE } from "./initialState";
import { currentTaxYear } from "./currentTaxYear";
import { calculateFullRefund, buildInsightsFromResult, buildActionItemsFromResult } from "./calculateTax";
import { saveState, loadState } from "./db";
import { deleteUserDocument } from "./firebase/storage";
import { useAuth } from "./firebase/authContext";
import { carryForwardFromPriorDraft } from "./yoyCarryover";

// ─── Context shape ────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  /** Switch between views */
  setView: (view: AppState["currentView"]) => void;
  setQuestionnaireStep: (step: number) => void;
  completeQuestionnaire: () => void;
  updateTaxpayer: (data: Partial<TaxPayer>) => void;
  updateFinancials: (data: Partial<FinancialData>) => void;
  /**
   * Merge a patch into taxpayer AND immediately re-run the full tax calculation
   * in one atomic setState call. Used by the Data Ingestion Engine (FileDropzone)
   * so uploading a Form 106 or IBKR statement instantly re-renders the Dashboard.
   * Optional financialsPatch is merged atomically to avoid the double-setState race.
   */
  updateTaxpayerAndRecalculate: (patch: Partial<TaxPayer>, financialsPatch?: Partial<FinancialData>) => void;
  /** Whether the initial IndexedDB hydration is complete (avoids FOUC) */
  hydrated: boolean;
  // ── Multi-draft (P2) ──────────────────────────────────────────────────────
  createDraft: (taxYear: number, filingType?: FilingType, filingGoal?: FilingGoal) => string;
  switchDraft: (draftId: string) => void;
  allDrafts: TaxYearDraft[];
  // ── Document vault ────────────────────────────────────────────────────────
  addDocument: (meta: VaultDocMeta) => void;
  removeDocument: (id: string) => void;
  updateDocumentType: (id: string, type: VaultDocType) => void;
  updateDocumentStatus: (id: string, status: VaultDocStatus, patch?: Partial<VaultDocMeta>) => void;
  // ── Onboarding (new paradigm) ─────────────────────────────────────────────
  setIncomeSources: (sources: IncomeSourceId[]) => void;
  markSourcesSelected: () => void;
  markDetailsConfirmed: () => void;
  /** Wipe the current in-progress onboarding draft back to a fresh slate. */
  discardCurrentDraft: () => void;
  // ── Provenance / prefill ──────────────────────────────────────────────────
  applyMiningResult: (docId: string, sourceLabel: string, fields: MinedField[]) => void;
  markFieldUserConfirmed: (fieldPath: string) => void;
  undoFieldMining: (fieldPath: string) => void;
  // ── AI Advisor (P5) ───────────────────────────────────────────────────────
  saveAdvisorMessage: (msg: AdvisorMessage) => void;
  advisorMessages: AdvisorMessage[];
  // ── User preferences ──────────────────────────────────────────────────────
  updatePreferences: (patch: Partial<UserPreferences>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── Debounce helper ──────────────────────────────────────────────────────────

function useDebounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  ) as T;
}

// ─── Dot-path set (used by applyMiningResult) ────────────────────────────────

/**
 * Immutably sets `state[path] = value`, where path is a dot-path that may include
 * numeric array indices (e.g. "taxpayer.employers[0].grossSalary"). Creates
 * intermediate arrays/objects as needed. Used by the mining pipeline to write
 * extracted fields into the state tree without the UI having to hand-craft
 * setters for every possible target.
 */
function setPath<T>(root: T, path: string, value: unknown): T {
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  if (segments.length === 0) return root;

  const rec = (node: unknown, i: number): unknown => {
    const key = segments[i];
    const isIndex = /^\d+$/.test(key);
    const idx = isIndex ? Number(key) : key;
    const last = i === segments.length - 1;

    if (isIndex) {
      const arr = Array.isArray(node) ? [...(node as unknown[])] : [];
      arr[idx as number] = last ? value : rec(arr[idx as number], i + 1);
      return arr;
    }
    const obj = (node && typeof node === "object" ? { ...(node as Record<string, unknown>) } : {}) as Record<string, unknown>;
    obj[idx as string] = last ? value : rec(obj[idx as string], i + 1);
    return obj;
  };
  return rec(root, 0) as T;
}

// ─── Migration helper ─────────────────────────────────────────────────────────

function migrateLegacyState(stored: unknown): AppState {
  const s = stored as Record<string, unknown>;
  if (!s.drafts) {
    const taxYear = ((s.financials as FinancialData)?.taxYears?.[0]) ?? currentTaxYear();
    const draftId = `draft-${taxYear}`;
    return {
      ...(s as unknown as Partial<AppState>),
      preferences: ((s.preferences as UserPreferences | undefined) ?? { notifyOnRefundUpdates: false }),
      currentDraftId: draftId,
      drafts: {
        [draftId]: {
          id: draftId,
          taxYear,
          status: "draft",
          questionnaire: (s.questionnaire as AppState["questionnaire"]) ?? { step: 1, completed: false },
          taxpayer: s.taxpayer as TaxPayer,
          financials: s.financials as FinancialData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
    } as AppState;
  }
  const migrated = s as unknown as AppState;
  if (!migrated.advisorHistory) migrated.advisorHistory = {};
  if (!migrated.documents) migrated.documents = [];
  if (!migrated.provenance) migrated.provenance = {};
  if (!migrated.onboarding) {
    migrated.onboarding = { sources: [], sourcesSelected: false, detailsConfirmed: false };
  }
  if (!migrated.preferences) {
    migrated.preferences = { notifyOnRefundUpdates: false };
  }

  // Draft isolation fix (2026-04-15): the pre-fix Form 106 parser returned
  // empty employerName on Phoenix-style PDFs, so every re-upload appended a
  // fresh stale empty-named employer instead of deduping. Drop any stored
  // employer with no name — the user's next upload will recreate it cleanly.
  const cleanEmployers = (emps: TaxPayer["employers"] | undefined) =>
    (emps ?? []).filter((e) => e && typeof e.name === "string" && e.name.trim().length > 0);

  if (migrated.taxpayer) {
    migrated.taxpayer = { ...migrated.taxpayer, employers: cleanEmployers(migrated.taxpayer.employers) };
  }
  if (migrated.drafts) {
    for (const id of Object.keys(migrated.drafts)) {
      const d = migrated.drafts[id];
      if (!d?.taxpayer) continue;
      migrated.drafts[id] = {
        ...d,
        taxpayer: { ...d.taxpayer, employers: cleanEmployers(d.taxpayer.employers) },
      };
    }
  }

  return migrated;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const { configured, ready, user } = useAuth();
  const uid = user?.uid ?? null;

  // ── Hydrate from Firestore whenever the signed-in user changes ──────────
  // Local-dev fallback (Firebase not configured) hydrates once from the
  // in-memory no-op store. In a configured env we wait for auth to resolve,
  // then re-hydrate every time the uid flips — signOut → anon re-sign-in
  // issues a new uid, so this doubles as "wipe prior user's state".
  useEffect(() => {
    if (!configured) {
      loadState().then((stored) => {
        if (stored) setState(migrateLegacyState(stored));
        setHydrated(true);
      });
      return;
    }
    if (!ready) return;
    if (!uid) {
      // Auth resolved to no-user (signOut mid-flight before anon re-signin).
      // Pause persistence and blank the in-memory state so nothing from the
      // prior user leaks into the next.
      setHydrated(false);
      setState(INITIAL_STATE);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    setState(INITIAL_STATE);
    loadState().then((stored) => {
      if (cancelled) return;
      if (stored) setState(migrateLegacyState(stored));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, ready, uid]);

  // ── Persist to IndexedDB on every state change (500ms debounce) ───────────
  const persistState = useCallback((s: AppState) => {
    saveState(s);
  }, []);

  const debouncedPersist = useDebounce(persistState, 500);

  useEffect(() => {
    if (!hydrated) return; // don't persist before we've finished hydration
    debouncedPersist(state);
  }, [state, hydrated, debouncedPersist]);

  // ── State updaters ─────────────────────────────────────────────────────────

  const setView = (view: AppState["currentView"]) =>
    setState((s) => ({ ...s, currentView: view }));

  const setQuestionnaireStep = (step: number) =>
    setState((s) => ({ ...s, questionnaire: { ...s.questionnaire, step } }));

  const completeQuestionnaire = () =>
    setState((s) => {
      const year = s.financials.taxYears[0] ?? currentTaxYear();
      const result = calculateFullRefund(s.taxpayer, year);
      const insights = buildInsightsFromResult(result, s.taxpayer, year);
      const actionItems = buildActionItemsFromResult(result, s.taxpayer);
      const newFinancials: FinancialData = {
        ...s.financials,
        estimatedRefund: result.netRefund,
        insights,
        actionItems,
        calculationResult: result,
      };
      const newQuestionnaire = { ...s.questionnaire, completed: true };
      return {
        ...s,
        questionnaire: newQuestionnaire,
        currentView: "upload",
        financials: newFinancials,
        // Mirror completion into the draft so reloads and switchDraft see it.
        drafts: {
          ...s.drafts,
          [s.currentDraftId]: {
            ...s.drafts[s.currentDraftId],
            questionnaire: newQuestionnaire,
            financials: newFinancials,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });

  const updateTaxpayer = (data: Partial<TaxPayer>) =>
    setState((s) => ({
      ...s,
      taxpayer: { ...s.taxpayer, ...data },
      drafts: {
        ...s.drafts,
        [s.currentDraftId]: {
          ...s.drafts[s.currentDraftId],
          taxpayer: { ...s.drafts[s.currentDraftId]?.taxpayer, ...data },
          updatedAt: new Date().toISOString(),
        }
      }
    }));

  const updateFinancials = (data: Partial<FinancialData>) =>
    setState((s) => ({
      ...s,
      financials: { ...s.financials, ...data },
      drafts: {
        ...s.drafts,
        [s.currentDraftId]: {
          ...s.drafts[s.currentDraftId],
          financials: { ...s.drafts[s.currentDraftId]?.financials, ...data },
          updatedAt: new Date().toISOString(),
        }
      }
    }));

  const updateTaxpayerAndRecalculate = (patch: Partial<TaxPayer>, financialsPatch?: Partial<FinancialData>) =>
    setState((prev) => {
      const newTaxpayer: TaxPayer = { ...prev.taxpayer, ...patch };
      const year = prev.financials.taxYears[0] ?? currentTaxYear();
      const result = calculateFullRefund(newTaxpayer, year);
      const insights = buildInsightsFromResult(result, newTaxpayer, year);
      const actionItems = buildActionItemsFromResult(result, newTaxpayer);
      const newFinancials: FinancialData = {
        ...prev.financials,
        ...financialsPatch,
        estimatedRefund: result.netRefund,
        insights,
        actionItems,
        calculationResult: result,
      };
      return {
        ...prev,
        taxpayer: newTaxpayer,
        financials: newFinancials,
        drafts: {
          ...prev.drafts,
          [prev.currentDraftId]: {
            ...prev.drafts[prev.currentDraftId],
            taxpayer: newTaxpayer,
            financials: newFinancials,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });

  // ── Multi-draft (P2) ───────────────────────────────────────────────────────

  const createDraft = (taxYear: number, filingType?: FilingType, filingGoal?: FilingGoal): string => {
    const draftId = `draft-${taxYear}-${Date.now()}`;
    setState((s) => {
      const carry = carryForwardFromPriorDraft(s.drafts, taxYear, draftId);
      const seededTaxpayer = carry.taxpayer;
      const seededFinancials = { ...INITIAL_STATE.financials, taxYears: [taxYear] };
      return {
        ...s,
        currentDraftId: draftId,
        currentView: "questionnaire",
        questionnaire: { step: 1, completed: false },
        taxpayer: seededTaxpayer,
        financials: seededFinancials,
        // Merge carried provenance on top of any preexisting map — prior-year
        // tags won't collide with document provenance because the new draft
        // has no documents yet.
        provenance: { ...(s.provenance ?? {}), ...carry.provenance },
        drafts: {
          ...s.drafts,
          [draftId]: {
            id: draftId,
            taxYear,
            status: "draft",
            filingType,
            filingGoal,
            questionnaire: { step: 1, completed: false },
            taxpayer: seededTaxpayer,
            financials: seededFinancials,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }
      };
    });
    return draftId;
  };

  const switchDraft = (draftId: string) => {
    setState((s) => {
      const draft = s.drafts[draftId];
      if (!draft) return s;
      return {
        ...s,
        currentDraftId: draftId,
        currentView: draft.questionnaire.completed ? "dashboard" : "questionnaire",
        questionnaire: draft.questionnaire,
        taxpayer: draft.taxpayer,
        financials: draft.financials,
      };
    });
  };

  const allDrafts = Object.values(state.drafts ?? {}).sort((a, b) => b.taxYear - a.taxYear);

  // ── Document vault ────────────────────────────────────────────────────────

  const addDocument = (meta: VaultDocMeta) =>
    setState((s) => ({
      ...s,
      documents: [...(s.documents ?? []), meta],
    }));

  const removeDocument = (id: string) =>
    setState((s) => {
      const doomed = (s.documents ?? []).find((d) => d.id === id);
      // Fire-and-forget the Cloud Storage delete so the raw blob doesn't
      // linger after the user removes it. The helper swallows "not found"
      // so this is idempotent across re-clicks.
      if (doomed?.storagePath) void deleteUserDocument(doomed.storagePath);
      return {
        ...s,
        documents: (s.documents ?? []).filter((d) => d.id !== id),
      };
    });

  const updateDocumentType = (id: string, type: VaultDocType) =>
    setState((s) => ({
      ...s,
      documents: (s.documents ?? []).map((d) => d.id === id ? { ...d, type } : d),
    }));

  const updateDocumentStatus = (id: string, status: VaultDocStatus, patch: Partial<VaultDocMeta> = {}) =>
    setState((s) => ({
      ...s,
      documents: (s.documents ?? []).map((d) => d.id === id ? { ...d, status, ...patch } : d),
    }));

  // ── Onboarding (new paradigm) ─────────────────────────────────────────────

  const setIncomeSources = (sources: IncomeSourceId[]) =>
    setState((s) => ({
      ...s,
      onboarding: { ...(s.onboarding ?? { sources: [], sourcesSelected: false, detailsConfirmed: false }), sources },
    }));

  const markSourcesSelected = () =>
    setState((s) => ({
      ...s,
      onboarding: { ...(s.onboarding ?? { sources: [], sourcesSelected: false, detailsConfirmed: false }), sourcesSelected: true },
    }));

  const discardCurrentDraft = () =>
    setState((s) => {
      const draftId = s.currentDraftId;
      const taxYear = s.financials.taxYears[0] ?? currentTaxYear();
      const freshTaxpayer = { ...INITIAL_STATE.taxpayer, id: `taxpayer-${draftId}` };
      const freshFinancials = { ...INITIAL_STATE.financials, taxYears: [taxYear] };
      return {
        ...s,
        taxpayer: freshTaxpayer,
        financials: freshFinancials,
        provenance: {},
        onboarding: { sources: [], sourcesSelected: false, detailsConfirmed: false },
        questionnaire: { step: 1, completed: false },
        drafts: {
          ...s.drafts,
          [draftId]: {
            ...s.drafts[draftId],
            taxpayer: freshTaxpayer,
            financials: freshFinancials,
            questionnaire: { step: 1, completed: false },
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });

  const markDetailsConfirmed = () =>
    setState((s) => ({
      ...s,
      currentView: "dashboard",
      // The new paradigm replaces the step-by-step questionnaire with the
      // details page. Downstream code still gates "show the dashboard" on
      // `questionnaire.completed`, so flip it here.
      questionnaire: { step: s.questionnaire?.step ?? 1, completed: true },
      onboarding: { ...(s.onboarding ?? { sources: [], sourcesSelected: false, detailsConfirmed: false }), detailsConfirmed: true },
    }));

  // ── Provenance / prefill ──────────────────────────────────────────────────

  /**
   * Apply a mining result from /api/mine/document to state. For each field:
   *   - If the user has already confirmed the field, skip (never overwrite).
   *   - Otherwise write the value via setPath + record a FieldProvenance entry.
   * Triggers a full tax recalculation at the end so the LiveRefundCounter
   * updates in real time as docs land.
   */
  const applyMiningResult = (docId: string, sourceLabel: string, fields: MinedField[]) =>
    setState((prev) => {
      let nextTaxpayer = prev.taxpayer;
      let nextFinancials = prev.financials;
      const nextProvenance = { ...(prev.provenance ?? {}) };
      const now = new Date().toISOString();

      // Resolve employer-conflict: the miner always emits `employers[0]`, but
      // the user may have already added employer 0 from a previous upload.
      // Find the mined employer's name, match against existing employers by
      // (lowercased) name, and rewrite the field paths to the matched or
      // next-free index. Fields that DON'T touch `employers[0]` pass through.
      const employerNameField = fields.find(
        (f) => f.fieldPath === "taxpayer.employers[0].name"
      );
      let resolvedEmployerIdx = 0;
      if (employerNameField && typeof employerNameField.value === "string") {
        const minedName = employerNameField.value.trim().toLowerCase();
        const existing = nextTaxpayer.employers ?? [];
        const matchIdx = existing.findIndex(
          (e) => (e.name ?? "").trim().toLowerCase() === minedName && minedName.length > 0
        );
        resolvedEmployerIdx = matchIdx >= 0 ? matchIdx : existing.length;
      }

      const rewritePath = (path: string): string => {
        if (resolvedEmployerIdx === 0) return path;
        return path.replace(/^taxpayer\.employers\[0\]/, `taxpayer.employers[${resolvedEmployerIdx}]`);
      };

      for (const f of fields) {
        const targetPath = rewritePath(f.fieldPath);
        const existing = nextProvenance[targetPath];
        if (existing?.userConfirmed) continue;

        if (targetPath.startsWith("taxpayer.")) {
          nextTaxpayer = setPath(nextTaxpayer, targetPath.slice("taxpayer.".length), f.value);
        } else if (targetPath.startsWith("financials.")) {
          nextFinancials = setPath(nextFinancials, targetPath.slice("financials.".length), f.value);
        } else {
          continue;
        }

        nextProvenance[targetPath] = {
          fieldPath: targetPath,
          sourceDocId: docId,
          sourceLabel,
          confidence: f.confidence,
          bbox: f.bbox,
          minedAt: now,
          userConfirmed: false,
        };
      }

      const year = nextFinancials.taxYears[0] ?? currentTaxYear();
      const result = calculateFullRefund(nextTaxpayer, year);
      const insights = buildInsightsFromResult(result, nextTaxpayer, year);
      const actionItems = buildActionItemsFromResult(result, nextTaxpayer);
      const recalculated: FinancialData = {
        ...nextFinancials,
        estimatedRefund: result.netRefund,
        insights,
        actionItems,
        calculationResult: result,
      };

      return {
        ...prev,
        taxpayer: nextTaxpayer,
        financials: recalculated,
        provenance: nextProvenance,
        drafts: {
          ...prev.drafts,
          [prev.currentDraftId]: {
            ...prev.drafts[prev.currentDraftId],
            taxpayer: nextTaxpayer,
            financials: recalculated,
            updatedAt: now,
          },
        },
      };
    });

  const markFieldUserConfirmed = (fieldPath: string) =>
    setState((s) => {
      const p = s.provenance?.[fieldPath];
      if (!p) return s;
      return { ...s, provenance: { ...s.provenance, [fieldPath]: { ...p, userConfirmed: true } } };
    });

  const undoFieldMining = (fieldPath: string) =>
    setState((s) => {
      const next = { ...(s.provenance ?? {}) };
      delete next[fieldPath];
      return { ...s, provenance: next };
    });

  // ── User preferences ───────────────────────────────────────────────────────
  const updatePreferences = (patch: Partial<UserPreferences>) =>
    setState((s) => ({
      ...s,
      preferences: {
        ...(s.preferences ?? { notifyOnRefundUpdates: false }),
        ...patch,
      },
    }));

  // ── Advisor history ────────────────────────────────────────────────────────
  const saveAdvisorMessage = (msg: AdvisorMessage) =>
    setState((s) => ({
      ...s,
      advisorHistory: {
        ...s.advisorHistory,
        [s.currentDraftId]: [
          ...(s.advisorHistory?.[s.currentDraftId] ?? []),
          msg,
        ],
      },
    }));

  const advisorMessages = state.advisorHistory?.[state.currentDraftId] ?? [];

  return (
    <AppContext.Provider
      value={{
        state,
        setView,
        setQuestionnaireStep,
        completeQuestionnaire,
        updateTaxpayer,
        updateFinancials,
        updateTaxpayerAndRecalculate,
        hydrated,
        createDraft,
        switchDraft,
        allDrafts,
        addDocument,
        removeDocument,
        updateDocumentType,
        updateDocumentStatus,
        setIncomeSources,
        markSourcesSelected,
        markDetailsConfirmed,
        discardCurrentDraft,
        applyMiningResult,
        markFieldUserConfirmed,
        undoFieldMining,
        saveAdvisorMessage,
        advisorMessages,
        updatePreferences,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
