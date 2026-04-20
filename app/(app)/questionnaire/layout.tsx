"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { AuthGate } from "@/components/auth/AuthGate";
import { QuestionnaireProvider } from "@/lib/questionnaireContext";
import { STEP_CONFIG, getStepBySlug } from "@/lib/questionnaireSteps";

export default function QuestionnaireLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const slug = pathname.split("/").pop() ?? "personal";
  const current = getStepBySlug(slug);
  const currentStepId = current?.id ?? 1;
  const total = STEP_CONFIG.length;
  const completed = Math.max(0, currentStepId - 1);
  const pct = Math.round(((completed) / total) * 100);

  return (
    <AuthGate>
      <QuestionnaireProvider>
        <div className="kc-rise" style={{ maxWidth: 880, margin: "0 auto", padding: "8px 40px 80px" }}>
          <div style={{ marginTop: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", fontWeight: 500 }}>
              שאלון אישי · {completed}/{total}
            </div>
            <div
              style={{
                fontFamily: "var(--font-figtree)",
                fontSize: 44,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "var(--kc-ink)",
                marginTop: 4,
                lineHeight: 1,
              }}
            >
              שאלות קצרות, החזר גדול
            </div>
          </div>

          <div
            style={{
              height: 10,
              background: "var(--kc-bg-soft)",
              borderRadius: 99,
              overflow: "hidden",
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--kc-lime), var(--kc-lime-dark))",
                borderRadius: 99,
                transition: "width 600ms",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 28,
              fontSize: 12,
              color: "var(--kc-ink-dim)",
            }}
          >
            {STEP_CONFIG.map((s) => {
              const done = currentStepId > s.id;
              const active = currentStepId === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 99,
                    background: active ? "var(--kc-ink)" : done ? "var(--kc-lime-soft)" : "var(--kc-bg-soft)",
                    color: active ? "var(--kc-lime)" : done ? "var(--kc-lime-dark)" : "var(--kc-ink-dim)",
                    fontWeight: active ? 700 : 600,
                  }}
                >
                  {done && <Check size={12} />}
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>

          {children}
        </div>
      </QuestionnaireProvider>
    </AuthGate>
  );
}
