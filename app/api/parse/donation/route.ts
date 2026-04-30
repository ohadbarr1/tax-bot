/**
 * POST /api/parse/donation
 *
 * Parses an Israeli donation receipt (קבלה לפי סעיף 46) via Claude vision.
 * See `lib/api/schemas/parse-donation.ts` for the field schema and Hebrew
 * label expectations. Reuses `lib/api/parseDocument.ts` for file extraction
 * + vision dispatch + provenance.
 *
 * Auth: withUser (required). Rate-limit: 15/min/uid.
 */

import type { NextRequest } from "next/server";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  extractMultipartFile,
  parseDocumentViaVision,
  buildProvenance,
  type ExtractedFile,
} from "@/lib/api/parseDocument";
import {
  DonationReceiptShape,
  DONATION_SYSTEM_PROMPT,
  type DonationReceipt,
} from "@/lib/api/schemas/parse-donation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Test-injection seam — the test sets this to bypass the live Anthropic
 * call. Production must not call setVisionForTesting.
 */
let visionForTesting:
  | ((file: ExtractedFile) => Promise<DonationReceipt>)
  | undefined;
export function __setDonationVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<DonationReceipt>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) {
    return jsonError(extracted.status, extracted.error);
  }

  const result = await parseDocumentViaVision(extracted.file, {
    schema: DonationReceiptShape,
    systemPrompt: DONATION_SYSTEM_PROMPT,
    vision: visionForTesting,
  });
  if (!result.ok) {
    return jsonError(result.status, result.error);
  }

  return jsonOk({
    success: true,
    data: result.data,
    provenance: buildProvenance(extracted.file),
  });
}

export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "parse-donation", limit: 15 }),
);

// ─── Local helpers ────────────────────────────────────────────────────────────

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
