/**
 * provenance.ts — the override contract (loop T0.2).
 *
 * Manual input is the source of truth. These pure helpers own the single rule
 * the whole app depends on: a user-confirmed (manual) field is NEVER overwritten
 * by a document-mining pass. Extracted from appContext so it is unit-testable in
 * isolation and so the calc / PDF / summary layers can all reason about it.
 */

import type {
  TaxPayer,
  FinancialData,
  FieldProvenance,
  MinedField,
} from "@/types";

/** Sentinel doc id for a value the user typed by hand (never mined). */
export const MANUAL_DOC_ID = "manual";
/** User-facing label for a hand-entered value. */
export const MANUAL_LABEL = "הזנה ידנית";

/**
 * Immutably sets `root[path] = value`, where path is a dot-path that may include
 * numeric array indices (e.g. "taxpayer.employers[0].grossSalary"). Creates
 * intermediate arrays/objects as needed.
 */
export function setPath<T>(root: T, path: string, value: unknown): T {
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
    const obj = (node && typeof node === "object"
      ? { ...(node as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    obj[idx as string] = last ? value : rec(obj[idx as string], i + 1);
    return obj;
  };
  return rec(root, 0) as T;
}

/** Read `root[path]` for a dot-path with numeric array indices. */
export function getPath(root: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = root;
  for (const s of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return cur;
}

/**
 * Restore every user-confirmed (manual) leaf value from the PREVIOUS state onto
 * a freshly document-merged state. This is the enforcement point for document
 * writes: no matter how coarse the incoming patch (whole `employers` array,
 * whole `capitalGains` object), a locked field keeps the user's value.
 * Pure.
 */
export function preserveManual(
  prevTaxpayer: TaxPayer,
  prevFinancials: FinancialData,
  nextTaxpayer: TaxPayer,
  nextFinancials: FinancialData,
  provenance: Record<string, FieldProvenance>,
): { taxpayer: TaxPayer; financials: FinancialData } {
  let taxpayer = nextTaxpayer;
  let financials = nextFinancials;
  for (const [path, p] of Object.entries(provenance ?? {})) {
    if (!p.userConfirmed) continue;
    if (path.startsWith("taxpayer.")) {
      const leaf = path.slice("taxpayer.".length);
      taxpayer = setPath(taxpayer, leaf, getPath(prevTaxpayer, leaf));
    } else if (path.startsWith("financials.")) {
      const leaf = path.slice("financials.".length);
      financials = setPath(financials, leaf, getPath(prevFinancials, leaf));
    }
  }
  return { taxpayer, financials };
}

/** True if a provenance entry represents a manual override (user-confirmed). */
export function isManual(entry?: FieldProvenance): boolean {
  return !!entry?.userConfirmed;
}

/** True if the value was hand-entered with no document lineage at all. */
export function isPureManual(entry?: FieldProvenance): boolean {
  return !!entry?.userConfirmed && entry.sourceDocId === MANUAL_DOC_ID;
}

/**
 * Build/refresh a provenance entry marking a field as a manual override.
 * If a prior (document) entry exists, keep its lineage so the UI can show
 * "manual — overrode <label>"; otherwise stamp a pure manual entry.
 */
export function makeManualEntry(
  fieldPath: string,
  now: string,
  existing?: FieldProvenance,
): FieldProvenance {
  if (existing) {
    return { ...existing, userConfirmed: true, minedAt: now };
  }
  return {
    fieldPath,
    sourceDocId: MANUAL_DOC_ID,
    sourceLabel: MANUAL_LABEL,
    confidence: "high",
    userConfirmed: true,
    minedAt: now,
  };
}

/**
 * Mark one or more field paths as manually confirmed (the override lock).
 * Works for mined-then-edited fields AND typed-from-scratch fields. Pure.
 */
export function markManualPaths(
  provenance: Record<string, FieldProvenance>,
  fieldPaths: string[],
  now: string,
): Record<string, FieldProvenance> {
  const next = { ...provenance };
  for (const p of fieldPaths) {
    next[p] = makeManualEntry(p, now, next[p]);
  }
  return next;
}

/**
 * Resolve a mining result into the next taxpayer / financials / provenance,
 * honoring the override rule: a user-confirmed field is never overwritten.
 * Pure — the caller owns recalculation and persistence.
 */
export function resolveMinedFields(
  taxpayer: TaxPayer,
  financials: FinancialData,
  provenance: Record<string, FieldProvenance>,
  docId: string,
  sourceLabel: string,
  fields: MinedField[],
  now: string,
): {
  taxpayer: TaxPayer;
  financials: FinancialData;
  provenance: Record<string, FieldProvenance>;
} {
  let nextTaxpayer = taxpayer;
  let nextFinancials = financials;
  const nextProvenance = { ...provenance };

  // Employer-conflict resolve: the miner always emits `employers[0]`, but the
  // user may already have that employer from a prior upload. Match by name and
  // rewrite the field paths to the matched (or next-free) index.
  const employerNameField = fields.find(
    (f) => f.fieldPath === "taxpayer.employers[0].name",
  );
  let resolvedEmployerIdx = 0;
  if (employerNameField && typeof employerNameField.value === "string") {
    const minedName = employerNameField.value.trim().toLowerCase();
    const existing = nextTaxpayer.employers ?? [];
    const matchIdx = existing.findIndex(
      (e) =>
        (e.name ?? "").trim().toLowerCase() === minedName &&
        minedName.length > 0,
    );
    resolvedEmployerIdx = matchIdx >= 0 ? matchIdx : existing.length;
  }

  const rewritePath = (path: string): string =>
    resolvedEmployerIdx === 0
      ? path
      : path.replace(
          /^taxpayer\.employers\[0\]/,
          `taxpayer.employers[${resolvedEmployerIdx}]`,
        );

  for (const f of fields) {
    const targetPath = rewritePath(f.fieldPath);
    const existing = nextProvenance[targetPath];
    // ── The override rule ──
    if (existing?.userConfirmed) continue;

    if (targetPath.startsWith("taxpayer.")) {
      nextTaxpayer = setPath(
        nextTaxpayer,
        targetPath.slice("taxpayer.".length),
        f.value,
      );
    } else if (targetPath.startsWith("financials.")) {
      nextFinancials = setPath(
        nextFinancials,
        targetPath.slice("financials.".length),
        f.value,
      );
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

  return {
    taxpayer: nextTaxpayer,
    financials: nextFinancials,
    provenance: nextProvenance,
  };
}
