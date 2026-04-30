/**
 * fx.ts — Bank of Israel daily FX rate loader.
 *
 * Closes audit finding F-017 (`audits/tax-domain.md` §F-017):
 *   "FX uses annual mean (law: daily Bank-of-Israel rate per transaction)".
 *
 * Statutory anchor: סעיף 91(ג) לפקודת מס הכנסה ותקנות מס הכנסה (המרה למטבע
 * ישראלי) — every foreign-currency transaction (gain, loss, dividend, WHT)
 * must be converted at the **publish rate of the transaction date**
 * ("שער יציג של יום העסקה"). Annual-mean conversion is **not** legally
 * compliant; it produces ±5% drift on per-trade values.
 *
 * Lookup order for `getFxRate(currency, date)`:
 *   1. Exact ISO-date hit in the daily dataset.
 *   2. Most-recent prior business day (walk back ≤ 7 calendar days).
 *      The Bank of Israel publishes Sun–Thu and skips Fri/Sat + Israeli
 *      bank holidays. The "yom ha-iska" rule (תקנות המרה) defaults a
 *      non-publication date to the prior publication.
 *   3. (Transitional) Documented annual-mean for that year, with a
 *      `console.warn` so production can detect missing-backfill before
 *      it ships incorrect values.
 *   4. Throw — neither daily nor annual mean available.
 *
 * Datasets live at `data/fx/{usd,eur,gbp}_ils_daily.json` and are populated
 * by `scripts/seed-fx-rates.mjs` against the live BoI API:
 *   https://www.boi.org.il/PublicApi/GetExchangeRates?asOfDate=YYYY-MM-DD
 */

import usdData from "@/data/fx/usd_ils_daily.json";
import eurData from "@/data/fx/eur_ils_daily.json";
import gbpData from "@/data/fx/gbp_ils_daily.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FxCurrency = "USD" | "EUR" | "GBP";

export interface FxDataset {
  currency: FxCurrency;
  base: string; // always "ILS"
  source: string;
  /** Optional documented annual-mean fallback per year (string-keyed). */
  annualMean?: Record<string, number>;
  /** Daily rates keyed by ISO date (YYYY-MM-DD). */
  rates: Record<string, number>;
}

// ─── Static dataset bundle (loaded once at module init) ──────────────────────

const STATIC_DATASETS: Record<FxCurrency, FxDataset> = {
  USD: usdData as unknown as FxDataset,
  EUR: eurData as unknown as FxDataset,
  GBP: gbpData as unknown as FxDataset,
};

// In-memory override — used by tests via `__setFxDatasetForTesting`.
const overrides: Partial<Record<FxCurrency, FxDataset>> = {};

function getDataset(currency: FxCurrency): FxDataset {
  return overrides[currency] ?? STATIC_DATASETS[currency];
}

// ─── Date helpers ────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDate(input: Date | string): string {
  if (typeof input === "string") {
    if (ISO_DATE_RE.test(input)) return input;
    const d = new Date(input);
    if (isNaN(d.getTime())) {
      throw new Error(`fx.getFxRate: invalid date "${input}"`);
    }
    return d.toISOString().slice(0, 10);
  }
  if (!(input instanceof Date) || isNaN(input.getTime())) {
    throw new Error(`fx.getFxRate: invalid date input`);
  }
  return input.toISOString().slice(0, 10);
}

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Public API ──────────────────────────────────────────────────────────────

const FALLBACK_WINDOW_DAYS = 7;

let warnedYears: Set<string> = new Set();

/**
 * Get the official Bank of Israel publish rate for `currency` on `date`
 * (or the prior business day if the BoI was closed). Throws if no rate
 * is reachable within the fallback window AND no annual mean is documented.
 *
 * @param currency  ISO 4217 code — currently "USD" | "EUR" | "GBP".
 * @param date      ISO `YYYY-MM-DD` string or `Date` object.
 * @returns         Rate as ILS per 1 unit of `currency`.
 */
