"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import type { AppState, TaxPayer, FinancialData, TaxYearDraft, FilingType, FilingGoal, AdvisorMessage, VaultDocMeta, VaultDocType } from "@/types";
import { INITIAL_STATE } from "./initialState";
import { calculateFullRefund, buildInsightsFromResult, buildActionItemsFromResult } from "./calculateTax";
import { saveState, loadState } from "./db";

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
  // ── AI Advisor (P5) ───────────────────────────────────────────────────────
  saveAdvisorMessage: (msg: AdvisorMessage) => void;
  advisorMessages: AdvisorMessage[];
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
    const taxYear = ((s.financials as FinancialData)?.taxYears?.[0]) ?? 2024;
    const draftId = `draft-${taxYear}`;
    return {
      ...(s as unknown as Partial<AppState>),
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
  return migrated;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);

  // ── Hydrate from IndexedDB on mount ────────────────────────────────────────
  useEffect(() => {
    loadState().then((stored) => {
      if (stored) {
        const migrated = migrateLegacyState(stored);
        setState(migrated);
      }
      setHydrated(true);
    });
  }, []);

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
      const year = s.financials.taxYears[0] ?? 2024;
      const result = calculateFullRefund(s.taxpayer, year);
      const insights = buildInsightsFromResult(result, s.taxpayer, year);
      const actionItems = buildActionItemsFromResult(result, s.taxpayer);
      return {
        ...s,
        questionnaire: { ...s.questionnaire, completed: true },
        currentView: "upload",
        financials: {
          ...s.financials,
          estimatedRefund: result.netRefund,
          insights,
          actionItems,
          calculationResult: result,
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
      const year = prev.financials.taxYears[0] ?? 2024;
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
    setState((s) => ({
      ...s,
      currentDraftId: draftId,
      currentView: "questionnaire",
      questionnaire: { step: 1, completed: false },
      taxpayer: { ...INITIAL_STATE.taxpayer, id: `taxpayer-${draftId}` },
      financials: { ...INITIAL_STATE.financials, taxYears: [taxYear] },
      drafts: {
        ...s.drafts,
        [draftId]: {
          id: draftId,
          taxYear,
          status: "draft",
          filingType,
          filingGoal,
          questionnaire: { step: 1, completed: false },
          taxpayer: { ...INITIAL_STATE.taxpayer, id: `taxpayer-${draftId}` },
          financials: { ...INITIAL_STATE.financials, taxYears: [taxYear] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
    }));
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
    setState((s) => ({
      ...s,
      documents: (s.documents ?? []).filter((d) => d.id !== id),
    }));

  const updateDocumentType = (id: string, type: VaultDocType) =>
    setState((s) => ({
      ...s,
      documents: (s.documents ?? []).map((d) => d.id === id ? { ...d, type } : d),
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
        saveAdvisorMessage,
        advisorMessages,
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
