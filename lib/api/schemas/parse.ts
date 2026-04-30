/**
 * lib/api/schemas/parse.ts — Zod schemas for /api/parse/{form-106,ibkr}.
 *
 * Both endpoints accept multipart/form-data with a single `file` field. We
 * validate (1) the presence of a File, (2) its size, and (3) the declared MIME
 * type / extension. Pure JSON Zod can't model `File` directly, so we parse the
 * extracted file out-of-band and then validate metadata via these schemas.
 *
 * The full extracted-fields schema for Form 106 lives in
 * `lib/api/schemas/form106.ts` (`Form106ExtractedSchema`) — it is large enough
 * to deserve its own file with the field-code map kept in one place.
 */

import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/uploadLimits";

// ─── Form 106 (PDF + image) ──────────────────────────────────────────────────

export const FORM106_ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
] as const;

export const Form106UploadMetaSchema = z.object({
  name: z.string().min(1).max(512),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  type: z.string().max(255).optional(),
  /**
   * Optional password for encrypted PDFs (Phase 1 §1.L, closes ingestion-F-5).
   * ITA's own ניכוי-במקור / 867 / 161 PDFs ship encrypted with the recipient's
   * תעודת זהות (TZ) as the user-password. When the upload is encrypted and no
   * `password` is supplied, the route returns 422 with a TZ-prompt error;
   * client retries with the TZ in this field.
   *
   * Capped at 64 chars: a TZ is 9 digits, an arbitrary owner-password may be
   * up to ~32 chars (PDF spec allows 127 but no real-world ITA cert exceeds
   * the TZ width). 64 leaves head-room without becoming a DoS surface.
   */
  password: z.string().max(64).optional(),
});

export function form106ExtensionAccepted(name: string): boolean {
  const lower = name.toLowerCase();
  return FORM106_ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Re-export the extracted-fields schema for convenience — the route imports
// from this module so callers don't need to know the file split.
export { Form106ExtractedSchema, Form106IncomeType } from "./form106";
export type { Form106Extracted } from "./form106";

// ─── IBKR (CSV) ──────────────────────────────────────────────────────────────

export const IBKR_ACCEPTED_MIME = [
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/octet-stream",
] as const;

export const IbkrUploadMetaSchema = z.object({
  name: z.string().min(1).max(512),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  type: z.string().max(255).optional(),
});

export function ibkrFileAccepted(name: string, type: string): boolean {
  return name.toLowerCase().endsWith(".csv") ||
    (IBKR_ACCEPTED_MIME as readonly string[]).includes(type);
}
