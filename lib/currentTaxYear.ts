/**
 * lib/currentTaxYear.ts
 *
 * Single source of truth for "what year is the user filing for?". Used
 * wherever the app needs to default a taxYear field — initial state,
 * createDraft fallback, migration fallback, etc.
 *
 * Israel's tax year is the calendar year. Annual returns for year N are due
 * by April 30 of year N+1 (with routine extensions). Per סעיף 160(א) the
 * user has 6 years to claim a refund — so on 2026-04-29 the claimable years
 * are 2020 through 2025.
 *
 * This function returns the most-recent "filing year" (calendar year − 1),
 * clamped into the supported range. The caller can iterate `SUPPORTED_TAX_YEARS`
 * for the full claim window.
 *
 * Phase 1 §1.B (audit F-031): supported years extended from `2024 | 2025`
 * to `2020 | 2021 | 2022 | 2023 | 2024 | 2025`.
 */
export type SupportedTaxYear = 2020 | 2021 | 2022 | 2023 | 2024 | 2025;

export const SUPPORTED_TAX_YEARS: readonly SupportedTaxYear[] = [
  2020, 2021, 2022, 2023, 2024, 2025,
] as const;

const MIN_YEAR: SupportedTaxYear = 2020;
const MAX_YEAR: SupportedTaxYear = 2025;

export function currentTaxYear(now: Date = new Date()): SupportedTaxYear {
  const prev = now.getFullYear() - 1;
  if (prev <= MIN_YEAR) return MIN_YEAR;
  if (prev >= MAX_YEAR) return MAX_YEAR;
  return prev as SupportedTaxYear;
}

/**
 * Type guard: is `year` a year the engine fully supports?
 */
export function isSupportedTaxYear(year: number): year is SupportedTaxYear {
  return (SUPPORTED_TAX_YEARS as readonly number[]).includes(year);
}
