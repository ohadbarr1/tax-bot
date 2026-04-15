import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AdvisorNudgeListSchema, type AdvisorNudgeListResponse } from "@/lib/advisorNudge";
import { buildNudgeSystemPrompt, buildNudgeDraftContext } from "@/lib/advisorNudgePrompt";
import { currentTaxYear } from "@/lib/currentTaxYear";
import type { TaxPayer, FinancialData } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const EMPTY: AdvisorNudgeListResponse = { nudges: [] };

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Silent degrade — the rail falls back to deterministic nudges.
    return json(EMPTY, 200);
  }

  let payload: {
    taxpayer?: TaxPayer;
    financials?: FinancialData;
    taxYear?: number;
  };
  try {
    payload = await request.json();
  } catch {
    return json(EMPTY, 200);
  }

  const { taxpayer, financials, taxYear } = payload;
  if (!taxpayer || !financials) return json(EMPTY, 200);

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = buildNudgeSystemPrompt();
  const ctx = buildNudgeDraftContext(taxpayer, financials, taxYear ?? currentTaxYear());

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: AdvisorNudgeListSchema,
      system,
      messages: [
        {
          role: "user",
          content: `${ctx}\n\nהחזר עד 4 nudges בלבד. אם אין מה להציע — החזר מערך ריק.`,
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
