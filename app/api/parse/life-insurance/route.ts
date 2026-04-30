/**
 * POST /api/parse/life-insurance
 *
 * Parses an Israeli life-insurance / disability / LTC annual certificate
 * (אישור שנתי לצרכי מס לפי סעיף 45א) via Claude vision. Drives the
 * §45a 25% credit calculation.
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
  LifeInsuranceShape,
  LIFE_INS_SYSTEM_PROMPT,
  type LifeInsurance,
} from "@/lib/api/schemas/parse-lifeins";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<LifeInsurance>)
  | undefined;
export function __setLifeInsuranceVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<LifeInsurance>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: LifeInsuranceShape,
    systemPrompt: LIFE_INS_SYSTEM_PROMPT,
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
  withRateLimitForUser(handle, { prefix: "parse-life-insurance", limit: 15 }),
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
