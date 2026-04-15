/**
 * lib/admin/listUsers.ts — page through Firebase Auth users and join with
 * per-user AppState from Firestore so the admin table can show an
 * onboarding badge + docs count in one API call.
 *
 * Server-only. Never import from a client component.
 */

import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";

export interface AdminUserRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  providers: string[];
  isAnonymous: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  disabled: boolean;
  onboardingStatus: OnboardingStatus;
  docsCount: number;
}

export type OnboardingStatus =
  | "new"
  | "sources_selected"
  | "details_confirmed"
  | "questionnaire_completed"
  | "filed";

export interface ListUsersResult {
  users: AdminUserRow[];
  nextPageToken: string | null;
}

/**
 * Fetch a page of users and join each one with their AppState's onboarding
 * funnel. A 50-user page does 50 sequential Firestore reads — we run them
 * with `Promise.all` for concurrency. If `q` is provided, we filter AFTER
 * the join (in-memory) by email/uid substring match — the Auth SDK's
 * listUsers has no server-side search, so this is the simplest honest answer.
 */
export async function listAdminUsers(params: {
  q?: string;
  pageSize?: number;
  pageToken?: string;
}): Promise<ListUsersResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 1000);
  const auth = getAdminAuth();
  const firestore = getAdminFirestore();

  const page = await auth.listUsers(pageSize, params.pageToken);
  const rows: AdminUserRow[] = await Promise.all(
    page.users.map(async (u): Promise<AdminUserRow> => {
      const providers = u.providerData.map((p) => p.providerId);
      const isAnonymous = providers.length === 0;

      let onboardingStatus: OnboardingStatus = "new";
      let docsCount = 0;
      try {
        const snap = await firestore.doc(`users/${u.uid}/private/state`).get();
        if (snap.exists) {
          const data = snap.data() ?? {};
          const state = (data as { state?: Record<string, unknown> }).state ?? {};

          docsCount = Array.isArray((state as { documents?: unknown[] }).documents)
            ? ((state as { documents: unknown[] }).documents.length)
            : 0;

          const drafts = (state as { drafts?: Record<string, { status?: string }> }).drafts ?? {};
          const hasFiled = Object.values(drafts).some(
            (d) => d?.status === "filed" || d?.status === "refunded",
          );
          const onboarding = (state as { onboarding?: { sourcesSelected?: boolean; detailsConfirmed?: boolean } })
            .onboarding;
          const questionnaire = (state as { questionnaire?: { completed?: boolean } }).questionnaire;

          if (hasFiled) onboardingStatus = "filed";
          else if (questionnaire?.completed) onboardingStatus = "questionnaire_completed";
          else if (onboarding?.detailsConfirmed) onboardingStatus = "details_confirmed";
          else if (onboarding?.sourcesSelected) onboardingStatus = "sources_selected";
          else onboardingStatus = "new";
        }
      } catch (err) {
        console.warn(`[admin] failed to load state for ${u.uid}:`, err);
      }

      return {
        uid: u.uid,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        providers,
        isAnonymous,
        createdAt: u.metadata.creationTime ?? null,
        lastSignInAt: u.metadata.lastSignInTime ?? null,
        disabled: u.disabled,
        onboardingStatus,
        docsCount,
      };
    }),
  );

  const filtered = params.q
    ? rows.filter((r) => {
        const needle = params.q!.toLowerCase();
        return (
          r.uid.toLowerCase().includes(needle) ||
          (r.email ?? "").toLowerCase().includes(needle) ||
          (r.displayName ?? "").toLowerCase().includes(needle)
        );
      })
    : rows;

  return {
    users: filtered,
    nextPageToken: page.pageToken ?? null,
  };
}
