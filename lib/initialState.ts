import type { AppState } from "@/types";

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
  taxYears: [2024],
  employersCount: 0,
  hasForeignBroker: false,
  estimatedRefund: 0,
  insights: [],
  actionItems: [],
};

export const INITIAL_STATE: AppState = {
  currentView: "questionnaire",
  questionnaire: { step: 1, completed: false },

  // ─── Taxpayer ──────────────────────────────────────────────────────────────
  taxpayer: INITIAL_TAXPAYER,

  // ─── Financials ────────────────────────────────────────────────────────────
  financials: INITIAL_FINANCIALS,

  // ─── Multi-draft (P2) ──────────────────────────────────────────────────────
  currentDraftId: "draft-2024",
  drafts: {
    "draft-2024": {
      id: "draft-2024",
      taxYear: 2024,
      status: "draft" as const,
      questionnaire: { step: 1, completed: false },
      taxpayer: INITIAL_TAXPAYER,
      financials: INITIAL_FINANCIALS,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },

  // ─── AI Advisor (P5) ───────────────────────────────────────────────────────
  advisorHistory: {},
};
