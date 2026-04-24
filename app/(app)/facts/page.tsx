"use client";
import { useApp } from "@/lib/appContext";
import { currentTaxYear } from "@/lib/currentTaxYear";

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");
const EMPTY = "—";

export default function FactsPage() {
  const { state } = useApp();
  const taxYear = state.financials.taxYears?.[0] ?? currentTaxYear();
  const employers = state.taxpayer.employers || [];
  const annualIncome = employers.reduce((s, e) => s + (e.grossSalary || 0) * (e.monthsWorked || 12) / 12, 0);
  const taxPaid = employers.reduce((s, e) => s + (e.taxWithheld || 0) * (e.monthsWorked || 12) / 12, 0);
  const refund = state.financials.estimatedRefund ?? 0;
  const hasIncome = annualIncome > 0;
  const effRate = hasIncome ? ((taxPaid / annualIncome) * 100).toFixed(1) : null;
  const daysLeft = (() => {
    const deadline = new Date(new Date().getFullYear(), 3, 30);
    const diff = Math.ceil((+deadline - +new Date()) / 86400000);
    return Math.max(0, diff);
  })();
  const refundPctIncome = hasIncome ? ((refund / annualIncome) * 100).toFixed(1) : null;

  const stats = [
    { label: "הכנסה שנתית", value: hasIncome ? fmt(annualIncome) : EMPTY, sub: hasIncome ? `${employers.length} מעסיקים` : "טרם הוזנו נתוני שכר", color: "var(--kc-lime)", soft: "var(--kc-lime-soft)", strong: "var(--kc-lime-dark)" },
    { label: "מס ששילמת", value: taxPaid > 0 ? fmt(taxPaid) : EMPTY, sub: effRate ? `${effRate}% אפקטיבי` : undefined, color: "var(--kc-grape)", soft: "var(--kc-grape-soft)", strong: "var(--kc-grape)" },
    { label: "החזר צפוי", value: refund > 0 ? fmt(refund) : EMPTY, sub: refundPctIncome ? `${refundPctIncome}% מההכנסה` : "ממתין לחישוב", color: "var(--kc-coral)", soft: "var(--kc-coral-soft)", strong: "var(--kc-coral)" },
    { label: "ימים לסיום", value: String(daysLeft), sub: "עד 30 אפריל", color: "var(--kc-peach)", soft: "var(--kc-peach-soft)", strong: "var(--kc-peach)" },
  ];

  const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  const monthlyTax = hasIncome ? Array(12).fill(taxPaid / 12) : null;
  const maxMonthly = monthlyTax ? Math.max(...monthlyTax) || 1 : 1;

  return (
    <div className="kc-rise" style={{ padding: "8px 40px 80px" }}>
      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", fontWeight: 500 }}>תמונת מצב · {taxYear}</div>
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
          השנה שלך, במבט אחד
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{ background: "var(--kc-card)", borderRadius: 22, padding: 22, border: "1px solid var(--kc-rule)" }}
          >
            <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", fontWeight: 500 }}>{s.label}</div>
            <div
              style={{
                fontFamily: "var(--font-figtree)",
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--kc-ink)",
                marginTop: 8,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.value}
            </div>
            {s.sub && (
              <div
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "4px 9px",
                  borderRadius: 99,
                  background: s.soft,
                  color: s.strong,
                }}
              >
                {s.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          background: "var(--kc-ink)",
          borderRadius: 28,
          padding: 32,
          color: "var(--kc-card)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: -60,
            insetInlineStart: -40,
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: "var(--kc-grape)",
            opacity: 0.35,
            filter: "blur(30px)",
          }}
        />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>מס חודשי ששולם</div>
          <div
            style={{
              fontFamily: "var(--font-figtree)",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginTop: 4,
            }}
          >
            {refund > 0 ? (
              <>
                על הכל שולם כראוי — המקסימום זכאות של{" "}
                <span style={{ color: "var(--kc-lime)" }}>{fmt(refund)}</span>
              </>
            ) : (
              "השלם את השאלון כדי לראות את סכום ההחזר"
            )}
          </div>

          {monthlyTax ? (
            <div style={{ marginTop: 30, display: "flex", gap: 6, alignItems: "end", height: 160 }}>
              {monthlyTax.map((v, i) => {
                const h = (v / maxMonthly) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: "100%",
                        height: `${h}%`,
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.15)",
                        transition: "all 600ms",
                      }}
                    />
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{months[i]}</div>
                  </div>
                );
              })}
              <div style={{ position: "absolute", bottom: 8, insetInlineStart: 32, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                ממוצע חודשי (הסכום מחולק ב-12)
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 24, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
              התרשים יופיע לאחר הוספת נתוני שכר.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
