"use client";
import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { useApp } from "@/lib/appContext";

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

export default function FilingPage() {
  const { state } = useApp();
  const refund = state.financials.estimatedRefund ?? 0;
  const fee = Math.round(refund * 0.06);
  const net = refund - fee;
  const bankAcc = state.taxpayer.bank?.account
    ? `•••${state.taxpayer.bank.account.slice(-3)}`
    : "";
  const bankName = state.taxpayer.bank?.bankName ?? "";

  const actionItems = state.financials.actionItems || [];
  const remainingCount = actionItems.filter((a) => !a.completed).length;
  const docs = state.documents || [];
  const missing = docs.filter((d) => d.status === "pending_upload" || d.status === "failed").length;

  const idVerified = Boolean(state.taxpayer.idNumber && state.taxpayer.fullName);
  const questionnaireCompleted = Boolean(state.questionnaire?.completed);
  const hasCalc = Boolean(state.financials.calculationResult);
  const docsStatus = docs.length === 0
    ? "טרם הועלו קבצים"
    : `${docs.length} קבצים · ${missing > 0 ? `חסר ${missing}` : "מלא"}`;
  const questionnaireDetail = questionnaireCompleted
    ? "הושלם"
    : remainingCount > 0
      ? `${remainingCount} שאלות נותרו`
      : "טרם התחיל";
  const steps = [
    { label: "זיהוי ואימות", detail: "ת״ז · חתימה דיגיטלית", done: idVerified, active: !idVerified },
    { label: "מסמכים", detail: docsStatus, done: missing === 0 && docs.length > 0, active: false },
    { label: "שאלון", detail: questionnaireDetail, done: questionnaireCompleted, active: !questionnaireCompleted && idVerified },
    { label: "חישוב סופי", detail: "הסוכן מריץ recompute", done: hasCalc, active: questionnaireCompleted && !hasCalc },
    { label: "חתימה והגשה", detail: "שולח ל-135 במס הכנסה", done: false, active: hasCalc },
  ];

  const summary = [
    { label: "החזר משוער", value: fmt(refund), color: "var(--kc-lime)" },
    { label: "עמלת השירות", value: fmt(fee), sub: "6% מההחזר", color: "var(--kc-ink)" },
    { label: "נטו אליך", value: fmt(net), color: "var(--kc-grape)" },
  ];

  return (
    <div className="kc-rise" style={{ padding: "8px 40px 80px" }}>
      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", fontWeight: 500 }}>הגשה · שלב אחרון</div>
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
          אתה במרחק חתימה
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        <div
          style={{
            background: "var(--kc-ink)",
            color: "var(--kc-card)",
            borderRadius: 28,
            padding: 32,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: -120,
              insetInlineStart: -60,
              width: 320,
              height: 320,
              borderRadius: "50%",
              background: "var(--kc-lime)",
              opacity: 0.25,
              filter: "blur(30px)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(198,255,77,0.15)",
                color: "var(--kc-lime)",
                padding: "6px 12px",
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--kc-lime)" }} />
              טופס 135 · מוכן לחתימה
            </div>
            <div
              style={{
                fontFamily: "var(--font-figtree)",
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginTop: 16,
                lineHeight: 1.2,
              }}
            >
              עוד חתימה אחת והחזר בדרך
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 10, lineHeight: 1.55, maxWidth: 440 }}>
              ברגע שתחתום, נשלח את הטופס ישירות למחשב של מס הכנסה. ברוב המקרים הכסף מגיע תוך 21–45 יום {bankName ? `לחשבון ${bankName} שלך` : "לחשבון הבנק שלך"}.
            </div>

            <div style={{ marginTop: 26 }}>
              {steps.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 0",
                    borderBottom: i < steps.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: s.done ? "var(--kc-lime)" : s.active ? "transparent" : "rgba(255,255,255,0.08)",
                      border: s.active ? "2px solid var(--kc-lime)" : "none",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {s.done && <Check size={14} style={{ color: "var(--kc-ink)" }} />}
                    {s.active && (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--kc-lime)" }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: s.active ? 700 : 600,
                        color: s.done || s.active ? "var(--kc-card)" : "rgba(255,255,255,0.55)",
                      }}
                    >
                      {s.label}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{s.detail}</div>
                  </div>
                  {s.done && (
                    <div style={{ fontSize: 11.5, color: "var(--kc-lime)", fontWeight: 700 }}>הושלם</div>
                  )}
                  {s.active && (
                    <div style={{ fontSize: 11.5, color: "var(--kc-lime)", fontWeight: 700 }}>עכשיו</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              background: "var(--kc-card)",
              borderRadius: 22,
              padding: 24,
              border: "1px solid var(--kc-rule)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--kc-ink-dim)", fontWeight: 600, letterSpacing: "0.04em" }}>
              סיכום ההחזר
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {summary.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    paddingBottom: i < summary.length - 1 ? 12 : 0,
                    borderBottom: i < summary.length - 1 ? "1px solid var(--kc-rule)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, color: "var(--kc-ink)", fontWeight: 600 }}>{row.label}</div>
                    {row.sub && (
                      <div style={{ fontSize: 11.5, color: "var(--kc-ink-dim)", marginTop: 2 }}>{row.sub}</div>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-figtree)",
                      fontSize: i === summary.length - 1 ? 28 : 20,
                      fontWeight: 800,
                      color: row.color,
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--kc-lime-soft)",
              borderRadius: 22,
              padding: 22,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--kc-lime)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Zap size={20} style={{ color: "var(--kc-ink)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--kc-ink)" }}>
                {bankName
                  ? `הכסף יגיע לחשבון ${bankName} ${bankAcc}`
                  : "הוסף פרטי בנק כדי לקבל את ההחזר ישירות"}
              </div>
              <div style={{ fontSize: 12, color: "var(--kc-ink-soft)", marginTop: 2 }}>צפוי בין 21–45 יום</div>
            </div>
          </div>

          <button
            style={{
              all: "unset",
              cursor: "pointer",
              textAlign: "center",
              background: "var(--kc-ink)",
              color: "var(--kc-lime)",
              padding: "18px 24px",
              borderRadius: 22,
              fontSize: 16,
              fontWeight: 800,
              fontFamily: "var(--font-figtree)",
              letterSpacing: "-0.01em",
            }}
          >
            ✍️ חתום והגש עכשיו
          </button>
          <div style={{ fontSize: 12, color: "var(--kc-ink-dim)", textAlign: "center", lineHeight: 1.55 }}>
            בלחיצה על חתום אתה מאשר את הצהרת מגיש · ניתן לבטל תוך 14 יום
          </div>

          <Link
            href="/documents"
            style={{
              fontSize: 13,
              color: "var(--kc-ink-dim)",
              textAlign: "center",
              textDecoration: "underline",
              marginTop: 6,
            }}
          >
            הצג טיוטת 135 המלאה
          </Link>
        </div>
      </div>
    </div>
  );
}
