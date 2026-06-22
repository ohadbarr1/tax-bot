/**
 * lib/pruneSavedDrafts.ts
 *
 * Strict save-required persistence: only EXPLICITLY-saved processes (and the
 * files belonging to them) survive a Google logout. Unsaved scratch processes
 * are discarded. This pure helper computes the saved-only AppState that we
 * write to the user's Firestore doc just before signing out, so the next login
 * restores saved work only.
 *
 * A draft is "saved" iff `draft.saved === true` (set by the Save button).
 * Documents are kept iff their `draftId` belongs to a saved draft.
 */

import type { AppState } from "@/types";
import { INITIAL_STATE } from "./initialState";

export function pruneToSavedDrafts(state: AppState): AppState {
  const savedEntries = Object.entries(state.drafts ?? {}).filter(
    ([, d]) => d.saved === true,
  );

  // Nothing saved → the account becomes empty; next session starts fresh.
  if (savedEntries.length === 0) {
    return {
      ...state,
      drafts: {},
      documents: [],
      currentDraftId: "",
      taxpayer: INITIAL_STATE.taxpayer,
      financials: INITIAL_STATE.financials,
      provenance: {},
      questionnaire: { step: 1, completed: false },
      onboarding: { sources: [], sourcesSelected: false, detailsConfirmed: false },
      advisorHistory: {},
    };
  }

  const savedDrafts = Object.fromEntries(savedEntries);
  const savedIds = new Set(Object.keys(savedDrafts));
  const documents = (state.documents ?? []).filter(
    (d) => d.draftId != null && savedIds.has(d.draftId),
  );

  // Keep the current draft if it's saved; otherwise point at the most recently
  // updated saved draft so the next login lands on real work.
  let currentDraftId = state.currentDraftId;
  if (!savedIds.has(currentDraftId)) {
    currentDraftId = savedEntries
      .slice()
      .sort((a, b) => (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? ""))[0][0];
  }
  const cur = savedDrafts[currentDraftId];

  return {
    ...state,
    drafts: savedDrafts,
    documents,
    currentDraftId,
    taxpayer: cur.taxpayer,
    financials: cur.financials,
    questionnaire: cur.questionnaire,
  };
}

/** Storage paths of documents that will be discarded (unsaved drafts) — so the
 *  caller can best-effort delete the orphaned blobs from Cloud Storage. */
export function unsavedStoragePaths(state: AppState): string[] {
  const savedIds = new Set(
    Object.entries(state.drafts ?? {})
      .filter(([, d]) => d.saved === true)
      .map(([id]) => id),
  );
  return (state.documents ?? [])
    .filter((d) => !(d.draftId != null && savedIds.has(d.draftId)))
    .map((d) => d.storagePath)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}
