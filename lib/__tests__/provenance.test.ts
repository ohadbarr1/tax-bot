/**
 * Override contract (loop T0.2 / T2): manual input is the source of truth.
 *
 * A value the user enters or edits must NEVER be overwritten by a later
 * document-mining pass — whether the field was previously mined-then-edited
 * OR typed from scratch (the pre-loop bug: typed-from-scratch fields had no
 * provenance entry, so `markFieldUserConfirmed` no-op'd and a later upload
 * clobbered them).
 */

import { describe, it, expect } from "vitest";
import {
  resolveMinedFields,
  markManualPaths,
  makeManualEntry,
  isManual,
  getPath,
  preserveManual,
  MANUAL_DOC_ID,
} from "../provenance";
import { INITIAL_TAXPAYER, INITIAL_FINANCIALS } from "../initialState";
import type { FieldProvenance, MinedField } from "@/types";

const NOW = "2026-06-22T00:00:00.000Z";

function mine(fieldPath: string, value: unknown): MinedField {
  return { fieldPath, value, confidence: "high" } as MinedField;
}

describe("override contract — manual wins over later mining", () => {
  it("mine → manual edit → mine again: manual value survives", () => {
    // 1. First mine writes salary 100000.
    let s = resolveMinedFields(
      INITIAL_TAXPAYER,
      INITIAL_FINANCIALS,
      {},
      "doc-106-a",
      "טופס 106 — מעסיק א'",
      [mine("taxpayer.employers[0].grossSalary", 100000)],
      NOW,
    );
    expect(s.taxpayer.employers[0].grossSalary).toBe(100000);
    expect(isManual(s.provenance["taxpayer.employers[0].grossSalary"])).toBe(false);

    // 2. User manually corrects it to 120000 and we lock the path.
    const lockedProv = markManualPaths(
      s.provenance,
      ["taxpayer.employers[0].grossSalary"],
      NOW,
    );
    const manualTaxpayer = {
      ...s.taxpayer,
      employers: s.taxpayer.employers.map((e, i) =>
        i === 0 ? { ...e, grossSalary: 120000 } : e,
      ),
    };
    expect(isManual(lockedProv["taxpayer.employers[0].grossSalary"])).toBe(true);

    // 3. A second mine pass tries to overwrite with 100000 again.
    s = resolveMinedFields(
      manualTaxpayer,
      s.financials,
      lockedProv,
      "doc-106-a-rescan",
      "טופס 106 — סריקה חוזרת",
      [mine("taxpayer.employers[0].grossSalary", 100000)],
      NOW,
    );

    // Manual value wins.
    expect(s.taxpayer.employers[0].grossSalary).toBe(120000);
  });

  it("typed-from-scratch (no prior provenance) is still protected", () => {
    // User typed a value the parser never mined → lock it with makeManualEntry.
    const prov = markManualPaths({}, ["taxpayer.idNumber"], NOW);
    expect(prov["taxpayer.idNumber"].sourceDocId).toBe(MANUAL_DOC_ID);
    expect(prov["taxpayer.idNumber"].userConfirmed).toBe(true);

    const taxpayer = { ...INITIAL_TAXPAYER, idNumber: "000000018" };

    const s = resolveMinedFields(
      taxpayer,
      INITIAL_FINANCIALS,
      prov,
      "doc-x",
      "מסמך",
      [mine("taxpayer.idNumber", "999999999")],
      NOW,
    );
    expect(s.taxpayer.idNumber).toBe("000000018");
  });

  it("makeManualEntry preserves the original doc label when overriding a mined field", () => {
    const mined: FieldProvenance = {
      fieldPath: "taxpayer.idNumber",
      sourceDocId: "doc-106",
      sourceLabel: "טופס 106",
      confidence: "high",
      userConfirmed: false,
      minedAt: NOW,
    };
    const overridden = makeManualEntry("taxpayer.idNumber", NOW, mined);
    expect(overridden.userConfirmed).toBe(true);
    // keeps doc lineage so the summary can show "manual — overrode טופס 106"
    expect(overridden.sourceDocId).toBe("doc-106");
    expect(overridden.sourceLabel).toBe("טופס 106");
  });

  it("getPath reads nested + array dot-paths", () => {
    const obj = { employers: [{ grossSalary: 90000 }], bank: { account: "1" } };
    expect(getPath(obj, "employers[0].grossSalary")).toBe(90000);
    expect(getPath(obj, "bank.account")).toBe("1");
    expect(getPath(obj, "employers[3].grossSalary")).toBeUndefined();
  });

  it("preserveManual: document write keeps locked leaves, overwrites unlocked (T2.1)", () => {
    // Prev state: user typed salary 120000 (locked) at employer 0, name not locked.
    const prevTaxpayer = {
      ...INITIAL_TAXPAYER,
      idNumber: "000000018",
      employers: [
        { id: "e0", name: "ידני", isMainEmployer: true, monthsWorked: 12, grossSalary: 120000 },
      ],
    };
    const provenance = markManualPaths(
      {},
      ["taxpayer.employers[0].grossSalary", "taxpayer.idNumber"],
      NOW,
    );

    // A Tofes-106 merge tries to set salary 100000 and the (unlocked) name.
    const docMergedTaxpayer = {
      ...prevTaxpayer,
      idNumber: "999999999",
      employers: [
        { id: "e0", name: "מעסיק מהמסמך", isMainEmployer: true, monthsWorked: 12, grossSalary: 100000 },
      ],
    };

    const { taxpayer } = preserveManual(
      prevTaxpayer,
      INITIAL_FINANCIALS,
      docMergedTaxpayer,
      INITIAL_FINANCIALS,
      provenance,
    );

    // Locked wins:
    expect(taxpayer.employers[0].grossSalary).toBe(120000);
    expect(taxpayer.idNumber).toBe("000000018");
    // Unlocked field from the doc survives:
    expect(taxpayer.employers[0].name).toBe("מעסיק מהמסמך");
  });

  it("non-confirmed mined fields are still overwritten by a newer mine", () => {
    let s = resolveMinedFields(
      INITIAL_TAXPAYER,
      INITIAL_FINANCIALS,
      {},
      "doc-1",
      "מסמך 1",
      [mine("taxpayer.firstName", "דוד")],
      NOW,
    );
    s = resolveMinedFields(
      s.taxpayer,
      s.financials,
      s.provenance,
      "doc-2",
      "מסמך 2",
      [mine("taxpayer.firstName", "שרה")],
      NOW,
    );
    expect(s.taxpayer.firstName).toBe("שרה");
  });
});
