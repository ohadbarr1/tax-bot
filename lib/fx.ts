/**
 * fx.ts — Bank of Israel FX Rate Service
 *
 * Fetches the official USD/ILS annual average rate from the Bank of Israel API.
 * Results are cached in IndexedDB for 24 hours to avoid redundant fetches.
 * Falls back to hardcoded rates if the API is unreachable.
 *
 * BoI XML feed: https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS
 * Simpler JSON endpoint used here (unofficial but stable):
 *   https://boi.org.il/currency.php?curr=01&rdate=YYYYMMDD
 *
 * For annual averages we use the prebuilt endpoint below (same source the ITA uses).
 */

import { openDB } from "idb";

// ─── Fallback rates (Bank of Israel annual average) ───────────────────────────
const FALLBACK_RATES: Record<number, number> = {
  2024: 3.71,
  2025: 3.65,
};

const CACHE_DB_NAME    = "taxbot-fx-cache";
const CACHE_DB_VERSION = 1;
const CACHE_STORE      = "rates";
const CACHE_TTL_MS     = 24 * 60 * 60 * 1000; // 24 hours

interface CachedRate {
  rate: number;
  fetchedAt: number; // Date.now()
}

async function getCacheDb() {
  if (typeof window === "undefined") return null;
  return openDB(CACHE_DB_NAME, CACHE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
    },
  });
}

async function readCached(key: string): Promise<number | null> {
  try {
    const db = await getCacheDb();
    if (!db) return null;
    const entry: CachedRate | undefined = await db.get(CACHE_STORE, key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null; // stale
    return entry.rate;
  } catch {
    return null;
  }
}

async function writeCache(key: string, rate: number): Promise<void> {
  try {
    const db = await getCacheDb();
    if (!db) return;
    await db.put(CACHE_STORE, { rate, fetchedAt: Date.now() }, key);
  } catch {
    /* non-fatal */
  }
}

/**
 * Fetch USD/ILS annual average exchange rate from Bank of Israel.
 * Falls back to hardcoded value if API is unreachable.
 *
 * @param year  Tax year (e.g. 2024)
 * @returns     Annual average exchange rate (e.g. 3.71)
 */
export async function getUsdIlsRate(year: number): Promise<number> {
  const cacheKey = `usd_ils_${year}`;

  // 1. Try cache first
  const cached = await readCached(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // 2. Attempt live fetch from BoI
  try {
    // BoI provides daily rates; we compute the annual average via their SDMX feed.
    // For simplicity we use a direct JSON query. If unavailable, fallback is safe.
    const url = `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS?startperiod=${year}-01-01&endperiod=${year}-12-31&detail=dataonly&format=jsondata`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (res.ok) {
      const json = await res.json();
      // Extract all observations and compute annual average
      const obsSeries =
        json?.data?.dataSets?.[0]?.series?.["0:0"]?.observations ?? {};
      const values = Object.values(obsSeries) as number[][];
      const rates = values.map((v) => v[0]).filter((r) => r > 0);

      if (rates.length > 0) {
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        const rounded = Math.round(avg * 100) / 100;
        await writeCache(cacheKey, rounded);
        return rounded;
      }
    }
  } catch {
    // Network error — fall through to hardcoded fallback
  }

  // 3. Hardcoded fallback
  const fallback = FALLBACK_RATES[year] ?? 3.71;
  return fallback;
}

/**
 * Synchronous fallback — use when async is not possible.
 * Always returns the hardcoded rate.
 */
export function getUsdIlsRateSync(year: number): number {
  return FALLBACK_RATES[year] ?? 3.71;
}
