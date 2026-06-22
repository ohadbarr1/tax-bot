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
import { saveState, loadState, clearState } from "./db";
import { deleteUserDocument } from "./firebase/storage";
import { useAuth } from "./firebase/authContext";
import { carryForwardFromPriorDraft } from "./yoyCarryover";
import { resolveMinedFields, makeManualEntry, markManualPaths } from "./provenance";

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
  // ── Save / delete drafts ──────────────────────────────────────────────────
  /** Mark the current draft as saved with a user-chosen name. */
  saveDraft: (name: string) => void;
  /** Delete a draft entirely (cannot delete the current draft). */
  deleteDraft: (draftId: string) => void;
  // ── Document vault ────────────────────────────────────────────────────────
  addDocument: (meta: VaultDocMeta) => void;
  removeDocument: (id: string) => void;
  updateDocumentType: (id: string, type: VaultDocType) => void;
  updateDocumentStatus: (id: string, status: VaultDocStatus, patch?: Partial<VaultDocMeta>) => void;
  linkDocumentToProcess: (
    id: string,
    ctx: { draftId?: string; processContext?: import("@/types").DocProcessContext; relatedFormIds?: import("@/types").DocFormTarget[] },
  ) => void;
  // ── Onboarding (new paradigm) ─────────────────────────────────────────────
  setIncomeSources: (sources: IncomeSourceId[]) => void;
  markSourcesSelected: () => void;
  markDetailsConfirmed: () => void;
  /** Wipe the current in-progress onboarding draft back to a fresh slate. */
  discardCurrentDraft: () => void;
  /**
   * Nuclear reset: wipe the current user's Firestore doc and snap in-memory
   * state back to INITIAL_STATE. Keeps the anonymous auth uid intact so the
   * user stays signed-in and can immediately use auth-gated pages. Used by
   * the sidebar "נקה נתונים" button (T2).
   */
  resetAllData: () => Promise<void>;
  // ── Provenance / prefill ──────────────────────────────────────────────────
  applyMiningResult: (docId: string, sourceLabel: string, fields: MinedField[]) => void;
  markFieldUserConfirmed: (fieldPath: string) => void;
  /** Lock multiple field paths as manual overrides (questionnaire choke point). */
  commitManual: (fieldPaths: string[]) => void;
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

  // Phase 2 vault migration: backfill draftId + taxYear on legacy documents.
  // Pre-Phase-2 docs floated free — map them to the current draft so the vault
  // redesign can group them. processContext stays undefined (shown as "unlinked").
  if (migrated.documents.length > 0 && migrated.currentDraftId && migrated.drafts) {
    const currentDraft = migrated.drafts[migrated.currentDraftId];
    const currentTaxYear = currentDraft?.taxYear;
    migrated.documents = migrated.documents.map((d) => ({
      ...d,
      draftId: d.draftId ?? migrated.currentDraftId,
      taxYear: d.taxYear ?? currentTaxYear,
    }));
  }
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

  // Stable identity + idempotent: must not produce a new state ref when the
  // step hasn't actually changed. Otherwise the [step] page's useEffect
  // (which depends on setQuestionnaireStep) loops every render, reseeding
  // state on every cycle, which silently aborts in-flight router.push
  // transitions — the symptom is "המשך button does nothing".
  const setQuestionnaireStep = useCallback((step: number) => {
    setState((s) => {
      if (s.questionnaire?.step === step) return s;
      return { ...s, questionnaire: { ...s.questionnaire, step } };
    });
  }, []);

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
        // Land on the actual Dashboard when the user later clicks
        // "תמונת מצב" in the sidebar. Previously this was "upload" →
        // /dashboard rendered <FileDropzone /> (per
        // app/(app)/dashboard/page.tsx:23) and the user perceived it as
        // "still being asked to complete the questionnaire".
        // The questionnaire's handleFinish() pushes to /documents directly,
        // so we don't need currentView to also drive that surface.
        currentView: "dashboard",
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

  const saveDraft = (name: string) =>
    setState((s) => ({
      ...s,
      drafts: {
        ...s.drafts,
        [s.currentDraftId]: {
          ...s.drafts[s.currentDraftId],
          name,
          saved: true,
          updatedAt: new Date().toISOString(),
        },
      },
    }));

  const deleteDraft = (draftId: string) =>
    setState((s) => {
      if (draftId === s.currentDraftId) return s; // cannot delete current
      const { [draftId]: _, ...rest } = s.drafts;
      return { ...s, drafts: rest };
    });

  const allDrafts = Object.values(state.drafts ?? {}).sort((a, b) => b.taxYear - a.taxYear);

  // ── Document vault ────────────────────────────────────────────────────────

  const addDocument = (meta: VaultDocMeta) =>
    setState((s) => {
      const draftId = meta.draftId ?? s.currentDraftId;
      const taxYear = meta.taxYear ?? s.drafts?.[draftId]?.taxYear;
      return {
        ...s,
        documents: [...(s.documents ?? []), { ...meta, draftId, taxYear }],
      };
    });

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

  /**
   * Link a previously-uploaded (pre-Phase-2) document to a process context.
   * Used by "Link to…" action on legacy docs in the vault.
   */
  const linkDocumentToProcess = (
    id: string,
    ctx: { draftId?: string; processContext?: import("@/types").DocProcessContext; relatedFormIds?: import("@/types").DocFormTarget[] },
  ) =>
    setState((s) => ({
      ...s,
      documents: (s.documents ?? []).map((d) => {
        if (d.id !== id) return d;
        const draftId = ctx.draftId ?? d.draftId ?? s.currentDraftId;
        const taxYear = s.drafts?.[draftId]?.taxYear ?? d.taxYear;
        return {
          ...d,
          draftId,
          taxYear,
          processContext: ctx.processContext ?? d.processContext,
          relatedFormIds: ctx.relatedFormIds ?? d.relatedFormIds,
        };
      }),
    }));

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

  // Expanded in T2 to also wipe documents, advisor history, and provenance so
  // stale analyzed-doc metadata from a prior tester doesn't bleed into the
  // next session. Firestore is cleared too — `onAuthStateChanged` will
  // re-hydrate the empty state on next run.
  const discardCurrentDraft = () => {
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
        documents: [],
        advisorHistory: {},
        onboarding: { sources: [], sourcesSelected: false, detailsConfirmed: false },
        questionnaire: { step: 1, completed: false },
        drafts: {
          [draftId]: {
            id: draftId,
            taxYear,
            status: "draft",
            questionnaire: { step: 1, completed: false },
            taxpayer: freshTaxpayer,
            financials: freshFinancials,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    // Fire-and-forget — clearState is itself resilient to no-uid / unconfigured.
    void clearState();
  };

  const resetAllData = useCallback(async () => {
    // Wipe Firestore first so a mid-reset reload can't rehydrate from the
    // prior doc, then clear memory so the UI snaps to empty. We intentionally
    // keep the anon uid — signing out here would strand the session in
    // !user land (onAuthStateChanged's re-anon path can fail silently on
    // popup-blocker / quota / persistence hang), which locks auth-gated pages.
    try {
      await clearState();
    } catch (err) {
      console.warn("[resetAllData] clearState failed:", err);
    }
    setState(INITIAL_STATE);
  }, []);

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
      const now = new Date().toISOString();
      // The override rule (manual wins over re-mining) lives in resolveMinedFields.
      const { taxpayer: nextTaxpayer, financials: nextFinancials, provenance: nextProvenance } =
        resolveMinedFields(
          prev.taxpayer,
          prev.financials,
          prev.provenance ?? {},
          docId,
          sourceLabel,
          fields,
          now,
        );

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
      // Create-if-missing: a value typed from scratch (no prior provenance)
      // must still be locked, or a later mining pass would overwrite it.
      const now = new Date().toISOString();
      const entry = makeManualEntry(fieldPath, now, s.provenance?.[fieldPath]);
      return { ...s, provenance: { ...s.provenance, [fieldPath]: entry } };
    });

  /**
   * Lock multiple field paths as manual overrides in one write. The choke point
   * the questionnaire and other bulk editors call so every manually-entered
   * field — not just those edited through <Field> — is protected from re-mining.
   */
  const commitManual = (fieldPaths: string[]) =>
    setState((s) => {
      if (fieldPaths.length === 0) return s;
      const now = new Date().toISOString();
      return { ...s, provenance: markManualPaths(s.provenance ?? {}, fieldPaths, now) };
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
        saveDraft,
        deleteDraft,
        addDocument,
        removeDocument,
        updateDocumentType,
        updateDocumentStatus,
        linkDocumentToProcess,
        setIncomeSources,
        markSourcesSelected,
        markDetailsConfirmed,
        discardCurrentDraft,
        resetAllData,
        applyMiningResult,
        markFieldUserConfirmed,
        commitManual,
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
