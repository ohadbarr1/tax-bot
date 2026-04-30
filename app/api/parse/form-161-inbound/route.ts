/**
 * POST /api/parse/form-161-inbound
 *
 * Parses an EMPLOYER-ISSUED Form 161 (הודעת מעביד על תשלום מענק עקב פרישה)
 * via Claude vision. Drives §9(7א) severance exemption + §8(g) spreading
 * (computed by the engine in lib/calculateTax.ts).
 *
 * Distinct from `/api/generate/form-161` which produces the IN-HOUSE 161
 * for forward-spreading scenarios — this parses the one the EMPLOYER gives
 * the employee on separation.
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
  Form161InboundShape,
  FORM161_INBOUND_SYSTEM_PROMPT,
  type Form161Inbound,
} from "@/lib/api/schemas/parse-form161-inbound";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<Form161Inbound>)
  | undefined;
export function __setForm161InboundVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<Form161Inbound>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: Form161InboundShape,
    systemPrompt: FORM161_INBOUND_SYSTEM_PROMPT,
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
  withRateLimitForUser(handle, { prefix: "parse-form-161-inbound", limit: 15 }),
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
