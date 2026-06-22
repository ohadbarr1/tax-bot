import { describe, it, expect } from "vitest";
import { pruneToSavedDrafts, unsavedStoragePaths } from "../pruneSavedDrafts";
import { INITIAL_STATE } from "../initialState";
import type { AppState, TaxYearDraft, VaultDocMeta } from "@/types";

const draft = (id: string, saved: boolean, updatedAt: string): TaxYearDraft => ({
  id,
  taxYear: 2025,
  status: "draft",
  questionnaire: { step: saved ? 8 : 1, completed: saved },
  taxpayer: { ...INITIAL_STATE.taxpayer, id: `tp-${id}`, idNumber: id },
  financials: { ...INITIAL_STATE.financials, estimatedRefund: saved ? 1000 : 0 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
  saved,
});

const doc = (id: string, draftId: string, storagePath?: string): VaultDocMeta => ({
  id,
  name: `${id}.pdf`,
  type: "form867",
  size: 1,
  uploadedAt: "2026-01-01T00:00:00.000Z",
  status: "mined",
  draftId,
  storagePath,
});

const mkState = (over: Partial<AppState>): AppState => ({
  ...INITIAL_STATE,
  ...over,
});

describe("pruneToSavedDrafts — strict save-required", () => {
  it("keeps saved drafts + their docs, drops unsaved drafts + their docs", () => {
    const s = mkState({
      currentDraftId: "d_unsaved",
      drafts: { d_saved: draft("d_saved", true, "2026-02-01"), d_unsaved: draft("d_unsaved", false, "2026-03-01") },
      documents: [doc("doc1", "d_saved", "p/saved.pdf"), doc("doc2", "d_unsaved", "p/unsaved.pdf")],
    });
    const out = pruneToSavedDrafts(s);
    expect(Object.keys(out.drafts)).toEqual(["d_saved"]);
    expect(out.documents.map((d) => d.id)).toEqual(["doc1"]);
    // current pointed at the discarded draft → repoint to the saved one
    expect(out.currentDraftId).toBe("d_saved");
    expect(out.taxpayer.idNumber).toBe("d_saved");
  });

  it("keeps the current draft when it is itself saved", () => {
    const s = mkState({
      currentDraftId: "d_saved",
      drafts: { d_saved: draft("d_saved", true, "2026-02-01"), d_old: draft("d_old", true, "2026-01-15") },
      documents: [],
    });
    expect(pruneToSavedDrafts(s).currentDraftId).toBe("d_saved");
  });

  it("repoints to the most-recently-updated saved draft", () => {
    const s = mkState({
      currentDraftId: "d_unsaved",
      drafts: {
        d_unsaved: draft("d_unsaved", false, "2026-09-01"),
        d_a: draft("d_a", true, "2026-02-01"),
        d_b: draft("d_b", true, "2026-08-01"),
      },
      documents: [],
    });
    expect(pruneToSavedDrafts(s).currentDraftId).toBe("d_b");
  });

  it("no saved drafts → empty account, fresh state", () => {
    const s = mkState({
      currentDraftId: "d1",
      drafts: { d1: draft("d1", false, "2026-02-01") },
      documents: [doc("doc1", "d1", "p/x.pdf")],
    });
    const out = pruneToSavedDrafts(s);
    expect(out.drafts).toEqual({});
    expect(out.documents).toEqual([]);
    expect(out.currentDraftId).toBe("");
    expect(out.taxpayer.idNumber).toBe(INITIAL_STATE.taxpayer.idNumber);
  });

  it("unsavedStoragePaths lists only discarded docs' blobs", () => {
    const s = mkState({
      drafts: { d_saved: draft("d_saved", true, "2026-02-01"), d_unsaved: draft("d_unsaved", false, "2026-03-01") },
      documents: [doc("doc1", "d_saved", "p/saved.pdf"), doc("doc2", "d_unsaved", "p/unsaved.pdf"), doc("doc3", "d_unsaved")],
    });
    expect(unsavedStoragePaths(s)).toEqual(["p/unsaved.pdf"]);
  });
});
