"use client";
import { useApp } from "@/lib/appContext";

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

export default function FactsPage() {
  const { state } = useApp();
  const employers = state.taxpayer.employers || [];
  const annualIncome = employers.reduce((s, e) => s + (e.grossSalary || 0) * (e.monthsWorked || 12) / 12, 0) || 528000;
  const taxPaid = employers.reduce((s, e) => s + (e.taxWithheld || 0) * (e.monthsWorked || 12) / 12, 0) || 124320;
  const refund = state.financials.estimatedRefund || 24680;
  const effRate = annualIncome > 0 ? ((taxPaid / annualIncome) * 100).toFixed(1) : "23.5";
  const daysLeft = (() => {
    const deadline = new Date(new Date().getFullYear(), 3, 30);
    const diff = Math.ceil((+deadline - +new Date()) / 86400000);
    return diff > 0 ? diff : 46;
  })();
  const refundPctIncome = annualIncome > 0 ? ((refund / annualIncome) * 100).toFixed(1) : "4.7";

  const stats = [
    { label: "הכנסה שנתית", value: fmt(annualIncome), sub: "↑ 8% משנה שעברה", color: "var(--kc-lime)", soft: "var(--kc-lime-soft)", strong: "var(--kc-lime-dark)" },
    { label: "מס ששילמת", value: fmt(taxPaid), sub: `${effRate}% אפקטיבי`, color: "var(--kc-grape)", soft: "var(--kc-grape-soft)", strong: "var(--kc-grape)" },
    { label: "החזר צפוי", value: fmt(refund), sub: `${refundPctIncome}% מההכנסה`, color: "var(--kc-coral)", soft: "var(--kc-coral-soft)", strong: "var(--kc-coral)" },
    { label: "ימים לסיום", value: String(daysLeft), sub: "עד 30 אפריל", color: "var(--kc-peach)", soft: "var(--kc-peach-soft)", strong: "var(--kc-peach)" },
  ];

  const monthly = [10.2, 10.4, 10.6, 10.8, 11.0, 10.9, 11.2, 11.5, 12.0, 11.8, 11.4, 13.5];
  const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

  const rows = [
    { l: "אתה", v: refund, max: 32000, c: "var(--kc-lime)" },
    { l: "ממוצע שכיר ישראלי", v: 8400, max: 32000, c: "var(--kc-ink)" },
    { l: "לא מגיש בכלל", v: 0, max: 32000, c: "var(--kc-ink-faint)" },
  ];

  return (
    <div className="kc-rise" style={{ padding: "8px 40px 80px" }}>
      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", fontWeight: 500 }}>תמונת מצב · 2024</div>
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
            על הכל שולם כראוי — המקסימום זכאות של{" "}
            <span style={{ color: "var(--kc-lime)" }}>{fmt(refund)}</span>
          </div>

          <div style={{ marginTop: 30, display: "flex", gap: 6, alignItems: "end", height: 160 }}>
            {monthly.map((v, i) => {
              const h = (v / 14) * 100;
              const high = i === 11;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: "100%",
                      height: `${h}%`,
                      borderRadius: 8,
                      background: high ? "var(--kc-lime)" : "rgba(255,255,255,0.15)",
                      transition: "all 600ms",
                    }}
                  />
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{months[i]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "var(--kc-card)", borderRadius: 24, padding: 24, border: "1px solid var(--kc-rule)" }}>
          <div
            style={{
              fontFamily: "var(--font-figtree)",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--kc-ink)",
            }}
          >
            אתה לעומת ממוצע
          </div>
          <div style={{ fontSize: 13, color: "var(--kc-ink-dim)", marginTop: 4 }}>מבוססי שכר דומה באזורך</div>
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r) => (
              <div key={r.l}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--kc-ink)" }}>{r.l}</span>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: r.c === "var(--kc-ink)" ? "var(--kc-ink)" : r.c,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(r.v)}
                  </span>
                </div>
                <div style={{ height: 10, background: "var(--kc-bg-soft)", borderRadius: 99, overflow: "hidden" }}>
                  <div
                    style={{ width: `${(r.v / r.max) * 100}%`, height: "100%", background: r.c, borderRadius: 99 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, var(--kc-lime), var(--kc-lime-dark))",
            borderRadius: 24,
            padding: 28,
            color: "var(--kc-ink)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em" }}>עובדה מעניינת</div>
          <div
            style={{
              fontFamily: "var(--font-figtree)",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginTop: 12,
              lineHeight: 1.2,
            }}
          >
            רק 38% מהישראלים הזכאים מגישים בקשה להחזר.
          </div>
          <div style={{ fontSize: 14, marginTop: 16, lineHeight: 1.55, fontWeight: 500 }}>
            המדינה מחזיקה כ-₪3 מיליארד שמחכים להגיע בחזרה לאנשים. אתה לא מהם — יופי.
          </div>
        </div>
      </div>
    </div>
  );
}
