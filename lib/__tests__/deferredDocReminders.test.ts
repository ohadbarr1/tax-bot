import { describe, it, expect } from "vitest";
import { evaluateDeferredReminders } from "../deferredDocReminders";
import type { VaultDocMeta } from "@/types";

function makeDoc(partial: Partial<VaultDocMeta>): VaultDocMeta {
  return {
    id: partial.id ?? "doc-1",
    name: partial.name ?? "טופס 106",
    type: partial.type ?? "form106",
    size: 0,
    uploadedAt: partial.uploadedAt ?? new Date().toISOString(),
    status: partial.status,
  };
}

const NOW = new Date("2026-04-15T12:00:00Z");

function daysAgo(d: number): string {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
}

describe("evaluateDeferredReminders", () => {
  it("returns null headline when nothing is deferred", () => {
    const res = evaluateDeferredReminders([makeDoc({ status: "uploaded" })], { dueAfterDays: 3, overdueAfterDays: 7, now: NOW });
    expect(res.headline).toBeNull();
    expect(res.reminders).toHaveLength(0);
  });

  it("buckets docs as fresh / due / overdue", () => {
    const docs: VaultDocMeta[] = [
      makeDoc({ id: "a", status: "pending_upload", uploadedAt: daysAgo(1) }),
      makeDoc({ id: "b", status: "pending_upload", uploadedAt: daysAgo(4) }),
      makeDoc({ id: "c", status: "pending_upload", uploadedAt: daysAgo(10) }),
    ];
    const res = evaluateDeferredReminders(docs, { dueAfterDays: 3, overdueAfterDays: 7, now: NOW });
    expect(res.reminders).toHaveLength(3);
    expect(res.reminders.find((r) => r.doc.id === "a")?.tier).toBe("fresh");
    expect(res.reminders.find((r) => r.doc.id === "b")?.tier).toBe("due");
    expect(res.reminders.find((r) => r.doc.id === "c")?.tier).toBe("overdue");
    expect(res.headline).toBe("overdue");
  });

  it("ignores non-deferred statuses", () => {
    const docs: VaultDocMeta[] = [
      makeDoc({ id: "a", status: "mined", uploadedAt: daysAgo(30) }),
      makeDoc({ id: "b", status: "failed", uploadedAt: daysAgo(30) }),
      makeDoc({ id: "c", status: "pending_upload", uploadedAt: daysAgo(5) }),
    ];
    const res = evaluateDeferredReminders(docs, { dueAfterDays: 3, overdueAfterDays: 7, now: NOW });
    expect(res.reminders).toHaveLength(1);
    expect(res.reminders[0].doc.id).toBe("c");
    expect(res.headline).toBe("due");
  });

  it("handles empty and undefined input", () => {
    expect(evaluateDeferredReminders(undefined, { dueAfterDays: 3, overdueAfterDays: 7, now: NOW }).headline).toBeNull();
    expect(evaluateDeferredReminders([], { dueAfterDays: 3, overdueAfterDays: 7, now: NOW }).headline).toBeNull();
  });

  it("tolerates malformed uploadedAt", () => {
    const res = evaluateDeferredReminders(
      [makeDoc({ status: "pending_upload", uploadedAt: "not-a-date" })],
      { dueAfterDays: 3, overdueAfterDays: 7, now: NOW }
    );
    expect(res.reminders).toHaveLength(0);
  });

  it("headline is due when no overdue but has due", () => {
    const docs: VaultDocMeta[] = [
      makeDoc({ id: "a", status: "pending_upload", uploadedAt: daysAgo(5) }),
    ];
    const res = evaluateDeferredReminders(docs, { dueAfterDays: 3, overdueAfterDays: 7, now: NOW });
    expect(res.headline).toBe("due");
  });
});
