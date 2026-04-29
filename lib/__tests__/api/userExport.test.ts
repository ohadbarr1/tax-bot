/**
 * lib/__tests__/api/userExport.test.ts — closes security-F1.2.9.
 *
 * Asserts that `GET /api/user/export` returns a real zip stream containing:
 *   - firestore.json — every Firestore doc under `users/{uid}/...`
 *   - storage/<file> — every uploaded file the user has in Cloud Storage
 *   - metadata.json — paths, sizes, content-types, timestamps
 *
 * The previous implementation returned metadata-only JSON, which violates
 * GDPR Art. 15 / חוק הגנת הפרטיות § 13 ("כל המידע אודותיו"). This test
 * pins the new full-bytes contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

const verifyIdToken = vi.fn();

// Firestore mock — emits two docs: one at users/<uid>/private/state, one at
// users/<uid>/private/_deletion (for the deletion-status feature). The export
// MUST serialize every doc.
const stateDoc = {
  exists: true,
  ref: { path: "users/u1/private/state" },
  data: () => ({ state: { taxpayer: { fullName: "ישראלי" } } }),
};
const draftDoc = {
  exists: true,
  ref: { path: "users/u1/drafts/d1" },
  data: () => ({ taxYear: 2024 }),
};
const fakeListDocs = vi.fn();
const fakeListCollections = vi.fn();
const fakeDoc = vi.fn();

// Storage mock — two files; one tiny, one over 100 MB to assert the
// large-file skip-with-manifest behavior.
const tinyFile = {
  name: "users/u1/documents/form-106.pdf",
  metadata: {
    size: "1234",
    contentType: "application/pdf",
    updated: "2026-04-29T00:00:00Z",
  },
  download: vi.fn(async () => [Buffer.from("PDF-BYTES-HERE")]),
};
const hugeFile = {
  name: "users/u1/documents/scan.tiff",
  metadata: {
    size: String(150 * 1024 * 1024),
    contentType: "image/tiff",
    updated: "2026-04-28T00:00:00Z",
  },
  download: vi.fn(async () => [Buffer.alloc(0)]),
};
const fakeGetFiles = vi.fn(async () => [[tinyFile, hugeFile]]);

vi.mock("../../firebase/admin", () => {
  const buildDocRef = (path: string) => ({
    path,
    get: async () => ({
      exists: true,
      ref: { path },
      data: () => ({ marker: path }),
    }),
    listCollections: async () => [],
  });
  return {
    getAdminAuth: () => ({ verifyIdToken }),
    getAdminFirestore: () => ({
      doc: (p: string) => {
        fakeDoc(p);
        if (p === `users/u1`) {
          return {
            path: p,
            get: async () => ({ exists: false, ref: { path: p }, data: () => undefined }),
            listCollections: fakeListCollections,
          };
        }
        return buildDocRef(p);
      },
      collection: (p: string) => ({
        listDocuments: () => fakeListDocs(p),
      }),
    }),
    getAdminStorage: () => ({
      bucket: () => ({ getFiles: fakeGetFiles }),
    }),
    verifyIdToken: vi.fn(),
  };
});

// The export route uses `withUser` which calls `getAdminAuth().verifyIdToken`
// — same shape as the auth-required test mock pattern.

describe("GET /api/user/export — DSAR full-bytes (security-F1.2.9)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    fakeListCollections.mockReset();
    fakeListDocs.mockReset();
    fakeDoc.mockReset();
    tinyFile.download.mockClear();
    hugeFile.download.mockClear();
    fakeGetFiles.mockClear();
  });

  it("returns 401 without bearer token", async () => {
    const mod = (await import("@/app/api/user/export/route")) as unknown as {
      GET: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/export", { method: "GET" });
    const res = await mod.GET(req);
    expect(res.status).toBe(401);
  });

  it("returns a zip stream with firestore.json, metadata.json, and storage bytes", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    fakeListCollections.mockResolvedValue([
      { id: "private", listDocuments: async () => [{ path: "users/u1/private/state", get: async () => stateDoc }] },
      { id: "drafts", listDocuments: async () => [{ path: "users/u1/drafts/d1", get: async () => draftDoc }] },
    ]);
    fakeListDocs.mockImplementation(async (p: string) => {
      if (p === "users/u1/private") {
        return [{ path: "users/u1/private/state", get: async () => stateDoc }];
      }
      if (p === "users/u1/drafts") {
        return [{ path: "users/u1/drafts/d1", get: async () => draftDoc }];
      }
      return [];
    });

    const mod = (await import("@/app/api/user/export/route")) as unknown as {
      GET: (req: Request) => Promise<Response>;
    };
    const req = new Request("https://example.test/api/user/export", {
      method: "GET",
      headers: { authorization: "Bearer ok" },
    });
    const res = await mod.GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(/attachment;\s*filename=.*\.zip/);

    const ab = await res.arrayBuffer();
    expect(ab.byteLength).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(ab);

    // firestore.json present and parseable
    const firestoreEntry = zip.file("firestore.json");
    expect(firestoreEntry).not.toBeNull();
    const firestoreJson = JSON.parse(await firestoreEntry!.async("string"));
    expect(firestoreJson).toHaveProperty("docs");
    const paths = (firestoreJson.docs as Array<{ path: string }>).map((d) => d.path);
    expect(paths).toContain("users/u1/private/state");
    expect(paths).toContain("users/u1/drafts/d1");

    // metadata.json present
    const metaEntry = zip.file("metadata.json");
    expect(metaEntry).not.toBeNull();
    const meta = JSON.parse(await metaEntry!.async("string"));
    expect(meta.uid).toBe("u1");
    expect(Array.isArray(meta.files)).toBe(true);

    // tiny file: bytes included
    const tinyEntry = zip.file("storage/users/u1/documents/form-106.pdf");
    expect(tinyEntry, "tiny file bytes must be in zip").not.toBeNull();
    const tinyBytes = await tinyEntry!.async("string");
    expect(tinyBytes).toBe("PDF-BYTES-HERE");

    // huge file: skipped with manifest entry "available on request"
    expect(hugeFile.download).not.toHaveBeenCalled();
    const hugeFileMeta = (meta.files as Array<{ path: string; skipped?: string }>).find(
      (f) => f.path === "users/u1/documents/scan.tiff",
    );
    expect(hugeFileMeta?.skipped).toMatch(/available on request|too large/i);
  });
});
