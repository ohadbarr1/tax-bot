/**
 * POST /api/parse/form-867-inbound
 *
 * Parses an Israeli broker / bank annual securities tax certificate
 * (אישור שנתי לבעל ני״ע / טופס 867 / יומן עסקאות) via Claude vision.
 * Drives capital-gains / dividend / interest reporting on Form 1301
 * §15 / §17.
 *
 * Distinct from `/api/parse/ibkr` which handles Interactive Brokers'
 * English multi-table CSV format. THIS route handles the Hebrew Israeli-
 * broker PDF.
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
  Form867InboundShape,
  FORM867_INBOUND_SYSTEM_PROMPT,
  type Form867Inbound,
} from "@/lib/api/schemas/parse-form867-inbound";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<Form867Inbound>)
  | undefined;
export function __setForm867InboundVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<Form867Inbound>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: Form867InboundShape,
    systemPrompt: FORM867_INBOUND_SYSTEM_PROMPT,
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
  withRateLimitForUser(handle, { prefix: "parse-form-867-inbound", limit: 15 }),
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
