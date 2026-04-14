// ─── Core Entities ────────────────────────────────────────────────────────────

export interface Child {
  id: string;
  birthDate: string; // ISO format
  inDaycare?: boolean; // attending licensed daycare / גן ילדים מוכר
}

export interface Degree {
  type: 'BA' | 'MA' | 'PHD';
  institution: string;
  completionYear: number;
}

// Phase 2 ─────────────────────────────────────────────────────────────────────

/** A single employer record for multi-employer coordination (תיאום מס) */
export interface Employer {
  id: string;
  name: string;
  isMainEmployer: boolean;
  /** Number of months worked at this employer in the tax year (1–12) */
  monthsWorked: number;
  /** First month of employment in the tax year (1 = January, 12 = December) */
  startMonth?: number;
  /** Last month of employment in the tax year (1 = January, 12 = December) */
  endMonth?: number;
  // Phase 3 — Form 106 financial values (fields map to form_135_mapping.json)
  /** Field 158 — Gross salary (ברוטו) */
  grossSalary?: number;
  /** Field 042 — Income tax withheld */
  taxWithheld?: number;
  /** Field 045 — Pension deduction */
  pensionDeduction?: number;
}

/**
 * Personal deduction / credit declarations.
 *
 * Credit types (reduce tax directly):
 *   donation_sec46        — Sec. 46: donations to recognised institutions (35% credit)
 *   life_insurance_sec45a — Sec. 45a: private life-insurance premiums (25% credit)
 *   pension_sec47         — Sec. 47: independent pension deposits — salaried (35%, capped ₪10k)
 *   ltc_insurance_sec45a  — Sec. 45a: long-term care insurance (25% credit)
 *   disabled_child_sec45  — Sec. 45: disabled child expenses (credit)
 *   study_fund_sec3e3     — Sec. 3(e3): קרן השתלמות employer contribution (partial credit)
 *   provident_fund_sec47  — Sec. 47: קופת גמל above employer match (35% credit, higher cap for self-employed)
 *   self_employed_pension_sec47 — Sec. 47 self-employed pension: higher cap applies
 *
 * Income-deduction types (reduce taxable income, not direct credit):
 *   alimony_sec9a         — Sec. 9A: alimony paid — full deduction from gross income
 */
export interface PersonalDeduction {
  id: string;
  type:
    | 'donation_sec46'
    | 'life_insurance_sec45a'
    | 'pension_sec47'
    | 'ltc_insurance_sec45a'
    | 'disabled_child_sec45'
    | 'study_fund_sec3e3'
    | 'provident_fund_sec47'
    | 'self_employed_pension_sec47'
    | 'alimony_sec9a';
  amount: number; // ILS
  providerName: string;
}

/** Significant life / employment events that trigger additional tax logic */
export interface LifeEvent {
  changedJobs: boolean;
  pulledSeverancePay: boolean;
  hasForm161: boolean;
  /** Phase 3 — taxable portion of severance (Field 272) */
  taxableSeverancePay?: number;
}

// Phase 3 ─────────────────────────────────────────────────────────────────────

/** Israeli home address (for Form 135 fields 022–024) */
export interface Address {
  city: string;
  street: string;
  houseNumber: string;
}

/** Bank details for refund direct-deposit (Form 135 bank section) */
export interface BankDetails {
  bankId: string;       // e.g. "12" = Hapoalim
  bankName: string;
  branch: string;
  account: string;
}

/** Capital-gains data parsed from an IBKR Activity Statement
 *  ALL VALUES IN ILS — convert from USD using Bank of Israel annual rate before storing. */
export interface CapitalGainsData {
  totalRealizedProfit: number;   // Field 256 — ILS
  totalRealizedLoss: number;     // Field 166 — ILS
  foreignTaxWithheld: number;    // Field 055 — ILS
  dividends?: number;            // ILS-converted dividend income (taxed at 25%)
}

/** The full payload sent to POST /api/generate/form-135 */
export interface Form135Payload {
  taxpayer: TaxPayer;
  financials: FinancialData;
}

// ─── Taxpayer ─────────────────────────────────────────────────────────────────

export interface TaxPayer {
  id: string;
  /** e.g. "123456789" */
  idNumber?: string;
  spouseId?: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  profession: string;
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed';
  spouseHasIncome?: boolean;
  paysAlimony?: boolean;
  children: Child[];
  degrees: Degree[];
  employers: Employer[];
  personalDeductions: PersonalDeduction[];
  lifeEvents: LifeEvent;
  // Phase 3
  address?: Address;
  bank?: BankDetails;
  capitalGains?: CapitalGainsData;
  // ── P3: extended credit-point eligibility ────────────────────────────────
  /** Year of IDF discharge — eligible for 2.0 pts for 3 years post-discharge (male) / 1.75 (female) */
  dischargeYear?: number;
  /** Gender — affects soldier discharge credit (male: 2.0 pts, female: 1.75 pts) */
  gender?: 'male' | 'female';
  /** Date of aliyah (ISO string) — oleh chadash graduated credit: 3→2→1 pts */
  aliyahDate?: string;
  /** ITA-recognized disability classification */
  disabilityType?: DisabilityType;
  /** Disability percentage 0-100 (from ITA/Bituach Leumi) */
  disabilityPercent?: number;
  /** Israeli postcode — used for periphery credit lookup */
  postcode?: string;
  /** True if taxpayer is a kibbutz / moshav member */
  kibbutzMember?: boolean;
}

