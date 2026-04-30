/**
 * POST /api/parse/mil-service
 *
 * Parses an Israeli military / national-service discharge certificate
 * (תעודת שחרור / תעודת חוגר) via Claude vision. Drives the post-discharge
 * credit-points (1-2 points for 2-3 years post-discharge per ITA rule).
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
  MilServiceShape,
  MIL_SERVICE_SYSTEM_PROMPT,
  type MilService,
} from "@/lib/api/schemas/parse-milservice";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<MilService>)
  | undefined;
export function __setMilServiceVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<MilService>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: MilServiceShape,
    systemPrompt: MIL_SERVICE_SYSTEM_PROMPT,
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
  withRateLimitForUser(handle, { prefix: "parse-mil-service", limit: 15 }),
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
