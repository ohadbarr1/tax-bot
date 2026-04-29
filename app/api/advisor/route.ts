/**
 * POST /api/advisor — Hebrew tax-advisor chat (Anthropic streaming).
 *
 * Auth + PII guarantees (closes F-1, F-3, F-6, F1.2.1):
 *   1. `withUser` verifies the Bearer ID token (with `checkRevoked: true`)
 *      and forwards the verified `uid` to the inner handler.
 *   2. `withRateLimitForUser` enforces a per-uid+ip quota — the route bills
 *      our Anthropic key per call.
 *   3. The request body is validated by `AdvisorRequestSchema`. It does NOT
 *      contain `taxpayer` / `financials` — those PII fields are re-read
 *      server-side from `users/{uid}/private/state` via the Admin SDK so a
 *      malicious client cannot forge another user's draft.
 */

import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { buildSystemPrompt, buildDraftContext } from "@/lib/advisorPrompt";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { withUser } from "@/lib/api/withUser";
import { withRateLimitForUser } from "@/lib/api/withRateLimit";
import {
  invalidInput,
  invalidInputFromZod,
  notFound,
  serviceUnavailable,
  internalError,
} from "@/lib/api/errorEnvelope";
import { AdvisorRequestSchema } from "@/lib/api/schemas/advisor";
import type { AppState, TaxPayer, FinancialData } from "@/types";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ERROR_GENERIC =
  "שגיאה בתקשורת עם היועץ. אנא נסה שוב בעוד רגע.";

async function handle(
  request: NextRequest,
  ctx: { uid: string },
): Promise<Response> {
  // Guard FIRST — `streamText` would otherwise commit response headers and
  // then throw mid-stream, leaving the client with an empty 200.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[advisor] ANTHROPIC_API_KEY is not set — returning 503");
    return serviceUnavailable(
      "השירות אינו זמין כרגע. נסה שוב מאוחר יותר או פנה לתמיכה.",
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidInput("גוף הבקשה אינו JSON תקין.");
  }
  const parsed = AdvisorRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidInputFromZod(parsed.error.issues, "פורמט הבקשה אינו תקין.");
  }
  const { messages, taxYear } = parsed.data;

  // Re-read PII server-side from the authenticated user's private state.
  // NEVER accept taxpayer/financials from the request body. (Closes F-6.)
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
    console.error("[advisor] firestore read failed:", err);
    // Continue with no draft context — degrade gracefully.
  }

  // If neither taxpayer nor financials exist, we have nothing to ground the
  // advisor on. Return 404 so the client can prompt the user to fill the
  // questionnaire first.
  if (!taxpayer || !financials) {
    return notFound("לא נמצאה טיוטת מס. השלם תחילה את השאלון.");
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt = buildSystemPrompt();
  const draftContext = buildDraftContext(
    taxpayer,
    financials,
    taxYear ?? currentTaxYear(),
  );
  const fullSystem = `${systemPrompt}\n\n${draftContext}`;

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: fullSystem,
      messages,
      maxOutputTokens: 1024,
      providerOptions: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    });
    return result.toTextStreamResponse();
  } catch (err) {
    console.error("[advisor] streamText failed:", err);
    return internalError(ERROR_GENERIC, err instanceof Error ? err.message : String(err));
  }
}

export const POST = withUser(
  withRateLimitForUser(handle, { prefix: "advisor", limit: 30 }),
);
