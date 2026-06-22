/**
 * summary.ts — Output 1: a full, organized read-only summary of everything the
 * user provided, with each value's SOURCE (manual vs document) resolved from the
 * provenance map. Manual input is the source of truth, and where a manual value
 * overrode a mined document value, that is shown explicitly.
 *
 * Pure + testable; the SummaryView component renders these structures.
 */

import { MANUAL_DOC_ID } from "./provenance";
import type { TaxPayer, FieldProvenance } from "@/types";

export interface SummaryRow {
  label: string;
  value: string;
  /** Dot-path used to look up the field's provenance badge. */
  path: string;
}
export interface SummarySection {
  title: string;
  rows: SummaryRow[];
}

export interface SourceBadge {
  label: string;
  /** True when the value is the user's manual input (source of truth). */
  manual: boolean;
  /** True when a manual value overrode a previously-mined document value. */
  overrode: boolean;
}

/** Resolve how a field's value should be attributed in the summary. */
export function sourceBadge(entry?: FieldProvenance): SourceBadge {
  if (!entry) return { label: "הזנה ידנית", manual: true, overrode: false };
  if (entry.userConfirmed) {
    if (entry.sourceDocId && entry.sourceDocId !== MANUAL_DOC_ID) {
      return { label: `ידני · גובר על ${entry.sourceLabel}`, manual: true, overrode: true };
    }
    return { label: "הזנה ידנית", manual: true, overrode: false };
  }
  return { label: entry.sourceLabel || "מסמך", manual: false, overrode: false };
}

const ils = (n?: number) =>
  n === undefined || n === null || !Number.isFinite(n)
    ? ""
    : "₪" + Math.round(n).toLocaleString("he-IL");

const MARITAL: Record<string, string> = {
  single: "רווק/ה",
  married: "נשוי/אה",
  divorced: "גרוש/ה",
  widowed: "אלמן/ה",
};
const DEGREE: Record<string, string> = { BA: "תואר ראשון", MA: "תואר שני", PHD: "דוקטורט" };
const DEDUCTION: Record<string, string> = {
  donation_sec46: "תרומות (§46)",
  life_insurance_sec45a: "ביטוח חיים (§45א)",
  pension_sec47: "פנסיה (§47)",
  ltc_insurance_sec45a: "ביטוח סיעודי (§45א)",
  disabled_child_sec45: "ילד נטול יכולת (§45)",
  study_fund_sec3e3: "קרן השתלמות (§3(ה)(3))",
  provident_fund_sec47: "קופת גמל (§47)",
  self_employed_pension_sec47: "פנסיה עצמאי (§47)",
  alimony_sec9a: "מזונות (§9א)",
};

