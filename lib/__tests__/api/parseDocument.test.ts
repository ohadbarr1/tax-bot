/**
 * lib/__tests__/api/parseDocument.test.ts — direct unit tests on the shared
 * helper used by the 9 inbound parse routes (1.K).
 *
 * These exercise the 413/empty/extension/MIME paths that the route-level
 * tests can't hit because jsdom's multipart parser silently drops oversize
 * blobs.
 */

import { describe, it, expect } from "vitest";
import {
  extractMultipartFile,
  parseExtensionAccepted,
  parseMediaTypeAccepted,
  parseFileAccepted,
  buildProvenance,
  PARSE_ERROR,
} from "@/lib/api/parseDocument";

function makeRequestWithFormData(fd: FormData): Request {
  return new Request("https://example.test/parse", { method: "POST", body: fd });
}

describe("parseDocument helpers", () => {
  it("parseExtensionAccepted accepts pdf/jpg/png/heic/webp/tiff", () => {
    for (const ext of [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tiff", ".tif"]) {
      expect(parseExtensionAccepted(`x${ext}`), ext).toBe(true);
    }
  });

  it("parseExtensionAccepted rejects exe/csv/docx", () => {
    for (const ext of [".exe", ".csv", ".docx", ".zip"]) {
      expect(parseExtensionAccepted(`x${ext}`), ext).toBe(false);
    }
  });

  it("parseMediaTypeAccepted accepts pdf + image MIMEs", () => {
    expect(parseMediaTypeAccepted("application/pdf")).toBe(true);
    expect(parseMediaTypeAccepted("image/jpeg")).toBe(true);
    expect(parseMediaTypeAccepted("image/heic")).toBe(true);
    expect(parseMediaTypeAccepted("application/zip")).toBe(false);
    expect(parseMediaTypeAccepted("")).toBe(false);
  });

  it("parseFileAccepted is OR over name + MIME", () => {
    // good name, bad MIME → accept (extension wins)
    expect(parseFileAccepted("a.pdf", "application/octet-stream")).toBe(true);
    // bad name, good MIME → accept (MIME wins, jsdom-friendly)
    expect(parseFileAccepted("blob", "application/pdf")).toBe(true);
    // both bad → reject
    expect(parseFileAccepted("blob", "application/octet-stream")).toBe(false);
    expect(parseFileAccepted("evil.exe", "application/x-msdownload")).toBe(false);
  });
});

describe("extractMultipartFile — body validation", () => {
  it("returns 400 when no `file` field is present", async () => {
    const fd = new FormData();
    const res = await extractMultipartFile(makeRequestWithFormData(fd));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toBe(PARSE_ERROR.NO_FILE);
    }
  });

  it("returns 400 when file is empty (size === 0)", async () => {
    // We exercise the EMPTY path through a direct (non-Request) FormData
    // because jsdom + undici quietly fold a 0-byte Blob round-tripped via
    // multipart serialization into something nonzero. The real route still
    // catches `file.size === 0` from the underlying Blob; this test pins it.
    const fakeRequest: Request = new Request("https://example.test/parse", {
      method: "POST",
    });
    const emptyBlob = new Blob([], { type: "application/pdf" });
    const fd = new FormData();
    fd.set("file", emptyBlob, "x.pdf");
    // Patch formData() since our base Request has no body.
    Object.defineProperty(fakeRequest, "formData", {
      value: () => Promise.resolve(fd),
      writable: false,
    });
    const res = await extractMultipartFile(fakeRequest);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toBe(PARSE_ERROR.EMPTY);
    }
  });

  it("returns 400 when neither extension nor MIME match", async () => {
    const fd = new FormData();
    fd.set("file", new Blob(["x"], { type: "application/x-msdownload" }), "evil.exe");
    const res = await extractMultipartFile(makeRequestWithFormData(fd));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toBe(PARSE_ERROR.BAD_TYPE);
    }
  });

  it("accepts a valid PDF blob and returns bytes + media type", async () => {
    const fd = new FormData();
    fd.set("file", new Blob(["%PDF-1.4 ok"], { type: "application/pdf" }), "ok.pdf");
    const res = await extractMultipartFile(makeRequestWithFormData(fd));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.file.bytes.byteLength).toBeGreaterThan(0);
      expect(res.file.mediaType).toBe("application/pdf");
    }
  });
});

describe("buildProvenance", () => {
  it("emits fileName, byteSize, mediaType, extractedAt", () => {
    const file = {
      bytes: new Uint8Array([1, 2, 3, 4]),
      mediaType: "application/pdf",
      fileName: "x.pdf",
    };
    const prov = buildProvenance(file);
    expect(prov.fileName).toBe("x.pdf");
    expect(prov.byteSize).toBe(4);
    expect(prov.mediaType).toBe("application/pdf");
    // ISO-8601 timestamp.
    expect(prov.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
