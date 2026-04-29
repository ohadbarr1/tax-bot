/**
 * POST /api/advisor/nudges — Hebrew tax-advisor nudge rail.
 *
 * Mirrors /api/advisor's auth + PII guarantees:
 *   1. Bearer ID token verified via `withUser` (with `checkRevoked: true`).
 *   2. Per-uid+ip rate limit.
 *   3. Body validated by `AdvisorNudgesRequestSchema` — taxpayer / financials
 *      are re-read server-side from `users/{uid}/private/state`. (Closes F-6.)
 *
 * Failure mode: when the nudge generator can't run (no API key, no draft,
 * or generateObject errors), we return an empty `{ nudges: [] }` with 200 so
 * the rail falls back to deterministic nudges client-side.
 */

import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AdvisorNudgeListSchema, type AdvisorNudgeListResponse } from "@/lib/advisorNudge";
import { buildNudgeSystemPrompt, buildNudgeDraftContext } from "@/lib/advisorNudgePrompt";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  invalidInput,
  invalidInputFromZod,
} from "@/lib/api/errorEnvelope";
import { AdvisorNudgesRequestSchema } from "@/lib/api/schemas/advisor";
import type { AppState, TaxPayer, FinancialData } from "@/types";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const EMPTY: AdvisorNudgeListResponse = { nudges: [] };

async function handle(
  request: NextRequest,
  ctx: { uid: string },
): Promise<Response> {
  // Without an API key the rail falls back to deterministic nudges client-side.
  if (!process.env.ANTHROPIC_API_KEY) return json(EMPTY, 200);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidInput("גוף הבקשה אינו JSON תקין.");
  }
  const parsed = AdvisorNudgesRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidInputFromZod(parsed.error.issues, "פורמט הבקשה אינו תקין.");
  }
  const { taxYear } = parsed.data;

  // Re-read PII server-side. NEVER trust client-supplied taxpayer/financials.
  // (Closes F-6.)
  let taxpayer: TaxPayer | undefined;
  let financials: FinancialData | undefined;
  try {
    const firestore = getAdminFirestore();
    const snap = await firestore
      .doc(`users/${ctx.uid}/private/state`)
      .get();
    if (snap.exists) {
      const data = snap.data() as { state?: AppState } | undefined;
      taxpayer = data?.state?.taxpayer;
      financials = data?.state?.financials;
    }
  } catch (err) {
    console.error("[advisor/nudges] firestore read failed:", err);
    return json(EMPTY, 200);
  }

  if (!taxpayer || !financials) return json(EMPTY, 200);

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = buildNudgeSystemPrompt();
  const ctxText = buildNudgeDraftContext(
    taxpayer,
    financials,
    taxYear ?? currentTaxYear(),
  );

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: AdvisorNudgeListSchema,
      system,
      messages: [
        {
          role: "user",
          content: `${ctxText}\n\nהחזר עד 4 nudges בלבד. אם אין מה להציע — החזר מערך ריק.`,
        },
      ],
      maxOutputTokens: 1024,
    });
    return json(object, 200);
  } catch (err) {
    console.error("[advisor/nudges] generateObject failed:", err);
    return json(EMPTY, 200);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "advisor-nudges", limit: 60 }),
);
