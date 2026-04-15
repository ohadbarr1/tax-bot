import { generateText, streamText } from "ai";
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

  // DIAG: generateText surfaces errors synchronously so catch can expose them.
  // Revert to streamText once root cause is identified.
  void streamText;
  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: fullSystem,
      messages,
      maxOutputTokens: 1024,
    });
    return new Response(result.text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[advisor] generateText failed:", err);
    const debug = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return new Response(JSON.stringify({ error: ERROR_GENERIC, debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
