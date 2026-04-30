/**
 * POST /api/parse/withholding-cert
 *
 * Parses an Israeli withholding-at-source certificate (אישור ניכוי במקור —
 * Form 60a/60b) via Claude vision. Used for cross-employer reconciliation.
 *
 * NOTE — cross-workstream dependency on 1.L (encrypted-PDF support):
 *   ITA emits these certificates as PDFs encrypted with the recipient's
 *   ת.ז. as password. THIS ROUTE does NOT handle decryption today; once
 *   1.L lands a `password` form-data field will be forwarded to the PDF
 *   preprocessor. Until then, the user must remove the password client-side
 *   (or upload an unencrypted scan) — flagged in the route doc and audited
 *   by the test fixture.
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
  WithholdingCertShape,
  WITHHOLDING_SYSTEM_PROMPT,
  type WithholdingCert,
} from "@/lib/api/schemas/parse-withholding";

export const runtime = "nodejs";
export const maxDuration = 60;

let visionForTesting:
  | ((file: ExtractedFile) => Promise<WithholdingCert>)
  | undefined;
export function __setWithholdingVisionForTesting(
  fn: ((file: ExtractedFile) => Promise<WithholdingCert>) | undefined,
): void {
  visionForTesting = fn;
}

async function handle(request: NextRequest): Promise<Response> {
  const extracted = await extractMultipartFile(request);
  if (!extracted.ok) return jsonError(extracted.status, extracted.error);

  const result = await parseDocumentViaVision(extracted.file, {
    schema: WithholdingCertShape,
    systemPrompt: WITHHOLDING_SYSTEM_PROMPT,
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
  withRateLimitForUser(handle, { prefix: "parse-withholding-cert", limit: 15 }),
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
