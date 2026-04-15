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
  | "form867"         // broker statement (Israeli)
  | "ibkr"            // Interactive Brokers CSV
  | "pension"
  | "receipt"
  | "bank_statement"
  | "rsu_grant"
  | "rental_contract"
  | "other";

/** Status of a document in the new mining pipeline. */
export type VaultDocStatus =
  | "pending_upload"  // user deferred upload ("I'll upload later")
  | "uploaded"        // blob arrived, mining queued
  | "mining"          // Claude vision / Tesseract in flight
  | "mined"           // extraction finished, fields written to state
  | "failed";         // extraction errored (retry available)

/**
 * Persisted payload from a successful parse — discriminated on kind so we
 * can rehydrate the parsing UI (summary cards, raw fields) on reload
 * without re-running the server-side extractor.
 */
export type VaultDocParsedPayload =
  | { kind: "form106"; data: NonNullable<Form106ParseResponse["data"]> }
  | { kind: "ibkr";    data: NonNullable<IbkrParseResponse["data"]> };

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
  status?: VaultDocStatus;
  /** Income-source tag(s) this doc belongs to (e.g. ["salary"], ["investments"]). */
  sourceIds?: IncomeSourceId[];
  /** Server-side storage path in Firebase Storage, if uploaded. */
  storagePath?: string;
  /** Signed download URL for the raw file (refreshable via getDownloadURL). */
  downloadUrl?: string;
  /** Parsed JSON payload — rehydrated into the UI on reload. */
  parsedPayload?: VaultDocParsedPayload;
  /** Last mining error (user-facing, Hebrew). */
  miningError?: string;
}

// ─── Income Sources (new onboarding paradigm) ────────────────────────────────

/** A tag on the income-source grid. Extensible — add entries here + to sourceCatalog.ts. */
export type IncomeSourceId =
  | "salary"
  | "rental"
  | "freelance"
  | "investments"
  | "crypto"
  | "pension"
  | "foreign"
  | "unsure";

// ─── Field Provenance (prefill trust layer) ──────────────────────────────────

/**
 * Trust tier for a prefilled value. Never shown as a raw percentage — the UI
 * renders one of three visual states (normal / amber underline / empty).
 */
export type ProvenanceConfidence = "high" | "medium" | "low";

/**
 * Source of a prefilled field value. Attached to any field the doc-mining
 * pipeline writes so the user can see "this came from your Form 106" and
 * click through to the scan region.
 */
export interface FieldProvenance {
  /** Dot-path of the field in TaxPayer/FinancialData (e.g. "taxpayer.idNumber"). */
  fieldPath: string;
  /** Document that produced this value. */
  sourceDocId: string;
  /** User-facing doc label (e.g. "טופס 106 — מעסיק א'"). */
  sourceLabel: string;
  /** Trust tier — NEVER displayed as a percentage. */
  confidence: ProvenanceConfidence;
  /** Optional bounding box on the source doc image (px coordinates). */
  bbox?: { x: number; y: number; w: number; h: number; page?: number };
  /** True once the user has manually edited this field — locks it from re-mining overwrite. */
  userConfirmed?: boolean;
  /** ISO timestamp when the value was written. */
  minedAt: string;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AppState {
  currentView: 'onboarding' | 'details' | 'dashboard' | 'ibkr' | 'questionnaire' | 'upload';
  questionnaire: {
    step: number;
    completed: boolean;
  };
  // ── Onboarding (new paradigm) ─────────────────────────────────────────────
  onboarding: {
    /** Income sources the user selected on the first screen. */
    sources: IncomeSourceId[];
    /** Whether the initial source selection has been done (gate for /welcome). */
    sourcesSelected: boolean;
    /** Whether the user has confirmed the prefilled details page. */
    detailsConfirmed: boolean;
  };
  taxpayer: TaxPayer;
  financials: FinancialData;
  /**
   * Per-field provenance map, keyed by dot-path
   * (e.g. "taxpayer.idNumber", "taxpayer.employers[0].grossSalary").
   * Parallel to taxpayer/financials — keeps those types lean while allowing
   * the UI to show a source pill next to any prefilled value.
   */
  provenance: Record<string, FieldProvenance>;
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

// ─── Doc Mining (Claude vision) ──────────────────────────────────────────────

/**
 * A single field extracted from a document by the mining pipeline. The server
 * picks the target path; the client writes to taxpayer/financials via
 * applyMiningResult() and records a FieldProvenance entry for each field.
 */
export interface MinedField {
  /** Dot-path into AppState where the value should be written. */
  fieldPath: string;
  /** The extracted raw value (string, number, or nested object). */
  value: unknown;
  /** Trust tier — never shown to users as a %. */
  confidence: ProvenanceConfidence;
  /** Optional scanned-region bbox. */
  bbox?: { x: number; y: number; w: number; h: number; page?: number };
}

/** Response from POST /api/mine/document */
export interface DocMineResponse {
  success: boolean;
  data?: {
    /** The document type the miner detected (may differ from user-supplied type). */
    detectedType: VaultDocType;
    /** Extracted fields, each with its target path + confidence. */
    fields: MinedField[];
    /** Optional natural-language summary for the advisor nudge rail. */
    summary?: string;
    /** Which mining backend produced this (for debugging). */
    backend: "claude-vision" | "tesseract" | "ibkr-csv";
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
