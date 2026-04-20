"use client";

import { ArrowLeft } from "lucide-react";
import type { FinancialData } from "@/types";

interface Props {
  financials: FinancialData;
  completedActions: number;
  totalActions: number;
  pendingActions: number;
  updateFinancials: (patch: Partial<FinancialData>) => void;
}

const PRIORITY_EMOJI: Record<string, string> = {
  high: "🔥",
  medium: "⚡",
  low: "✏️",
};

export function ActionItems({ financials, pendingActions, updateFinancials }: Props) {
  const visible = financials.actionItems.filter((a) => !a.completed).slice(0, 3);
  return (
    <div>
      <div
        className="font-extrabold tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-figtree)", fontSize: 22, color: "var(--kc-ink)" }}
      >
        מה עכשיו?
      </div>
      <div className="text-[13px] mt-1 mb-4" style={{ color: "var(--kc-ink-dim)" }}>
        {pendingActions > 0 ? `${pendingActions} פעולות קצרות ואתה בהגשה` : "כל הפעולות הושלמו — יופי"}
      </div>
      <div className="flex flex-col gap-2.5">
        {visible.map((a) => (
          <button
            key={a.id}
            onClick={() =>
              updateFinancials({
                actionItems: financials.actionItems.map((x) =>
                  x.id === a.id ? { ...x, completed: !x.completed } : x
                ),
              })
            }
            className="flex items-center gap-3.5 text-start transition-colors"
            style={{
              background: "var(--kc-card)",
              borderRadius: 18,
              padding: "14px 16px",
              border: "1px solid var(--kc-rule)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--kc-bg-soft)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--kc-card)")}
          >
            <div className="text-[22px]">{PRIORITY_EMOJI[a.priority] ?? "•"}</div>
            <div className="flex-1">
              <div className="text-[14.5px] font-semibold" style={{ color: "var(--kc-ink)" }}>
                {a.label}
              </div>
              {a.formNumber && (
                <div className="text-[12px] mt-0.5" style={{ color: "var(--kc-ink-dim)" }}>
                  טופס {a.formNumber}
                </div>
              )}
            </div>
            <div
              className="w-8 h-8 rounded-[10px] grid place-items-center"
              style={{ background: "var(--kc-bg-soft)" }}
            >
              <ArrowLeft className="w-[15px] h-[15px]" style={{ color: "var(--kc-ink)" }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
