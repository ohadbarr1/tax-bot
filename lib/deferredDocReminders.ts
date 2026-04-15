import type { VaultDocMeta } from "@/types";

/**
 * Deferred-document reminder scheduler (client-side).
 *
 * When a user clicks "אעלה מאוחר יותר" on a doc during onboarding we persist
 * a VaultDocMeta with status: "pending_upload" and an uploadedAt timestamp.
 * This module is the read side — it buckets deferred docs by age so the
 * dashboard banner and advisor rail can surface the right urgency tier:
 *
 *   - "fresh" (< 3 days)     — silent; no nudge
 *   - "due"   (3–7 days)     — gentle reminder card
 *   - "overdue" (> 7 days)   — warn-toned banner
 *
 * We do NOT run a background job. The reminder logic evaluates every time
 * the dashboard renders, which is the only moment the user can act anyway.
 * Configurable thresholds let the spec shift later without touching the UI.
 */

export interface ReminderConfig {
  /** Days after defer when we start nudging. */
  dueAfterDays: number;
  /** Days after defer when we escalate to warn. */
  overdueAfterDays: number;
  /** Clock — injectable for tests. */
  now?: Date;
}

const DEFAULTS: Required<Pick<ReminderConfig, "dueAfterDays" | "overdueAfterDays">> = {
  dueAfterDays: 3,
  overdueAfterDays: 7,
};

export type ReminderTier = "fresh" | "due" | "overdue";

export interface DeferredReminder {
  doc: VaultDocMeta;
  tier: ReminderTier;
  ageDays: number;
}

export interface ReminderSummary {
  /** All deferred docs, bucketed by tier. */
  reminders: DeferredReminder[];
  due: DeferredReminder[];
  overdue: DeferredReminder[];
  /** Most urgent tier present (for single-banner UIs). */
  headline: ReminderTier | null;
}

export function evaluateDeferredReminders(
  documents: VaultDocMeta[] | undefined,
  config: ReminderConfig = DEFAULTS
): ReminderSummary {
  const now = config.now ?? new Date();
  const dueAfter = config.dueAfterDays ?? DEFAULTS.dueAfterDays;
  const overdueAfter = config.overdueAfterDays ?? DEFAULTS.overdueAfterDays;

  const reminders: DeferredReminder[] = [];
  for (const doc of documents ?? []) {
    if (doc.status !== "pending_upload") continue;
    const uploadedAt = Date.parse(doc.uploadedAt);
    if (Number.isNaN(uploadedAt)) continue;
    const ageMs = now.getTime() - uploadedAt;
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const tier: ReminderTier =
      ageDays >= overdueAfter ? "overdue" : ageDays >= dueAfter ? "due" : "fresh";
    reminders.push({ doc, tier, ageDays });
  }

  // Newest first within each tier so the banner shows the freshest due item.
  reminders.sort((a, b) => b.ageDays - a.ageDays);

  const due = reminders.filter((r) => r.tier === "due");
  const overdue = reminders.filter((r) => r.tier === "overdue");

  const headline: ReminderTier | null =
    overdue.length > 0 ? "overdue" : due.length > 0 ? "due" : null;

  return { reminders, due, overdue, headline };
}

/** Short Hebrew-facing label for a doc type. Keep in sync with VaultDocType. */
export function hebrewDocLabel(type: VaultDocMeta["type"]): string {
  switch (type) {
    case "form106":
      return "טופס 106";
    case "form135":
      return "טופס 135";
    case "form867":
      return "טופס 867";
    case "ibkr":
      return "דו\"ח Interactive Brokers";
    case "pension":
      return "אישור פנסיה";
    case "receipt":
      return "קבלות";
    case "bank_statement":
      return "דפי בנק";
    case "rsu_grant":
      return "הקצאת RSU";
    case "rental_contract":
      return "חוזה שכירות";
    default:
      return "מסמך";
  }
}
