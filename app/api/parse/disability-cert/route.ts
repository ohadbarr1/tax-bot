/**
 * POST /api/parse/disability-cert
 *
 * Parses an Israeli disability certificate (תעודת נכה / אישור נכות) via
 * Claude vision. Feeds calculateDisabilityExemption() (§9(5) full-income
 * exemption — already shipped in Phase 0 §0.C).
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
  DisabilityCertShape,
  DISABILITY_SYSTEM_PROMPT,
  type DisabilityCert,
} from "@/lib/api/schemas/parse-disability";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<DisabilityCert>)
  | undefined;
export function __setDisabilityVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<DisabilityCert>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: DisabilityCertShape,
    systemPrompt: DISABILITY_SYSTEM_PROMPT,
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
  withRateLimitForUser(handle, { prefix: "parse-disability-cert", limit: 15 }),
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
