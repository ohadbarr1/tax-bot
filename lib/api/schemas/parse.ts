/**
 * lib/api/schemas/parse.ts — Zod schemas for /api/parse/{form-106,ibkr}.
 *
 * Both endpoints accept multipart/form-data with a single `file` field. We
 * validate (1) the presence of a File, (2) its size, and (3) the declared MIME
 * type / extension. Pure JSON Zod can't model `File` directly, so we parse the
 * extracted file out-of-band and then validate metadata via these schemas.
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
});

export function form106ExtensionAccepted(name: string): boolean {
  const lower = name.toLowerCase();
  return FORM106_ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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
