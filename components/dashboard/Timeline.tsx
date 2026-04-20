"use client";

import { Check } from "lucide-react";

export function Timeline({ completed, total }: { completed: number; total: number }) {
  const started = total > 0;
  const pct = started ? completed / total : 0;
  const steps = [
    { label: "פתחנו לך תיק", date: "התחלה", done: started },
    { label: "טופס 106 · הועלה", date: "", done: pct >= 0.2 },
    { label: "נקודות זיכוי · חושבו", date: "", done: pct >= 0.4 },
    { label: "שאלון אישי", date: pct < 0.7 ? "עכשיו" : "", done: pct >= 0.7, active: started && pct < 0.7 },
    { label: "הגשה ל-135", date: pct < 1 ? "בקרוב" : "", done: pct >= 1 },
  ];
  return (
    <div
      className="p-6"
      style={{ background: "var(--kc-card)", borderRadius: 24, border: "1px solid var(--kc-rule)" }}
    >
      <div className="text-[11px] font-semibold tracking-[0.05em]" style={{ color: "var(--kc-ink-dim)" }}>
        המסלול שלך
      </div>
      <div
        className="font-bold tracking-[-0.02em] mt-1"
        style={{ fontFamily: "var(--font-figtree)", fontSize: 20, color: "var(--kc-ink)" }}
      >
        כמעט שם
      </div>
      <div className="mt-5 relative">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-3.5 relative" style={{ paddingBottom: i === steps.length - 1 ? 0 : 18 }}>
            {i < steps.length - 1 && (
              <div
                className="absolute w-[2px]"
                style={{
                  top: 22,
                  insetInlineStart: 10,
                  height: "calc(100% - 12px)",
                  background: s.done ? "var(--kc-lime)" : "var(--kc-rule)",
                }}
              />
            )}
            <div
              className="w-[22px] h-[22px] rounded-full shrink-0 grid place-items-center mt-0.5 relative z-[1]"
              style={{
                background: s.done ? "var(--kc-lime)" : s.active ? "var(--kc-ink)" : "var(--kc-bg-soft)",
                border: s.active && !s.done ? "3px solid var(--kc-lime)" : "none",
                color: "var(--kc-ink)",
              }}
            >
              {s.done && <Check className="w-3 h-3" />}
              {s.active && !s.done && (
                <span className="w-2 h-2 rounded-full" style={{ background: "var(--kc-lime)" }} />
              )}
            </div>
            <div className="flex-1">
              <div
                className="text-[14px]"
                style={{
                  fontWeight: s.active ? 700 : 500,
                  color: s.done || s.active ? "var(--kc-ink)" : "var(--kc-ink-dim)",
                }}
              >
                {s.label}
              </div>
              {s.date && (
                <div className="text-[12px] mt-0.5" style={{ color: "var(--kc-ink-dim)" }}>
                  {s.date}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