// ─── Financial / Dashboard Data ───────────────────────────────────────────────

export type DisabilityType = 'work_injury' | 'general' | 'ita_recognized';

export type InsightPillar =
  | 'credit_points'
  | 'coordination'
  | 'deductions'
  | 'severance'
  | 'capital_markets';

export interface TaxInsight {
  id: string;
  pillar: InsightPillar;
  category: 'credit_point' | 'capital_markets' | 'deduction' | 'employer' | 'severance';
  title: string;
  description: string;
  value?: number;
  year?: number;
}

export interface ActionItem {
  id: string;
  label: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  formNumber?: string;
}

export interface FinancialData {
  taxYears: number[];
  employersCount: number;
  hasForeignBroker: boolean;
  brokerName?: string;
  estimatedRefund: number;
  insights: TaxInsight[];
  actionItems: ActionItem[];
  /** Transparent calculation result — populated after questionnaire completion */
  calculationResult?: import("@/lib/calculateTax").CalculationResult;
  /**
   * Raw IBKR parse result (USD + ILS values) — stored after a successful
   * /api/parse/ibkr call so the IbkrAnalysisDashboard can read it from
   * global state without relying on local component state.
   */
  ibkrData?: NonNullable<import("@/types").IbkrParseResponse["data"]>;
}

// ─── Document Vault ───────────────────────────────────────────────────────────

export type VaultDocType =
  | "form106"
  | "form135"
  | "ibkr"
  | "pension"
  | "receipt"
  | "bank_statement"
  | "rsu_grant"
  | "other";

/**
 * Persisted document metadata (no objectUrl — blob URLs are session-only
 * and cannot survive IndexedDB round-trips).
 */
export interface VaultDocMeta {
  id: string;
  name: string;
  type: VaultDocType;
  size: number;
  uploadedAt: string;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AppState {
  currentView: 'questionnaire' | 'upload' | 'dashboard' | 'ibkr';
  questionnaire: {
    step: number;
    completed: boolean;
  };
  taxpayer: TaxPayer;
  financials: FinancialData;
  // ── Document vault ────────────────────────────────────────────────────────
  /** Persisted metadata for all uploaded documents (no blob URLs). */
  documents: VaultDocMeta[];
  // ── Multi-draft (P2) ──────────────────────────────────────────────────────
  currentDraftId: string;
  drafts: Record<string, TaxYearDraft>;
  // ── AI Advisor (P5) ───────────────────────────────────────────────────────
  /** Conversation history per draftId */
  advisorHistory: Record<string, AdvisorMessage[]>;
}

// ─── Multi-Year Drafts (P2) ───────────────────────────────────────────────────

export type DraftStatus = 'draft' | 'submitted' | 'filed' | 'refunded';
export type FilingType = 'salaried' | 'self_employed' | 'mixed';
export type FilingGoal = 'refund' | 'full_return' | 'review';

export interface TaxYearDraft {
  id: string;
  taxYear: number;
  status: DraftStatus;
  filingType?: FilingType;
  filingGoal?: FilingGoal;
  questionnaire: { step: number; completed: boolean; };
  taxpayer: TaxPayer;
  financials: FinancialData;
  createdAt: string;
  updatedAt: string;
}

// ─── API Response Interfaces ──────────────────────────────────────────────────

/** Response from POST /api/parse/ibkr */
export interface IbkrParseResponse {
  success: boolean;
  data?: {
    // ── Raw USD values (for IbkrAnalysisDashboard charts + Tax Shield calc) ──
    /** Sum of positive Realized P/L — USD */
    totalProfitUSD: number;
    /** Sum of absolute negative Realized P/L — USD */
    totalLossUSD: number;
    /** Sum of dividend payments received — USD */
    dividendsUSD: number;
    /** Sum of withholding tax paid abroad (absolute) — USD */
    foreignTaxUSD: number;
    /** USD → ILS constant exchange rate used for conversion */
    exchangeRate: number;
    // ── ILS-converted values (for calculateFullRefund tax engine) ─────────
    /** Sum of positive Realized P/L — ILS (stored in capitalGains) */
    totalRealizedProfit: number;
    /** Sum of absolute negative Realized P/L — ILS (stored in capitalGains) */
    totalRealizedLoss: number;
    /** Sum of withholding tax (absolute) — ILS (stored in capitalGains) */
    foreignTaxWithheld: number;
    /** Sum of dividend income — ILS (stored in capitalGains.dividends) */
    dividendsILS: number;
  };
  error?: string;
}

/** Response from POST /api/parse/form-106 */
export interface Form106ParseResponse {
  success: boolean;
  data?: {
    employerName: string;
    monthsWorked: number;
    /** Field 158 — gross salary */
    grossSalary: number;
    /** Field 042 — income tax withheld */
    taxWithheld: number;
    /** Field 045 — pension deduction */
    pensionDeduction: number;
  };
  error?: string;
}

// ─── Tax Brackets ─────────────────────────────────────────────────────────────

export interface TaxBracket {
  bracket: number;
  rate: number;
  min: number;
  max: number;
}

export interface TaxYearData {
  tax_year: number;
  credit_point_monthly_value: number;
  credit_point_annual_value: number;
  tax_brackets: TaxBracket[];
}
