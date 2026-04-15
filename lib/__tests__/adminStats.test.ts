import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeUserRecord {
  providerData: Array<{ providerId: string }>;
  metadata: { creationTime: string };
}

const listUsersPages: Array<{ users: FakeUserRecord[]; pageToken?: string }> = [];
const fakeListUsers = vi.fn(async (_max: number, token?: string) => {
  const idx = token ? Number(token) : 0;
  return listUsersPages[idx] ?? { users: [], pageToken: undefined };
});

const fakeCollectionGroup = vi.fn((_name: string) => ({
  async get() {
    return {
      docs: [
        {
          id: "state",
          data: () => ({
            state: {
              onboarding: { sourcesSelected: true, detailsConfirmed: true },
              questionnaire: { completed: true },
              documents: [{ id: "d1" }],
              drafts: { a: { status: "filed" } },
            },
          }),
        },
        {
          id: "state",
          data: () => ({
            state: {
              onboarding: { sourcesSelected: true, detailsConfirmed: false },
              questionnaire: { completed: false },
              documents: [],
              drafts: { a: { status: "draft" } },
            },
          }),
        },
        {
          id: "other", // ignored — stats only counts "state"
          data: () => ({}),
        },
      ],
    };
  },
}));

const fakeGetFiles = vi.fn(async (_q: unknown) => {
  return [
    [
      { name: "users/u1/documents/a.pdf", metadata: { size: "100" } },
      { name: "users/u2/documents/b.pdf", metadata: { size: "50" } },
    ],
    null,
  ];
});

vi.mock("../firebase/admin", () => ({
  getAdminAuth: () => ({
    listUsers: fakeListUsers,
  }),
  getAdminFirestore: () => ({
    collectionGroup: fakeCollectionGroup,
  }),
  getAdminStorage: () => ({
    bucket: () => ({ getFiles: fakeGetFiles }),
  }),
}));

import { computeAdminStats } from "../admin/stats";

describe("computeAdminStats", () => {
  beforeEach(() => {
    listUsersPages.length = 0;
    fakeListUsers.mockClear();
    fakeCollectionGroup.mockClear();
    fakeGetFiles.mockClear();
  });

  it("aggregates users, providers, signups, storage, and funnel", async () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toUTCString();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toUTCString();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toUTCString();
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toUTCString();

    listUsersPages.push({
      users: [
        // anon, new today
        { providerData: [], metadata: { creationTime: twoHoursAgo } },
        // google, 3 days ago
        {
          providerData: [{ providerId: "google.com" }],
          metadata: { creationTime: threeDaysAgo },
        },
        // google, 10 days ago
        {
          providerData: [{ providerId: "google.com" }],
          metadata: { creationTime: tenDaysAgo },
        },
        // apple (other), 40 days ago
        {
          providerData: [{ providerId: "apple.com" }],
          metadata: { creationTime: fortyDaysAgo },
        },
      ],
      pageToken: undefined,
    });

    const stats = await computeAdminStats();

    expect(stats.totalUsers).toBe(4);
    expect(stats.providers).toEqual({ anonymous: 1, google: 2, other: 1 });
    // signup counters are cumulative — today is included in d7 and d30, etc.
    expect(stats.newSignups.today).toBe(1);
    expect(stats.newSignups.d7).toBe(2); // today + 3 days ago
    expect(stats.newSignups.d30).toBe(3); // + 10 days ago

    expect(stats.storage.totalBytes).toBe(150);
    expect(stats.storage.totalObjects).toBe(2);

    expect(stats.onboarding.started).toBe(2);
    expect(stats.onboarding.sourcesSelected).toBe(2);
    expect(stats.onboarding.detailsConfirmed).toBe(1);
    expect(stats.onboarding.questionnaireCompleted).toBe(1);
    expect(stats.onboarding.firstDocUploaded).toBe(1);
    expect(stats.onboarding.filingComplete).toBe(1);

    expect(new Date(stats.generatedAt).getTime()).toBeGreaterThan(0);
  });

  it("handles an empty tenant gracefully", async () => {
    listUsersPages.push({ users: [], pageToken: undefined });
    fakeGetFiles.mockResolvedValueOnce([[], null]);
    // Override collectionGroup to return zero docs for this test.
    fakeCollectionGroup.mockReturnValueOnce({
      async get() {
        return { docs: [] };
      },
    } as unknown as ReturnType<typeof fakeCollectionGroup>);

    const stats = await computeAdminStats();
    expect(stats.totalUsers).toBe(0);
    expect(stats.storage.totalBytes).toBe(0);
    expect(stats.onboarding.started).toBe(0);
  });
});
