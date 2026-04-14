import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { buildSystemPrompt, buildDraftContext } from "@/lib/advisorPrompt";
import type { TaxPayer, FinancialData } from "@/types";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
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
      ? buildDraftContext(taxpayer, financials, taxYear ?? 2024)
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
    return new Response(JSON.stringify({ error: "AI service unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
