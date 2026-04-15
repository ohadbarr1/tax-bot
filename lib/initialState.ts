import type { AppState } from "@/types";
import { currentTaxYear } from "./currentTaxYear";

// Compute at module-load time: the app reloads whenever the year rolls over
// in any practical sense (page refresh). Keeping this as a const avoids
// scattering `new Date()` calls through the state tree.
const DEFAULT_TAX_YEAR = currentTaxYear();

// ─── Blank initial taxpayer — no PII, no pre-populated data ──────────────────
export const INITIAL_TAXPAYER = {
  id: "taxpayer-new",
  idNumber: "",
  firstName: "",
  lastName: "",
  fullName: "",
  profession: "",
  maritalStatus: "single" as const,
  spouseHasIncome: false,
  children: [],
  degrees: [],
  employers: [],
  personalDeductions: [],
  lifeEvents: {
    changedJobs: false,
    pulledSeverancePay: false,
    hasForm161: false,
  },
  address: { city: "", street: "", houseNumber: "" },
  bank: { bankId: "", bankName: "", branch: "", account: "" },
};

// ─── Blank initial financials — all zeros, no pre-baked insights ─────────────
export const INITIAL_FINANCIALS = {
  taxYears: [DEFAULT_TAX_YEAR],
  employersCount: 0,
  hasForeignBroker: false,
  estimatedRefund: 0,
  insights: [],
  actionItems: [],
};

const DEFAULT_DRAFT_ID = `draft-${DEFAULT_TAX_YEAR}`;

export const INITIAL_STATE: AppState = {
  currentView: "onboarding",
  questionnaire: { step: 1, completed: false },

  // ─── User preferences (opt-in, off by default) ────────────────────────────
  preferences: { notifyOnRefundUpdates: false },

  // ─── Onboarding (new paradigm) ────────────────────────────────────────────
  onboarding: { sources: [], sourcesSelected: false, detailsConfirmed: false },

  // ─── Taxpayer ──────────────────────────────────────────────────────────────
  taxpayer: INITIAL_TAXPAYER,

  // ─── Financials ────────────────────────────────────────────────────────────
  financials: INITIAL_FINANCIALS,

  // ─── Per-field provenance (prefill trust layer) ───────────────────────────
  provenance: {},

  // ─── Multi-draft (P2) ──────────────────────────────────────────────────────
  currentDraftId: DEFAULT_DRAFT_ID,
  drafts: {
    [DEFAULT_DRAFT_ID]: {
      id: DEFAULT_DRAFT_ID,
      taxYear: DEFAULT_TAX_YEAR,
      status: "draft" as const,
      questionnaire: { step: 1, completed: false },
      taxpayer: INITIAL_TAXPAYER,
      financials: INITIAL_FINANCIALS,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },

  // ─── Document vault ───────────────────────────────────────────────────────
  documents: [],

  // ─── AI Advisor (P5) ───────────────────────────────────────────────────────
  advisorHistory: {},
};
