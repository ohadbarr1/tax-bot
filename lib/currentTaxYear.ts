/**
 * lib/currentTaxYear.ts
 *
 * Single source of truth for "what year is the user filing for?". Used
 * wherever the app needs to default a taxYear field — initial state,
 * createDraft fallback, migration fallback, etc.
 *
 * Israel's tax year is the calendar year. Annual returns for year N are due
 * by April 30 of year N+1 (with routine extensions). So on any given date
 * the "current filing year" is the previous calendar year — if you're filing
 * in 2026, you're filing for 2025.
 *
 * This function returns that "filing year", not the current calendar year.
 *
 * Supported years are constrained by `data/tax_brackets_2024_2025.json`
 * (calculateTax.ts only accepts `2024 | 2025`), so we clamp to that range.
 */
export type SupportedTaxYear = 2024 | 2025;

export function currentTaxYear(now: Date = new Date()): SupportedTaxYear {
  const prev = now.getFullYear() - 1;
  if (prev <= 2024) return 2024;
  if (prev >= 2025) return 2025;
  return 2025;
}