/** Build the grouped, source-attributable summary. Only rows with a value appear. */
export function buildSummary(taxpayer: TaxPayer): SummarySection[] {
  const t = taxpayer;
  const sections: SummarySection[] = [];
  const push = (rows: SummaryRow[]) => rows.filter((r) => r.value !== "" && r.value != null);

  // Personal
  const fullName = [t.firstName, t.lastName].filter(Boolean).join(" ").trim();
  const addr = t.address?.city
    ? `${t.address.street || ""} ${t.address.houseNumber || ""}, ${t.address.city}`.trim()
    : "";
  const bankLabel = t.bank?.bankName
    ? `${t.bank.bankName}${t.bank.account ? " · חשבון •••" + t.bank.account.slice(-3) : ""}`
    : "";
  sections.push({
    title: "פרטים אישיים",
    rows: push([
      { label: "שם מלא", value: fullName, path: "taxpayer.firstName" },
      { label: "תעודת זהות", value: t.idNumber || "", path: "taxpayer.idNumber" },
      { label: "כתובת", value: addr, path: "taxpayer.address.city" },
      { label: "בנק להחזר", value: bankLabel, path: "taxpayer.bank.account" },
    ]),
  });

  // Family
  const familyRows: SummaryRow[] = [
    { label: "מצב משפחתי", value: MARITAL[t.maritalStatus] || "", path: "taxpayer.maritalStatus" },
  ];
  if (t.maritalStatus === "married") {
    const spouseName = [t.spouse?.firstName, t.spouse?.lastName].filter(Boolean).join(" ").trim();
    familyRows.push({ label: "בן/בת זוג", value: spouseName, path: "taxpayer.spouse.firstName" });
    familyRows.push({ label: "ת״ז בן/בת זוג", value: t.spouse?.idNumber || "", path: "taxpayer.spouse.idNumber" });
    familyRows.push({ label: "לבן/בת הזוג הכנסה", value: t.spouseHasIncome ? "כן" : "לא", path: "taxpayer.spouseHasIncome" });
    if (t.spouse?.income) familyRows.push({ label: "הכנסת בן/בת הזוג (חישוב נפרד §66)", value: ils(t.spouse.income), path: "taxpayer.spouse.income" });
  }
  if (t.paysAlimony) {
    familyRows.push({ label: "תשלום מזונות", value: "כן", path: "taxpayer.paysAlimony" });
  }
  (t.children ?? []).forEach((c, i) => {
    familyRows.push({
      label: `ילד/ה ${i + 1}`,
      value: c.birthDate ? `נולד/ה ${c.birthDate}` : "",
      path: `taxpayer.children[${i}].birthDate`,
    });
  });
  sections.push({ title: "מצב משפחתי", rows: push(familyRows) });

  // Education
  if ((t.degrees ?? []).length > 0) {
    sections.push({
      title: "השכלה",
      rows: push(
        t.degrees.map((d: { type: string; institution: string; completionYear: number }, i) => ({
          label: DEGREE[d.type] || d.type,
          value: [d.institution, d.completionYear].filter(Boolean).join(" · "),
          path: `taxpayer.degrees[${i}].institution`,
        })),
      ),
    });
  }

  // Employers
  const empRows: SummaryRow[] = [];
  (t.employers ?? []).forEach((e, i) => {
    if (!e.name && e.grossSalary == null && e.taxWithheld == null) return;
    empRows.push({ label: `מעסיק ${i + 1}${e.isMainEmployer ? " (עיקרי)" : ""}`, value: e.name || "—", path: `taxpayer.employers[${i}].name` });
    if (e.grossSalary != null) empRows.push({ label: "  ברוטו", value: ils(e.grossSalary), path: `taxpayer.employers[${i}].grossSalary` });
    if (e.taxWithheld != null) empRows.push({ label: "  מס שנוכה", value: ils(e.taxWithheld), path: `taxpayer.employers[${i}].taxWithheld` });
    if (e.pensionDeduction != null) empRows.push({ label: "  ניכוי פנסיה", value: ils(e.pensionDeduction), path: `taxpayer.employers[${i}].pensionDeduction` });
  });
  if (empRows.length) sections.push({ title: "הכנסה מעבודה", rows: empRows });

  // Capital
  const cg = t.capitalGains;
  if (cg) {
    sections.push({
      title: "שוק ההון",
      rows: push([
        { label: "רווח הון", value: ils(cg.totalRealizedProfit), path: "taxpayer.capitalGains.totalRealizedProfit" },
        { label: "הפסד הון", value: ils(cg.totalRealizedLoss), path: "taxpayer.capitalGains.totalRealizedLoss" },
        { label: "דיבידנדים", value: ils(cg.dividends), path: "taxpayer.capitalGains.dividends" },
        { label: "מס זר שנוכה", value: ils(cg.foreignTaxWithheld), path: "taxpayer.capitalGains.foreignTaxWithheld" },
      ]),
    });
  }
  if (t.controllingShareholder || (t.capitalGains?.dividends ?? 0) > 0) {
    const capExtra: SummaryRow[] = [];
    if (t.controllingShareholder) capExtra.push({ label: "בעל מניות מהותי", value: "כן", path: "taxpayer.controllingShareholder" });
    if (t.dividendType) capExtra.push({ label: "סיווג דיבידנד", value: t.dividendType === "redemption_141" ? "פדיון (141)" : "רגיל (117)", path: "taxpayer.dividendType" });
    if (capExtra.length) sections.push({ title: "מניות ודיבידנד", rows: capExtra });
  }

  // Deductions
  if ((t.personalDeductions ?? []).length > 0) {
    sections.push({
      title: "ניכויים וזיכויים",
      rows: push(
        t.personalDeductions.map((dd, i) => ({
          label: DEDUCTION[dd.type] || dd.type,
          value: ils(dd.amount) + (dd.providerName ? ` · ${dd.providerName}` : ""),
          path: `taxpayer.personalDeductions[${i}].amount`,
        })),
      ),
    });
  }

  // Life events
  const le = t.lifeEvents;
  if (le) {
    const leRows: SummaryRow[] = [];
    if (le.changedJobs) leRows.push({ label: "החלפת מקום עבודה", value: "כן", path: "taxpayer.lifeEvents.changedJobs" });
    if (le.pulledSeverancePay) leRows.push({ label: "משיכת פיצויי פרישה", value: "כן", path: "taxpayer.lifeEvents.pulledSeverancePay" });
    if (le.hasForm161) leRows.push({ label: "טופס 161", value: "קיים", path: "taxpayer.lifeEvents.hasForm161" });
    if (leRows.length) sections.push({ title: "אירועי חיים", rows: leRows });
  }

  // Credit-point inputs
  const cpRows: SummaryRow[] = [
    { label: "מין", value: t.gender === "male" ? "זכר" : t.gender === "female" ? "נקבה" : "", path: "taxpayer.gender" },
    { label: "שנת שחרור מצה״ל", value: t.dischargeYear ? String(t.dischargeYear) : "", path: "taxpayer.dischargeYear" },
    { label: "תאריך עלייה", value: t.aliyahDate || "", path: "taxpayer.aliyahDate" },
    { label: "יישוב", value: t.postcode || "", path: "taxpayer.postcode" },
    { label: "חבר קיבוץ", value: t.kibbutzMember ? "כן" : "", path: "taxpayer.kibbutzMember" },
    { label: "אחוז נכות", value: t.disabilityPercent ? `${t.disabilityPercent}%` : "", path: "taxpayer.disabilityPercent" },
  ];
  sections.push({ title: "נקודות זיכוי", rows: push(cpRows) });

  return sections.filter((s) => s.rows.length > 0);
}
