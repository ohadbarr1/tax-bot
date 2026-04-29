/**
 * lib/api/schemas/advisor.ts — Zod schemas for the /api/advisor* request bodies.
 *
 * IMPORTANT (closes audit finding F-6):
 *   The schemas DO NOT include `taxpayer` or `financials`. The advisor PII flow
 *   used to accept those fields directly from the client, which let any caller
 *   (a) probe Anthropic with fabricated PII and (b) escape the auth gate by
 *   spoofing a different user's data. Both routes now re-read the authenticated
 *   user's draft from `users/{uid}/private/state` server-side via the Admin SDK.
 *
 * Bounded array sizes prevent OOM on the Anthropic system prompt when a
 * malicious client sends a 5 MB chat history.
 */

import { z } from "zod";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 4_000;

const RoleSchema = z.enum(["user", "assistant"]);

const ChatMessageSchema = z.object({
  role: RoleSchema,
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

/** POST /api/advisor */
export const AdvisorRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(MAX_MESSAGES),
  taxYear: z.number().int().min(2000).max(2100).optional(),
});
export type AdvisorRequest = z.infer<typeof AdvisorRequestSchema>;

/** POST /api/advisor/nudges */
export const AdvisorNudgesRequestSchema = z.object({
  taxYear: z.number().int().min(2000).max(2100).optional(),
});
export type AdvisorNudgesRequest = z.infer<typeof AdvisorNudgesRequestSchema>;
