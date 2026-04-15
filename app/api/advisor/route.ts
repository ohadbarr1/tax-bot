import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { buildSystemPrompt, buildDraftContext } from "@/lib/advisorPrompt";
import { currentTaxYear } from "@/lib/currentTaxYear";
import type { TaxPayer, FinancialData } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hebrew-facing error strings the client renders verbatim. Keep short —
// they're surfaced inside the chat bubble.
const ERROR_MISSING_KEY =
  "השירות אינו זמין כרגע. נסה שוב מאוחר יותר או פנה לתמיכה.";
const ERROR_GENERIC =
  "שגיאה בתקשורת עם היועץ. אנא נסה שוב בעוד רגע.";

export async function POST(request: Request) {
  // Guard FIRST — `streamText` would otherwise commit response headers and
  // then throw mid-stream, leaving the client with an empty 200. Return a
  // clean JSON 501 here so the UI can show a real error.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[advisor] ANTHROPIC_API_KEY is not set — returning 501");
    return new Response(JSON.stringify({ error: ERROR_MISSING_KEY }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { messages, taxpayer, financials, taxYear } =
    (await request.json()) as {
      messages: { role: "user" | "assistant"; content: string }[];
      taxpayer?: TaxPayer;
      financials?: FinancialData;
      taxYear?: number;
    };

  const systemPrompt = buildSystemPrompt();
  const draftContext =
    taxpayer && financials
      ? buildDraftContext(taxpayer, financials, taxYear ?? currentTaxYear())
      : "";

  const fullSystem = draftContext
    ? `${systemPrompt}\n\n${draftContext}`
    : systemPrompt;

  try {
    const result = streamText({
      model: anthropic("claude-opus-4-5"),
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
    return new Response(JSON.stringify({ error: ERROR_GENERIC }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
