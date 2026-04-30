/**
 * POST /api/parse/pension-fund
 *
 * Parses an Israeli annual statement from a קופ״ג / קרן פנסיה / קרן השתלמות
 * via Claude vision. Drives the §47 ceiling check + §3(e3) study-fund
 * over-cap recognition.
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
  PensionFundShape,
  PENSION_FUND_SYSTEM_PROMPT,
  type PensionFund,
} from "@/lib/api/schemas/parse-pensionfund";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<PensionFund>)
  | undefined;
export function __setPensionFundVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<PensionFund>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: PensionFundShape,
    systemPrompt: PENSION_FUND_SYSTEM_PROMPT,
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
  withRateLimitForUser(handle, { prefix: "parse-pension-fund", limit: 15 }),
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
