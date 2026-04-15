/**
 * lib/admin/stats.ts — aggregate metrics for the admin dashboard.
 *
 * Reads from three sources:
 *   - Firebase Auth  → total users, provider counts, new-signup counts
 *   - Cloud Storage → total bytes + object count under `users/`
 *   - Firestore      → per-user AppState funnel (sources selected, details
 *                     confirmed, questionnaire completed, first doc uploaded,
 *                     filing complete)
 *
 * Everything is paged through the Admin SDK APIs so this works against
 * arbitrarily large user bases — with the caveat that large tenants will
 * pay real read cost. We intentionally avoid caching here: the admin portal
 * is low-traffic and the spec requires a single-screen snapshot with an
 * explicit `generatedAt`.
 */

import { getAdminAuth, getAdminFirestore, getAdminStorage } from "@/lib/firebase/admin";

export interface AdminStats {
  totalUsers: number;
  newSignups: { today: number; d7: number; d30: number };
  providers: { anonymous: number; google: number; other: number };
  storage: { totalBytes: number; totalObjects: number };
  onboarding: {
    started: number;
    sourcesSelected: number;
    detailsConfirmed: number;
    questionnaireCompleted: number;
    firstDocUploaded: number;
    filingComplete: number;
  };
  generatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Page through every Firebase Auth user (chunks of 1000) and reduce into
 * provider + signup counters. Returns a full dump the caller can reuse for
 * joins (e.g. in listUsers).
 */
async function aggregateAuthUsers(): Promise<Pick<AdminStats, "totalUsers" | "newSignups" | "providers">> {
  const auth = getAdminAuth();
  const now = Date.now();
  const todayCutoff = now - DAY_MS;
  const d7Cutoff = now - 7 * DAY_MS;
  const d30Cutoff = now - 30 * DAY_MS;

  let totalUsers = 0;
  let anonymous = 0;
  let google = 0;
  let other = 0;
  let today = 0;
  let d7 = 0;
  let d30 = 0;

  let pageToken: string | undefined = undefined;
  // Safety cap: 1M users is 1000 pages. For normal deployments we'd never
  // hit this, but we'd rather return a partial/slow stat than spin forever.
  let pagesRead = 0;
  const MAX_PAGES = 1000;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      totalUsers++;
      const providerIds = user.providerData.map((p) => p.providerId);
      if (providerIds.length === 0) {
        // No linked providers → anonymous account.
        anonymous++;
      } else if (providerIds.includes("google.com")) {
        google++;
      } else {
        other++;
      }

      const created = Date.parse(user.metadata.creationTime);
      if (!Number.isNaN(created)) {
        if (created >= todayCutoff) today++;
        if (created >= d7Cutoff) d7++;
        if (created >= d30Cutoff) d30++;
      }
    }
    pageToken = page.pageToken;
    pagesRead++;
  } while (pageToken && pagesRead < MAX_PAGES);

  return {
    totalUsers,
    newSignups: { today, d7, d30 },
    providers: { anonymous, google, other },
  };
}

/**
 * Sum size/count across every object under `users/`. Pages the bucket with
 * `autoPaginate: false` so we can safely walk huge tenants.
 */
async function aggregateStorage(): Promise<AdminStats["storage"]> {
  const bucket = getAdminStorage().bucket();
  let totalBytes = 0;
  let totalObjects = 0;
  // `getFiles` has overloaded signatures — the callback variant confuses
  // Parameters<> inference, so we type the query as `any` locally and cast
  // the result to the tuple we actually see at runtime.
  type StorageQuery = {
    prefix: string;
    autoPaginate: boolean;
    maxResults: number;
    pageToken?: string;
  };
  let query: StorageQuery = {
    prefix: "users/",
    autoPaginate: false,
    maxResults: 1000,
  };
  const MAX_PAGES = 1000;
  let pagesRead = 0;
  while (true) {
    // The Google Cloud Storage client's promise-returning overload only
    // exposes `[files]` by type. The runtime actually returns a tuple of
    // `[files, nextQuery, apiResponse]` when `autoPaginate:false` — we
    // cast to the observed shape and walk pageTokens manually.
    const res = (await (bucket.getFiles as (q: StorageQuery) => Promise<unknown>)(query)) as [
      Array<{ metadata?: { size?: string | number } }>,
      { pageToken?: string } | null | undefined,
    ];
    const [files, nextQuery] = res;
    for (const f of files) {
      totalObjects++;
      const raw = f.metadata?.size;
      const n = typeof raw === "string" ? Number(raw) : (raw ?? 0);
      if (Number.isFinite(n)) totalBytes += n;
    }
    pagesRead++;
    if (!nextQuery || !nextQuery.pageToken || pagesRead >= MAX_PAGES) break;
    query = { ...query, pageToken: nextQuery.pageToken };
  }
  return { totalBytes, totalObjects };
}

/**
 * Walk every `users/{uid}/private/state` document and tally the onboarding
 * funnel. Uses `collectionGroup("private")` to fan out without a top-level
 * listCollections call.
 */
async function aggregateOnboarding(): Promise<AdminStats["onboarding"]> {
  const firestore = getAdminFirestore();
  const tally = {
    started: 0,
    sourcesSelected: 0,
    detailsConfirmed: 0,
    questionnaireCompleted: 0,
    firstDocUploaded: 0,
    filingComplete: 0,
  };

  const snap = await firestore.collectionGroup("private").get();
  for (const doc of snap.docs) {
    if (doc.id !== "state") continue;
    const data = doc.data() ?? {};
    const state = (data as { state?: Record<string, unknown> }).state ?? null;
    if (!state) continue;

    tally.started++;

    const onboarding = state.onboarding as
      | { sourcesSelected?: boolean; detailsConfirmed?: boolean }
      | undefined;
    if (onboarding?.sourcesSelected) tally.sourcesSelected++;
    if (onboarding?.detailsConfirmed) tally.detailsConfirmed++;

    const questionnaire = state.questionnaire as { completed?: boolean } | undefined;
    if (questionnaire?.completed) tally.questionnaireCompleted++;

    const documents = Array.isArray(state.documents) ? state.documents : [];
    if (documents.length > 0) tally.firstDocUploaded++;

    // Filing complete: at least one draft has status "filed" or "refunded".
    const drafts = state.drafts as Record<string, { status?: string }> | undefined;
    if (drafts && Object.values(drafts).some((d) => d?.status === "filed" || d?.status === "refunded")) {
      tally.filingComplete++;
    }
  }
  return tally;
}

/** Top-level entrypoint — runs the three aggregations in parallel. */
export async function computeAdminStats(): Promise<AdminStats> {
  const [authAgg, storage, onboarding] = await Promise.all([
    aggregateAuthUsers(),
    aggregateStorage(),
    aggregateOnboarding(),
  ]);
  return {
    ...authAgg,
    storage,
    onboarding,
    generatedAt: new Date().toISOString(),
  };
}
