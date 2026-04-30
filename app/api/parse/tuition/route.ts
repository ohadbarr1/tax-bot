/**
 * POST /api/parse/tuition
 *
 * Parses an Israeli tuition certificate (אישור על תשלום שכר לימוד) via
 * Claude vision. Drives BA/MA/PHD credit-points (1 + 0.5 + 1 over 3 years
 * post-degree per ITA rule).
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
  TuitionReceiptShape,
  TUITION_SYSTEM_PROMPT,
  type TuitionReceipt,
} from "@/lib/api/schemas/parse-tuition";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<TuitionReceipt>)
  | undefined;
export function __setTuitionVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<TuitionReceipt>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: TuitionReceiptShape,
    systemPrompt: TUITION_SYSTEM_PROMPT,
    vision: visionForTesting,
  });
  if (!result.ok) return jsonError(result.status, result.error);

  return jsonOk({
    success: true,
    data: result.data,
    provenance: buildProvenance(extracted.file),
  });
}

export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "parse-tuition", limit: 15 }),
);

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
