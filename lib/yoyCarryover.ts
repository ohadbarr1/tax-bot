import type { TaxPayer, TaxYearDraft, FieldProvenance } from "@/types";
import { INITIAL_STATE } from "./initialState";

/**
 * Year-over-year carry-forward.
 *
 * When a user starts a new draft for tax year N, most personal details from
 * year N-1 still apply: name, ID, address, bank, marital status, children,
 * degrees, aliyah date, discharge year, etc. Employers, deductions, life
 * events, and capital gains are year-specific and must NOT be carried.
 *
 * This module picks the most recent prior-year draft (if any) and returns a
 * blended TaxPayer plus a provenance map tagging every carried field as
 * coming from the prior year — so the details page shows a distinctive pill
 * and the user can undo any stale value with one click.
 */

// Fields that persist year-over-year and should be carried forward.
const PERSISTENT_SCALAR_FIELDS = [
  "idNumber",
  "firstName",
  "lastName",
  "fullName",
  "profession",
  "maritalStatus",
  "spouseId",
  "spouseHasIncome",
  "paysAlimony",
  "dischargeYear",
  "gender",
  "aliyahDate",
  "disabilityType",
  "disabilityPercent",
  "postcode",
  "kibbutzMember",
] as const satisfies readonly (keyof TaxPayer)[];

type PersistentField = (typeof PERSISTENT_SCALAR_FIELDS)[number];

export interface CarryForwardResult {
  taxpayer: TaxPayer;
  provenance: Record<string, FieldProvenance>;
  sourceDraftId: string | null;
  sourceTaxYear: number | null;
}

export function carryForwardFromPriorDraft(
  drafts: Record<string, TaxYearDraft> | undefined,
  newTaxYear: number,
  newDraftId: string
): CarryForwardResult {
  const fresh: TaxPayer = { ...INITIAL_STATE.taxpayer, id: `taxpayer-${newDraftId}` };
  const empty: CarryForwardResult = {
    taxpayer: fresh,
    provenance: {},
    sourceDraftId: null,
    sourceTaxYear: null,
  };

  if (!drafts) return empty;
  const prior = Object.values(drafts)
    .filter((d) => d.taxYear < newTaxYear)
    .sort((a, b) => b.taxYear - a.taxYear)[0];
  if (!prior) return empty;

  const src = prior.taxpayer;
  const next: TaxPayer = { ...fresh };
  const provenance: Record<string, FieldProvenance> = {};
  const now = new Date().toISOString();
  const sourceDocId = `prior-year:${prior.taxYear}`;
  const sourceLabel = `משנת ${prior.taxYear}`;

  const markProv = (fieldPath: string) => {
    provenance[fieldPath] = {
      fieldPath,
      sourceDocId,
      sourceLabel,
      confidence: "high",
      minedAt: now,
    };
  };

  // Scalar fields — copy value and tag provenance.
  for (const key of PERSISTENT_SCALAR_FIELDS) {
    const v = src[key];
    if (v === undefined || v === null || v === "") continue;
    (next as Record<PersistentField, unknown>)[key] = v;
    markProv(`taxpayer.${key}`);
  }

  // Address — persistent.
  if (src.address && (src.address.city || src.address.street)) {
    next.address = { ...src.address };
    markProv("taxpayer.address.city");
    markProv("taxpayer.address.street");
    markProv("taxpayer.address.houseNumber");
  }

  // Bank — persistent.
  if (src.bank && src.bank.account) {
    next.bank = { ...src.bank };
    markProv("taxpayer.bank.bankId");
    markProv("taxpayer.bank.bankName");
    markProv("taxpayer.bank.branch");
    markProv("taxpayer.bank.account");
  }

  // Children — carry, but the UI should let the user bump ages / remove.
  if (src.children && src.children.length > 0) {
    next.children = src.children.map((c) => ({ ...c }));
    src.children.forEach((_c, i) => {
      markProv(`taxpayer.children[${i}].birthDate`);
      markProv(`taxpayer.children[${i}].inDaycare`);
    });
  }

  // Degrees — persistent.
  if (src.degrees && src.degrees.length > 0) {
    next.degrees = src.degrees.map((d) => ({ ...d }));
    src.degrees.forEach((_d, i) => {
      markProv(`taxpayer.degrees[${i}].type`);
      markProv(`taxpayer.degrees[${i}].institution`);
      markProv(`taxpayer.degrees[${i}].completionYear`);
    });
  }

  return {
    taxpayer: next,
    provenance,
    sourceDraftId: prior.id,
    sourceTaxYear: prior.taxYear,
  };
}
