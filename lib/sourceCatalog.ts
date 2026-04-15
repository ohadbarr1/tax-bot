import type { IncomeSourceId, VaultDocType } from "@/types";

/**
 * Catalog of income sources surfaced on the onboarding grid. Each source maps
 * to a set of documents the mining pipeline knows how to parse. Editing this
 * file is the canonical way to add a new source — the UI reads everything
 * from here (icon label, doc list, copy strings) so adding "ביטוח לאומי"
 * etc. is a one-file change.
 */
export interface SourceDocRequest {
  /** The document type the user should upload (maps to VaultDocType). */
  type: VaultDocType;
  /** User-facing doc label (Hebrew). */
  label: string;
  /** One-line hint shown under the upload card. */
  hint?: string;
  /** Whether this doc is required for a clean filing (vs "nice to have"). */
  required?: boolean;
}

export interface SourceCatalogEntry {
  id: IncomeSourceId;
  /** Hebrew title shown on the grid chip. */
  label: string;
  /** Short description used in tooltips and the doc-request panel header. */
  blurb: string;
  /** lucide-react icon name — resolved in the component. */
  iconName:
    | "Briefcase"
    | "Home"
    | "UserCheck"
    | "TrendingUp"
    | "Bitcoin"
    | "ShieldCheck"
    | "Globe"
    | "HelpCircle";
  /** Documents required or suggested for this source. */
  docs: SourceDocRequest[];
}

export const SOURCE_CATALOG: SourceCatalogEntry[] = [
  {
    id: "salary",
    label: "משכורת",
    blurb: "הכנסה כשכיר/ה ממעסיק",
    iconName: "Briefcase",
    docs: [
      { type: "form106", label: "טופס 106", hint: "מהמעסיק, לכל שנת המס", required: true },
    ],
  },
  {
    id: "investments",
    label: "השקעות",
    blurb: "רווחי הון, דיבידנדים",
    iconName: "TrendingUp",
    docs: [
      { type: "form867", label: "טופס 867 — בנק/ברוקר ישראלי", hint: "מהבנק או מברוקר ישראלי", required: false },
      { type: "ibkr", label: "Activity Statement — Interactive Brokers", hint: "קובץ CSV שנתי", required: false },
    ],
  },
  {
    id: "rental",
    label: "שכירות",
    blurb: "הכנסה מהשכרת נכס",
    iconName: "Home",
    docs: [
      { type: "rental_contract", label: "חוזה שכירות", hint: "או הצהרה עצמית על שכר דירה", required: true },
    ],
  },
  {
    id: "freelance",
    label: "עצמאי/ת",
    blurb: "עוסק פטור או מורשה",
    iconName: "UserCheck",
    docs: [
      { type: "other", label: "דוח רווח והפסד", hint: "מרואה החשבון או מתוכנה", required: true },
    ],
  },
  {
    id: "crypto",
    label: "קריפטו",
    blurb: "רווחים ממסחר במטבעות קריפטו",
    iconName: "Bitcoin",
    docs: [
      { type: "other", label: "דוח עסקאות", hint: "מהבורסה (Binance, Kraken וכו')", required: false },
    ],
  },
  {
    id: "pension",
    label: "פנסיה",
    blurb: "תשלומי פנסיה, קצבאות",
    iconName: "ShieldCheck",
    docs: [
      { type: "pension", label: "אישור מקבל קצבה", hint: "מקרן הפנסיה", required: true },
    ],
  },
  {
    id: "foreign",
    label: "הכנסה מחו״ל",
    blurb: "שכר / קצבאות / נכסים מחו״ל",
    iconName: "Globe",
    docs: [
      { type: "other", label: "מסמכי הכנסה מחו״ל", hint: "כל מסמך שמתעד את ההכנסה", required: false },
    ],
  },
  {
    id: "unsure",
    label: "לא בטוח/ה",
    blurb: "נעזור לך להבין",
    iconName: "HelpCircle",
    docs: [],
  },
];

export function sourceById(id: IncomeSourceId): SourceCatalogEntry | undefined {
  return SOURCE_CATALOG.find((s) => s.id === id);
}

/** Collect all unique doc types required or suggested by the selected sources. */
export function docsForSources(ids: IncomeSourceId[]): SourceDocRequest[] {
  const seen = new Set<VaultDocType>();
  const out: SourceDocRequest[] = [];
  for (const id of ids) {
    const entry = sourceById(id);
    if (!entry) continue;
    for (const doc of entry.docs) {
      if (seen.has(doc.type)) continue;
      seen.add(doc.type);
      out.push(doc);
    }
  }
  return out;
}
