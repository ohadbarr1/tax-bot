/**
 * lib/capitalGainsFromDocs.ts
 *
 * Aggregate capital-gains across the broker documents in a draft.
 *
 * A filer can hold MULTIPLE Form-867 certificates from DIFFERENT Israeli
 * tax-service brokers (e.g. הייבריד + Xnes). Each 867 is a separate portfolio
 * and its realized gains / losses / dividends / foreign-withholding must be
 * SUMMED — not overwritten by the last one uploaded (the multi-867 bug).
 *
 * IBKR, when present, stays authoritative: a 867 alongside an IBKR import
 * usually certifies that SAME IBKR account, so summing it would double-count
 * the portfolio. The caller decides whether IBKR is present; this module only
 * sums 867 payloads.
 */

import type { CapitalGainsData, Form867InboundData, VaultDocMeta } from "@/types";

/** Sum any number of Form-867 payloads into a single CapitalGainsData.
 *  Negative/garbage values are floored at 0 (same guard the inline path used). */
export function aggregate867CapitalGains(
  payloads: Form867InboundData[],
): CapitalGainsData {
  return payloads.reduce<CapitalGainsData>(
    (acc, p) => ({
      totalRealizedProfit: acc.totalRealizedProfit + Math.max(0, p.realizedGainsIls),
      totalRealizedLoss:   acc.totalRealizedLoss   + Math.max(0, p.realizedLossesIls),
      foreignTaxWithheld:  acc.foreignTaxWithheld  + Math.max(0, p.foreignWithholdingIls),
      dividends:           (acc.dividends ?? 0)    + Math.max(0, p.dividendsIls),
    }),
    { totalRealizedProfit: 0, totalRealizedLoss: 0, foreignTaxWithheld: 0, dividends: 0 },
  );
}

/** What capital-gains state the broker documents imply. */
export type BrokerCgResolution =
  /** An IBKR import is present — it is authoritative; 867s stay cross-check. */
  | { kind: "ibkr" }
  /** No broker capital-gains source remains — caller should clear capitalGains. */
  | { kind: "none" }
  /** Sum of every Form-867 broker — the value to write to capitalGains. */
  | { kind: "sum"; capitalGains: CapitalGainsData };

/**
 * Resolve the capital-gains source from a draft's broker documents — the single
 * decision shared by the upload and the remove paths, so they can never drift.
 *
 * @param draftDocs   all documents in the current draft (with parsedPayload)
 * @param excludeDocId  a doc being re-parsed or removed — its stale payload is ignored
 * @param extra       freshly parsed 867 payloads not yet present in draftDocs
 *
 * Rules: IBKR present → authoritative ("ibkr"); else sum ALL Form-867 brokers
 * ("sum"); else nothing left ("none"). This is what fixes the multi-867 bug —
 * a second broker's 867 is summed, not dropped as an IBKR duplicate.
 */
export function resolveBrokerCapitalGains(
  draftDocs: VaultDocMeta[],
  excludeDocId: string | null,
  extra: Form867InboundData[] = [],
): BrokerCgResolution {
  const docs = draftDocs.filter((d) => d.id !== excludeDocId);
  if (docs.some((d) => d.parsedPayload?.kind === "ibkr")) return { kind: "ibkr" };
  const payloads: Form867InboundData[] = [
    ...docs
      .filter((d) => d.parsedPayload?.kind === "form867")
      .map((d) => (d.parsedPayload as { kind: "form867"; data: Form867InboundData }).data),
    ...extra,
  ];
  if (payloads.length === 0) return { kind: "none" };
  return { kind: "sum", capitalGains: aggregate867CapitalGains(payloads) };
}
