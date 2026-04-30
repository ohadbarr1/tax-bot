/**
 * lib/api/parseDocument.ts — shared Claude-vision document extractor.
 *
 * The 9 inbound document parsers under `app/api/parse/*` (donation, tuition,
 * life-insurance, pension-fund, disability-cert, mil-service,
 * withholding-cert, form-161-inbound, form-867-inbound) all follow the same
 * skeleton:
 *
 *   1. Extract `file` from multipart/form-data, validate name/size/extension.
 *   2. Convert HEIC → JPEG (iOS upload reality), pass-through everything else.
 *   3. Send to Claude vision with a per-doctype Zod schema + system prompt
 *      that pins the Hebrew label expectations from `audits/ingestion.md`.
 *   4. Return `{ success: true, data, provenance }`.
 *
 * This module factors out steps 1-3 so each route only owns its schema,
 * its system prompt, and its response shape.
 *
 * Tests inject a fake `vision` implementation via `parseDocumentViaVision`'s
 * second parameter so the suite never burns Anthropic tokens.
 */

import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { z } from "zod";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/uploadLimits";
import { logger } from "@/lib/logger";

// ─── Errors (Hebrew, user-facing) ─────────────────────────────────────────────

export const PARSE_ERROR = {
  NO_FILE: "לא סופק קובץ. אנא בחר קובץ של המסמך הסרוק.",
  BAD_FORMDATA: "פורמט הבקשה אינו תקין.",
  BAD_META: "מטא-נתוני הקובץ אינם תקינים.",
  EMPTY: "הקובץ שהועלה ריק. אנא נסה שוב עם קובץ תקין.",
  TOO_BIG: `הקובץ חורג מהמגבלה של ${MAX_UPLOAD_LABEL}.`,
  BAD_TYPE: "סוג קובץ לא נתמך. יש להעלות PDF, JPG, PNG, או HEIC.",
  PREPROCESS: "שגיאה בעיבוד הקובץ. אנא נסה שוב.",
  MISSING_KEY: "שירות הזיהוי אינו זמין כרגע.",
  VISION_FAILED: "לא הצלחנו לקרוא את המסמך. נסה שוב או מלא ידנית.",
} as const;

// ─── Accepted extensions ──────────────────────────────────────────────────────

export const PARSE_ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".tiff",
  ".tif",
] as const;

export const PARSE_ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
] as const;

export function parseExtensionAccepted(name: string): boolean {
  const lower = name.toLowerCase();
  return PARSE_ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function parseMediaTypeAccepted(mediaType: string): boolean {
  return (PARSE_ACCEPTED_MIME as readonly string[]).includes(mediaType);
}

/**
 * Accept a file when EITHER the extension OR the declared MIME matches.
 * Belt-and-suspenders against:
 *  - generic `application/octet-stream` MIME (we lean on extension)
 *  - jsdom-style FormData round-trips that strip filenames (we lean on MIME)
 */
export function parseFileAccepted(name: string, mediaType: string): boolean {
  return parseExtensionAccepted(name) || parseMediaTypeAccepted(mediaType);
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ExtractedFile {
  bytes: Uint8Array;
  mediaType: string;
  fileName: string;
}

/** Discriminated result so routes can branch without try/catch. */
export type FileExtractResult =
  | { ok: true; file: ExtractedFile; password?: string }
  | { ok: false; status: number; error: string };

/** Discriminated result of the vision call. */
export type VisionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/**
 * Per-call options. `vision` lets tests inject a deterministic stub that
 * returns a known shape; production calls use the default Anthropic call.
 */
export interface VisionOptions<T> {
  schema: z.ZodType<T>;
  systemPrompt: string;
  /** Override for tests — bypasses the live Anthropic call. */
  vision?: (file: ExtractedFile) => Promise<T>;
}

// ─── 1. Extract + validate the multipart file ────────────────────────────────

/**
 * Extract `file` (and optionally `password`) from a multipart/form-data
 * request body, validating size + extension/MIME, normalising HEIC → JPEG.
 *
 * Phase 1 §1.L (closes ingestion-F-5): `password` is forwarded verbatim to
 * the caller via `result.password` so encrypted-PDF parsers (form-106 today;
 * 867 / 161 / withholding-cert tomorrow) can pass it into pdf-parse. The
 * field is OPTIONAL; absent means "treat as unencrypted, surface 422 +
 * Hebrew prompt if the parser disagrees".
 *
 * The password is bounded at 64 chars (DoS guard); anything longer is
 * silently dropped rather than rejecting the whole upload — the parser will
 * then surface the same NEED_PASSWORD path as if no password had been sent.
 */
export async function extractMultipartFile(
  request: Request,
): Promise<FileExtractResult> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, status: 400, error: PARSE_ERROR.BAD_FORMDATA };
  }
  const file = formData.get("file");
  // jsdom / undici / browser native — `File extends Blob`. Some test envs
  // emit Blob when `FormData.set("file", new Blob(...), "name.pdf")` is
  // used, so accept either. The shape we need is `{ name, size, arrayBuffer }`.
  if (!file || typeof file === "string") {
    return { ok: false, status: 400, error: PARSE_ERROR.NO_FILE };
  }
  const fileLike = file as Blob & { name?: string };
  const fileName =
    fileLike.name && fileLike.name.length > 0 ? fileLike.name : "upload";
  if (fileLike.size === 0) {
    return { ok: false, status: 400, error: PARSE_ERROR.EMPTY };
  }
  if (fileLike.size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: PARSE_ERROR.TOO_BIG };
  }
  if (fileName.length > 512) {
    return { ok: false, status: 400, error: PARSE_ERROR.BAD_META };
  }
  if (!parseFileAccepted(fileName, fileLike.type ?? "")) {
    return { ok: false, status: 400, error: PARSE_ERROR.BAD_TYPE };
  }

  let bytes: Uint8Array;
  let mediaType: string;
  try {
    const converted = await loadAndMaybeConvert(fileLike, fileName);
    bytes = new Uint8Array(converted.bytes);
    mediaType = converted.mediaType;
  } catch (err) {
    logger.error({ event: "parse_document_preprocess_failed", err: serialErr(err) }, "preprocessing failed");
    return { ok: false, status: 400, error: PARSE_ERROR.PREPROCESS };
  }

  // Optional password (Phase 1 §1.L). 64-char cap — see PARSE_ERROR / schema
  // doc; longer values are dropped rather than failing the whole upload so
  // that a fat-fingered TZ doesn't surface as "form rejected".
  const rawPwd = formData.get("password");
  const password =
    typeof rawPwd === "string" && rawPwd.length > 0 && rawPwd.length <= 64
      ? rawPwd
      : undefined;

  return {
    ok: true,
    file: { bytes, mediaType, fileName },
    password,
  };
}