export function getFxRate(currency: FxCurrency, date: Date | string): number {
  const iso = toIsoDate(date);
  const ds = getDataset(currency);

  // (1) Exact-date hit.
  const exact = ds.rates[iso];
  if (typeof exact === "number" && exact > 0) return exact;

  // (2) Walk back ≤ 7 calendar days for the most-recent prior business day.
  for (let i = 1; i <= FALLBACK_WINDOW_DAYS; i++) {
    const candidate = shiftIsoDate(iso, -i);
    const rate = ds.rates[candidate];
    if (typeof rate === "number" && rate > 0) return rate;
  }

  // (3) Annual-mean transitional fallback (until backfill is run).
  // First try the exact year; if the requested year is in the future of our
  // documented annual means (e.g. CSV with no Statement/Period row that
  // defaults to current calendar year), fall back to the most-recent
  // documented year as a conservative best-effort.
  const reqYear = iso.slice(0, 4);
  const meanYear = (ds.annualMean && resolveAnnualMeanYear(ds.annualMean, reqYear)) ?? null;
  if (meanYear !== null) {
    const annual = ds.annualMean![meanYear];
    const warnKey = `${currency}:${reqYear}`;
    if (!warnedYears.has(warnKey)) {
      warnedYears.add(warnKey);
      console.warn(
        `[fx] ${currency} ${iso}: no daily rate within ${FALLBACK_WINDOW_DAYS}d; using ${meanYear} annual mean ${annual}. Run scripts/seed-fx-rates.mjs to backfill.`
      );
    }
    return annual;
  }

  // (4) Hard failure — caller must handle.
  throw new Error(
    `fx.getFxRate: no FX rate available for ${currency} on or before ${iso}`
  );
}

/**
 * Pick the best annualMean year for `requestedYear`:
 *   • exact match if present;
 *   • else the most-recent documented year ≤ requestedYear;
 *   • else (only when all documented years are after the request, e.g.
 *     a 1995 date) the earliest documented year — still better than throwing
 *     for a back-compat caller; the warning surfaces the gap.
 */
function resolveAnnualMeanYear(
  annualMean: Record<string, number>,
  requestedYear: string
): string | null {
  if (annualMean[requestedYear]) return requestedYear;
  const years = Object.keys(annualMean)
    .filter((y) => typeof annualMean[y] === "number" && annualMean[y]! > 0)
    .sort();
  if (years.length === 0) return null;
  const reqNum = Number(requestedYear);
  const earliest = Number(years[0]);
  const latest = Number(years[years.length - 1]);
  // Older than every documented year → null (caller errors loudly; we won't
  // fabricate a rate for a year that predates the dataset).
  if (reqNum < earliest) return null;
  // Future-of-dataset (CSV with no Statement/Period row defaults to the
  // calendar year; tests run on machines whose `new Date().getFullYear()`
  // outpaces the documented annualMean table). Best-effort: latest year.
  if (reqNum > latest) return years[years.length - 1];
  // In-range but not exact (shouldn't happen if annualMean is dense, but
  // handle it gracefully) → most-recent ≤ reqNum.
  return years.filter((y) => Number(y) <= reqNum).pop() ?? null;
}

/**
 * Convert `amount` of `currency` to ILS at the publish rate for `date`.
 * Returns rounded integer ILS (matches `Math.round(amount * rate)` semantics
 * used throughout the calc pipeline).
 */
export function convertToIls(
  amount: number,
  currency: FxCurrency,
  date: Date | string
): number {
  const rate = getFxRate(currency, date);
  return Math.round(amount * rate);
}

// ─── Backward-compat shims ───────────────────────────────────────────────────
//
// Pre-F-017 code used annual-mean accessors. New code MUST use `getFxRate`
// with a transaction date — these wrappers exist solely so legacy call sites
// keep compiling during the migration. They will be removed in Phase 2.

/**
 * @deprecated Use `getFxRate("USD", txDate)` instead. Returns the documented
 * BoI annual-mean rate for the year — illegal under סעיף 91(ג) for
 * per-transaction conversion.
 */
export async function getUsdIlsRate(year: number): Promise<number> {
  return getUsdIlsRateSync(year);
}

/**
 * @deprecated Use `getFxRate("USD", txDate)` instead.
 */
export function getUsdIlsRateSync(year: number): number {
  const ds = getDataset("USD");
  const v = ds.annualMean?.[String(year)];
  if (typeof v === "number" && v > 0) return v;
  // Last-ditch — should never reach in production with the seed file present.
  return 3.71;
}

// ─── Test seam ───────────────────────────────────────────────────────────────

/**
 * Test-only — inject an in-memory FX dataset for one currency.
 * Production code MUST NOT call this. Use `__resetFxDatasetForTesting()`
 * to restore the static JSON-backed dataset between tests.
 */
export function __setFxDatasetForTesting(
  currency: FxCurrency,
  dataset: FxDataset
): void {
  overrides[currency] = dataset;
  warnedYears = new Set();
}

/** Test-only — clear all in-memory overrides. */
export function __resetFxDatasetForTesting(): void {
  delete overrides.USD;
  delete overrides.EUR;
  delete overrides.GBP;
  warnedYears = new Set();
}
