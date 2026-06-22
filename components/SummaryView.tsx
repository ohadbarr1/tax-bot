"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { buildSummary, sourceBadge } from "@/lib/summary";
import { ArrowLeft, Pencil } from "lucide-react";

/**
 * SummaryView — Output 1. A full, organized, read-only summary of everything the
 * user provided, each value attributed to its source. Manual input is the source
 * of truth; where a manual value overrode a mined document, that is shown.
 */
export function SummaryView() {
  const { state, markSummaryConfirmed } = useApp();
  const router = useRouter();
  const continueToFiling = () => {
    markSummaryConfirmed();
    router.push("/filing");
  };
  const sections = buildSummary(state.taxpayer);
  const provenance = state.provenance ?? {};

  return (
    <div className="kc-rise" style={{ padding: "8px 40px 80px", maxWidth: 880, margin: "0 auto" }}>
      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", fontWeight: 500 }}>סיכום · לפני הגשה</div>
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
          כל מה שמסרת, במקום אחד
        </div>
        <p style={{ fontSize: 14, color: "var(--kc-ink-soft)", marginTop: 10, lineHeight: 1.5 }}>
          בדוק שהכל נכון. ערך שהזנת ידנית גובר תמיד על מה שחולץ מהמסמכים — והוא מסומן בהתאם.
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 24px", fontSize: 12 }}>
        <Badge manual overrode={false}>הזנה ידנית</Badge>
        <Badge manual overrode>ידני · גובר על מסמך</Badge>
        <Badge manual={false} overrode={false}>מתוך מסמך</Badge>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sections.map((section) => (
          <div
            key={section.title}
            style={{
              background: "var(--kc-card)",
              borderRadius: 20,
              border: "1px solid var(--kc-rule)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--kc-rule)",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--kc-ink)",
                background: "var(--kc-bg-soft)",
              }}
            >
              {section.title}
            </div>
            <div>
              {section.rows.map((row, i) => {
                const b = sourceBadge(provenance[row.path]);
                return (
                  <div
                    key={row.path + i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 20px",
                      borderTop: i === 0 ? "none" : "1px solid var(--kc-rule)",
                    }}
                  >
                    <div style={{ fontSize: 13.5, color: "var(--kc-ink-dim)", flex: "0 0 38%", whiteSpace: "pre" }}>
                      {row.label}
                    </div>
                    <div style={{ fontSize: 14.5, color: "var(--kc-ink)", fontWeight: 600, flex: 1 }}>
                      {row.value}
                    </div>
                    <Badge manual={b.manual} overrode={b.overrode}>{b.label}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 28, alignItems: "center" }}>
        <Link
          href="/questionnaire"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--kc-ink-dim)",
            textDecoration: "none",
            padding: "10px 16px",
            borderRadius: 12,
            border: "1px solid var(--kc-rule)",
          }}
        >
          <Pencil size={15} /> ערוך פרטים
        </Link>
        <div style={{ flex: 1 }} />
        <button
          onClick={continueToFiling}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--kc-ink)",
            color: "var(--kc-card)",
            padding: "12px 24px",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
          }}
        >
          המשך להגשה ולחישוב <ArrowLeft size={16} />
        </button>
      </div>
    </div>
  );
}

function Badge({
  manual,
  overrode,
  children,
}: {
  manual: boolean;
  overrode: boolean;
  children: React.ReactNode;
}) {
  const bg = overrode ? "var(--kc-lime-soft)" : manual ? "var(--kc-bg-soft)" : "rgba(99,102,241,0.10)";
  const color = overrode ? "var(--kc-lime-dark)" : manual ? "var(--kc-ink-dim)" : "var(--kc-grape)";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 99,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