// ─── 2. Send to Claude vision ────────────────────────────────────────────────

/**
 * Run a Claude-vision extraction on an ExtractedFile against a per-doc schema.
 * Tests inject `opts.vision` to bypass Anthropic; production uses
 * `claude-sonnet-4-6` via the AI SDK.
 *
 * Returns `{ ok: true, data }` on success or `{ ok: false, status, error }`
 * on a missing API key (501) / generic failure (500).
 */
export async function parseDocumentViaVision<T>(
  file: ExtractedFile,
  opts: VisionOptions<T>,
): Promise<VisionResult<T>> {
  // Test injection point — the fake bypasses the SDK entirely.
  if (opts.vision) {
    try {
      const data = await opts.vision(file);
      return { ok: true, data };
    } catch (err) {
      logger.error({ event: "parse_document_vision_injected_failed", err: serialErr(err) }, "injected vision failed");
      return { ok: false, status: 500, error: PARSE_ERROR.VISION_FAILED };
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 501, error: PARSE_ERROR.MISSING_KEY };
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Claude vision wants `file` for PDFs, `image` for raster images.
  const isPdf = file.mediaType === "application/pdf";
  const filePart = isPdf
    ? ({ type: "file" as const, data: file.bytes, mediaType: file.mediaType })
    : ({ type: "image" as const, image: file.bytes, mediaType: file.mediaType });

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: opts.schema,
      system: opts.systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the requested fields from this document." },
            filePart,
          ],
        },
      ],
      maxOutputTokens: 1024,
    });
    return { ok: true, data: object };
  } catch (err) {
    logger.error({ event: "parse_document_generate_object_failed", err: serialErr(err) }, "generateObject failed");
    return { ok: false, status: 500, error: PARSE_ERROR.VISION_FAILED };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serialErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── 3. Provenance metadata helper ────────────────────────────────────────────

export interface DocumentProvenance {
  fileName: string;
  byteSize: number;
  mediaType: string;
  extractedAt: string; // ISO8601
}

export function buildProvenance(file: ExtractedFile): DocumentProvenance {
  return {
    fileName: file.fileName,
    byteSize: file.bytes.byteLength,
    mediaType: file.mediaType,
    extractedAt: new Date().toISOString(),
  };
}

// ─── HEIC handling — mirrors `app/api/mine/document/route.ts`. ───────────────

async function loadAndMaybeConvert(
  file: Blob,
  fileName: string,
): Promise<{ bytes: ArrayBuffer; mediaType: string }> {
  const raw = await file.arrayBuffer();
  const declared = normalizeMediaType(file.type, fileName);

  const isHeic =
    declared === "image/heic" ||
    declared === "image/heif" ||
    looksLikeHeic(raw);

  if (!isHeic) return { bytes: raw, mediaType: declared };

  type HeicConvertArgs = {
    buffer: Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  };
  type HeicConvert = (args: HeicConvertArgs) => Promise<ArrayBuffer | Uint8Array>;
  const mod = (await import("heic-convert")) as unknown as { default: HeicConvert };
  const heicConvert = mod.default;

  const jpeg = await heicConvert({
    buffer: new Uint8Array(raw),
    format: "JPEG",
    quality: 0.92,
  });
  const jpegU8 = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
  const jpegBuf = jpegU8.buffer.slice(
    jpegU8.byteOffset,
    jpegU8.byteOffset + jpegU8.byteLength,
  ) as ArrayBuffer;
  return { bytes: jpegBuf, mediaType: "image/jpeg" };
}

function normalizeMediaType(mime: string, name: string): string {
  if (mime && mime !== "application/octet-stream") return mime;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".tiff") || lower.endsWith(".tif")) return "image/tiff";
  return "application/octet-stream";
}

function looksLikeHeic(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const view = new Uint8Array(buf, 0, 12);
  const ftyp = String.fromCharCode(view[4], view[5], view[6], view[7]);
  if (ftyp !== "ftyp") return false;
  const brand = String.fromCharCode(view[8], view[9], view[10], view[11]);
  return (
    brand === "heic" ||
    brand === "heix" ||
    brand === "mif1" ||
    brand === "msf1" ||
    brand === "heis" ||
    brand === "hevc" ||
    brand === "hevx"
  );
}
