import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Employer } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Determine whether any two employers have overlapping employment periods.
 * Uses startMonth/endMonth when available; falls back to monthsWorked if not.
 *
 * Two ranges [aStart, aEnd] and [bStart, bEnd] overlap iff aStart ≤ bEnd AND bStart ≤ aEnd.
 */
export function employersOverlap(employers: Employer[]): boolean {
  if (employers.length < 2) return false;

  for (let i = 0; i < employers.length; i++) {
    for (let j = i + 1; j < employers.length; j++) {
      const a = employers[i];
      const b = employers[j];

      const aStart = a.startMonth ?? 1;
      const aEnd   = a.endMonth   ?? (a.startMonth != null
        ? Math.min(a.startMonth + a.monthsWorked - 1, 12)
        : 12);
      const bStart = b.startMonth ?? 1;
      const bEnd   = b.endMonth   ?? (b.startMonth != null
        ? Math.min(b.startMonth + b.monthsWorked - 1, 12)
        : 12);

      if (aStart <= bEnd && bStart <= aEnd) return true;
    }
  }
  return false;
}

/**
 * Parse a numeric form-input value, returning `undefined` for empty/blank AND
 * for non-numeric input (so `Number("abc")` → undefined, never NaN). Prevents
 * NaN from entering state and surfacing as "NaN ₪" in the calc/dashboard (T7.1).
 */
export function numField(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Coerce any value to a finite number, falling back to 0. Defensive display guard. */
export function finiteOr0(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
