/**
 * lib/api/schemas/mine.ts — Zod schemas for /api/mine/document.
 *
 * The route accepts multipart/form-data with one `file` field and an optional
 * `type` hint. Hard cap on file size mirrors `MAX_BYTES` in the route.
 */

import { z } from "zod";

const MAX_MINE_BYTES = 10 * 1024 * 1024;

export const MINE_VAULT_DOC_TYPES = [
  "form106",
  "form135",
  "form867",
  "ibkr",
  "pension",
  "receipt",
  "bank_statement",
  "rsu_grant",
  "rental_contract",
  "other",
] as const;

export const MineUploadMetaSchema = z.object({
  name: z.string().min(1).max(512),
  size: z.number().int().min(1).max(MAX_MINE_BYTES),
  type: z.string().max(255).optional(),
});

export const MineHintTypeSchema = z.enum(MINE_VAULT_DOC_TYPES).optional();

export { MAX_MINE_BYTES };
