import { describe, it, expect } from "vitest";
import { aggregate867CapitalGains, resolveBrokerCapitalGains } from "../capitalGainsFromDocs";
import type { Form867InboundData, VaultDocMeta } from "@/types";

const mk = (over: Partial<Form867InboundData>): Form867InboundData => ({
  brokerName: "ברוקר",
  accountHolderName: "ישראל ישראלי",
  tz: "000000018",
  year: 2025,
  realizedGainsIls: 0,
  realizedLossesIls: 0,
  dividendsIls: 0,
  interestIls: 0,
  foreignWithholdingIls: 0,
  overallConfidence: "high",
  ...over,
});

describe("aggregate867CapitalGains — multiple 867 brokers sum, not overwrite", () => {
  it("sums two different brokers (the xnes_867 bug)", () => {
    const hybrid = mk({ brokerName: "הייבריד", realizedGainsIls: 100_000, realizedLossesIls: 20_000, dividendsIls: 3_000, foreignWithholdingIls: 450 });
    const xnes   = mk({ brokerName: "Xnes",    realizedGainsIls:  40_000, realizedLossesIls:  5_000, dividendsIls: 1_000, foreignWithholdingIls: 150 });

    const agg = aggregate867CapitalGains([hybrid, xnes]);
    expect(agg.totalRealizedProfit).toBe(140_000);
    expect(agg.totalRealizedLoss).toBe(25_000);
    expect(agg.dividends).toBe(4_000);
    expect(agg.foreignTaxWithheld).toBe(600);
  });

  it("a single broker is unchanged", () => {
    const only = mk({ realizedGainsIls: 90_000, realizedLossesIls: 10_000, dividendsIls: 2_000, foreignWithholdingIls: 300 });
    const agg = aggregate867CapitalGains([only]);
    expect(agg).toEqual({ totalRealizedProfit: 90_000, totalRealizedLoss: 10_000, foreignTaxWithheld: 300, dividends: 2_000 });
  });

  it("floors negative/garbage values at 0", () => {
    const bad = mk({ realizedGainsIls: -5, realizedLossesIls: -1, dividendsIls: -2, foreignWithholdingIls: -3 });
    const good = mk({ realizedGainsIls: 1_000 });
    const agg = aggregate867CapitalGains([bad, good]);
    expect(agg.totalRealizedProfit).toBe(1_000);
    expect(agg.totalRealizedLoss).toBe(0);
    expect(agg.dividends).toBe(0);
    expect(agg.foreignTaxWithheld).toBe(0);
  });

  it("empty set is all zeros", () => {
    expect(aggregate867CapitalGains([])).toEqual({ totalRealizedProfit: 0, totalRealizedLoss: 0, foreignTaxWithheld: 0, dividends: 0 });
  });
});

const doc867 = (id: string, data: Partial<Form867InboundData>): VaultDocMeta => ({
  id,
  name: `${id}.pdf`,
  type: "form867",
  size: 1000,
  uploadedAt: "2026-06-22T00:00:00.000Z",
  status: "mined",
  draftId: "draft-2025",
  parsedPayload: { kind: "form867", data: mk(data) },
});

const docIbkr = (id: string): VaultDocMeta => ({
  id,
  name: `${id}.csv`,
  type: "ibkr",
  size: 1000,
  uploadedAt: "2026-06-22T00:00:00.000Z",
  status: "mined",
  draftId: "draft-2025",
  parsedPayload: {
    kind: "ibkr",
    data: {
      totalProfitUSD: 0, totalLossUSD: 0, dividendsUSD: 0, foreignTaxUSD: 0, exchangeRate: 3.65,
      totalRealizedProfit: 50_000, totalRealizedLoss: 0, foreignTaxWithheld: 0, dividendsILS: 0,
    },
  },
});

describe("resolveBrokerCapitalGains — upload & remove decisions", () => {
  it("UPLOAD: second broker's 867 sums with the first (the reported bug)", () => {
    const existing = [doc867("d1", { brokerName: "הייבריד", realizedGainsIls: 100_000, foreignWithholdingIls: 450 })];
    const incoming = mk({ brokerName: "Xnes", realizedGainsIls: 40_000, foreignWithholdingIls: 150 });
    // The new doc 'd2' is added to state with status mining (no payload yet);
    // the handler excludes its own id and folds in the fresh payload.
    const r = resolveBrokerCapitalGains([...existing, { ...doc867("d2", {}), parsedPayload: undefined }], "d2", [incoming]);
    expect(r).toEqual({ kind: "sum", capitalGains: { totalRealizedProfit: 140_000, totalRealizedLoss: 0, foreignTaxWithheld: 600, dividends: 0 } });
  });

  it("UPLOAD: re-parsing an existing 867 doesn't double-count itself", () => {
    const d1 = doc867("d1", { realizedGainsIls: 100_000 });
    const reparsed = mk({ realizedGainsIls: 120_000 }); // corrected value
    const r = resolveBrokerCapitalGains([d1], "d1", [reparsed]);
    expect(r).toEqual({ kind: "sum", capitalGains: { totalRealizedProfit: 120_000, totalRealizedLoss: 0, foreignTaxWithheld: 0, dividends: 0 } });
  });

  it("IBKR present → authoritative, 867 stays cross-check only", () => {
    const docs = [docIbkr("i1"), doc867("d1", { realizedGainsIls: 99_999 })];
    expect(resolveBrokerCapitalGains(docs, "d1", [mk({ realizedGainsIls: 1 })])).toEqual({ kind: "ibkr" });
  });

  it("REMOVE: dropping one of two 867s leaves the other's totals", () => {
    const docs = [
      doc867("d1", { realizedGainsIls: 100_000 }),
      doc867("d2", { realizedGainsIls: 40_000 }),
    ];
    const r = resolveBrokerCapitalGains(docs, "d2"); // remove d2
    expect(r).toEqual({ kind: "sum", capitalGains: { totalRealizedProfit: 100_000, totalRealizedLoss: 0, foreignTaxWithheld: 0, dividends: 0 } });
  });

  it("REMOVE: dropping the last 867 → none (clear capitalGains)", () => {
    const r = resolveBrokerCapitalGains([doc867("d1", { realizedGainsIls: 100_000 })], "d1");
    expect(r).toEqual({ kind: "none" });
  });
});
