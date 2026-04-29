"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Returns true once the viewport is at least `breakpoint` CSS pixels wide.
 * Defaults to `false` on first render (and on the server) so SSR emits a
 * mobile-first layout and hydration matches. Listens to `matchMedia` so the
 * layout flips on resize without a reload.
 */
function useIsAtLeast(breakpoint: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return on;
}

const KC = {
  bg: "var(--kc-bg)",
  bgSoft: "var(--kc-bg-soft)",
  card: "var(--kc-card)",
  ink: "var(--kc-ink)",
  inkSoft: "var(--kc-ink-soft)",
  inkDim: "var(--kc-ink-dim)",
  inkFaint: "var(--kc-ink-faint)",
  rule: "var(--kc-rule)",
  ruleHi: "var(--kc-rule-hi)",
  lime: "var(--kc-lime)",
  limeDark: "var(--kc-lime-dark)",
  limeSoft: "var(--kc-lime-soft)",
  grape: "var(--kc-grape)",
  grapeSoft: "var(--kc-grape-soft)",
  coral: "var(--kc-coral)",
  coralSoft: "var(--kc-coral-soft)",
  peach: "var(--kc-peach)",
  peachSoft: "var(--kc-peach-soft)",
  display: "var(--font-figtree)",
  mono: "var(--font-mono), ui-monospace, monospace",
} as const;

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

export default function LandingPage() {
  return (
    <div style={{ background: KC.bg, minHeight: "100vh", direction: "rtl" }}>
      <LandingNav />
      <LandingHero />
      <LandingMarquee />
      <LandingHow />
      <LandingRefundCalculator />
      <LandingSocialProof />
      <LandingFAQ />
      <LandingFooterCTA />
      <LandingFooter />
    </div>
  );
}

function LandingNav() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px clamp(16px, 5vw, 40px)",
        background: "rgba(251,249,244,0.85)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: `1px solid ${KC.rule}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: KC.ink,
            display: "grid",
            placeItems: "center",
            color: KC.lime,
            fontFamily: KC.display,
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          ₪
        </div>
        <div style={{ fontFamily: KC.display, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>
          כסף חזרה
        </div>
      </div>

      <div
        className="hidden md:flex"
        style={{ gap: 32, fontSize: 14, color: KC.inkSoft, fontWeight: 500 }}
      >
        <Link href="/how-it-works">איך זה עובד</Link>
        <Link href="/pricing">מחירים</Link>
        <Link href="/about">למי זה מתאים</Link>
        <a href="#faq">שאלות ותשובות</a>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/welcome" style={{ fontSize: 14, fontWeight: 600, color: KC.ink }}>
          התחברות
        </Link>
        <Link
          href="/welcome"
          style={{
            background: KC.ink,
            color: KC.card,
            padding: "10px 18px",
            borderRadius: 99,
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: KC.display,
            textDecoration: "none",
          }}
        >
          בדוק כמה מגיע לך →
        </Link>
      </div>
    </nav>
  );
}

function LandingHero() {
  const isMd = useIsAtLeast(768);
  return (
    <section style={{ padding: "clamp(40px, 10vw, 72px) clamp(16px, 5vw, 40px) 40px", position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 40,
          insetInlineStart: "48%",
          width: 520,
          height: 520,
          borderRadius: "50%",
          pointerEvents: "none",
          background: `radial-gradient(circle, ${KC.lime} 0%, transparent 65%)`,
          opacity: 0.45,
          filter: "blur(40px)",
        }}
      />
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: KC.ink,
            color: KC.lime,
            padding: "6px 14px",
            borderRadius: 99,
            fontSize: 12.5,
            fontWeight: 600,
            marginBottom: 28,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: KC.lime }} />
          עכשיו עם זיהוי הכנסות אוטומטי מ־5 שנים אחורה
        </div>

        <h1
          style={{
            fontFamily: KC.display,
            fontSize: "clamp(48px, 12vw, 132px)",
            lineHeight: 0.92,
            letterSpacing: "-0.055em",
            fontWeight: 800,
            margin: 0,
            maxWidth: 1100,
            color: KC.ink,
          }}
        >
          המדינה חייבת לך{" "}
          <span
            style={{
              background: KC.lime,
              padding: "0 18px",
              borderRadius: 24,
              display: "inline-block",
              transform: "rotate(-1.5deg)",
              boxShadow: `6px 6px 0 ${KC.ink}`,
            }}
          >
            כסף
          </span>
          .
          <br />
          בוא נחזיר אותו.
        </h1>

        <div
          style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: isMd ? "1.1fr 1fr" : "1fr",
            gap: isMd ? 60 : 28,
            alignItems: "end",
          }}
        >
          <p
            style={{
              fontSize: 20,
              lineHeight: 1.5,
              color: KC.inkSoft,
              margin: 0,
              maxWidth: 560,
              fontWeight: 400,
            }}
          >
            כ־<strong style={{ color: KC.ink }}>2.5 מיליון שכירים</strong> בישראל זכאים להחזר מס ולא מגישים. אנחנו נעזור לכם
            לבדוק זכאות ולמלא את טופס 135 — בלי רואה־חשבון, בלי לעבד טפסים בעצמכם.
          </p>

          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <Link
                href="/welcome"
                style={{
                  background: KC.lime,
                  color: KC.ink,
                  padding: "20px 32px",
                  borderRadius: 99,
                  fontSize: 18,
                  fontWeight: 800,
                  fontFamily: KC.display,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  boxShadow: `0 10px 30px rgba(166,224,34,0.5)`,
                  textDecoration: "none",
                }}
              >
                התחילו בדיקה חינם →
              </Link>
              <Link
                href="/how-it-works"
                style={{
                  padding: "20px 26px",
                  borderRadius: 99,
                  fontSize: 15,
                  fontWeight: 600,
                  border: `1.5px solid ${KC.ruleHi}`,
                  color: KC.ink,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: KC.ink,
                    color: KC.lime,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 9,
                  }}
                >
                  ▶
                </span>
                איך זה עובד (1:40)
              </Link>
            </div>
            <div style={{ display: "flex", gap: 18, fontSize: 13, color: KC.inkDim, fontWeight: 500, flexWrap: "wrap" }}>
              <span>✓ ללא התחייבות</span>
              <span>✓ בשלב הבטא — שירות חינם</span>
              <span>✓ הגשה עצמית באתר רשות המיסים</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 72,
            display: "grid",
            gridTemplateColumns: isMd ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
            gap: 0,
            background: KC.ink,
            borderRadius: 24,
            overflow: "hidden",
            color: KC.card,
          }}
        >
          <LandingStat value="₪2,840" label="החזר ממוצע ב־2024" />
          <LandingStat value="גרסת בטא" label="שירות חינם בתקופת הבטא" dim />
          <LandingStat value="5–15 ד׳" label="זמן מילוי ממוצע" />
          <LandingStat value="6 שנים" label="אחורה אפשר לתבוע" dim />
        </div>
      </div>
    </section>
  );
}

function LandingStat({ value, label, dim }: { value: string; label: string; dim?: boolean }) {
  return (
    <div
      style={{
        padding: "clamp(20px, 4vw, 28px)",
        background: dim ? "rgba(255,255,255,0.03)" : "transparent",
        borderInlineStart: `1px solid rgba(255,255,255,0.08)`,
      }}
    >
      <div
        style={{
          fontFamily: KC.display,
          fontSize: "clamp(26px, 5vw, 38px)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: dim ? KC.card : KC.lime,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{label}</div>
    </div>
  );
}

function LandingMarquee() {
  const items = [
    "שינוי מקום עבודה",
    "לידה",
    "חופשת לידה ללא תשלום",
    "תרומות למוסד מוכר",
    "ביטוח חיים",
    "קופת גמל עצמאית",
    "עבודה במשמרות",
    "נכות רפואית",
    "קצבת ילדים",
    "הפסקת עבודה",
    "מעבר דירה לפריפריה",
    "תואר אקדמי",
  ];
  const doubled = [...items, ...items, ...items];
  return (
    <section style={{ background: KC.ink, color: KC.card, padding: "22px 0", overflow: "hidden", position: "relative" }}>
      <div
        className="kc-marquee"
        style={{
          display: "flex",
          gap: 32,
          whiteSpace: "nowrap",
          fontFamily: KC.display,
          fontSize: "clamp(18px, 4.5vw, 28px)",
          fontWeight: 600,
          width: "max-content",
        }}
      >
        {doubled.map((t, i) => (
          <span key={i} style={{ display: "inline-flex", gap: 32, alignItems: "center" }}>
            <span style={{ color: i % 3 === 0 ? KC.lime : KC.card }}>{t}</span>
            <span style={{ color: KC.inkDim }}>✦</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function LandingHow() {
  const isMd = useIsAtLeast(768);
  const steps = [
    {
      n: "01",
      title: "התחברות עם Google",
      body: "נכנסים בלחיצה אחת עם חשבון Google ומעלים את טופס 106 ואישורי הניכויים בעצמכם. אנחנו מחלצים את הנתונים מה-PDF אוטומטית עם OCR.",
      chip: "Google · התחברות",
      color: KC.grapeSoft,
      ink: KC.grape,
    },
    {
      n: "02",
      title: "ממלאים שאלון קצר",
      body: "שינית עבודה? ילדת? תרמת? שאלון מודרך שבודק זכאות במגוון רחב של סעיפי החזר — מעל 20 תרחישים נפוצים.",
      chip: "מעל 20 תרחישים",
      color: KC.limeSoft,
      ink: KC.ink,
    },
    {
      n: "03",
      title: "מורידים ומגישים",
      body: "אנחנו מכינים עבורכם טופס 135 מוכן להורדה. אתם מעלים אותו ידנית באזור האישי באתר רשות המיסים (taxes.gov.il) ועוקבים אחרי ההחזר.",
      chip: "PDF להורדה",
      color: KC.peachSoft,
      ink: KC.coral,
    },
  ];
  return (
    <section style={{ padding: "clamp(60px, 10vw, 100px) clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", marginBottom: 56, flexWrap: "wrap", gap: 24 }}>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: KC.inkDim,
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              ← 03 צעדים
            </div>
            <h2
              style={{
                fontFamily: KC.display,
                fontSize: "clamp(40px, 9vw, 72px)",
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                fontWeight: 800,
                margin: 0,
                maxWidth: 720,
              }}
            >
              לא טופס. לא רואה־חשבון.
              <br />
              פשוט{" "}
              <span
                style={{
                  fontStyle: "italic",
                  textDecoration: `underline wavy ${KC.lime}`,
                  textUnderlineOffset: 10,
                }}
              >
                שיחה
              </span>
              .
            </h2>
          </div>
          <div style={{ fontSize: 15, color: KC.inkSoft, maxWidth: 340, lineHeight: 1.5 }}>
            שלוש תחנות. אפשר לעצור בכל אחת, להמשיך מהטלפון, לקבל עזרה אם צריך.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMd ? "repeat(3, 1fr)" : "1fr",
            gap: 18,
          }}
        >
          {steps.map((s) => (
            <div
              key={s.n}
              style={{
                background: s.color,
                borderRadius: 28,
                padding: 32,
                position: "relative",
                minHeight: 360,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: KC.mono,
                    fontSize: 13,
                    fontWeight: 600,
                    color: s.ink,
                    marginBottom: 40,
                  }}
                >
                  {s.n} / 03
                </div>
                <h3
                  style={{
                    fontFamily: KC.display,
                    fontSize: 30,
                    lineHeight: 1.05,
                    letterSpacing: "-0.02em",
                    fontWeight: 700,
                    margin: 0,
                    color: KC.ink,
                  }}
                >
                  {s.title}
                </h3>
                <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.55, color: KC.inkSoft }}>{s.body}</p>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  background: KC.ink,
                  color: s.ink === KC.ink ? KC.lime : s.ink,
                  padding: "6px 12px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: KC.mono,
                }}
              >
                {s.chip}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingRefundCalculator() {
  const isMd = useIsAtLeast(768);
  const [salary, setSalary] = useState(14000);
  const [years, setYears] = useState(3);
  const [flags, setFlags] = useState<Record<string, boolean>>({ kids: true, donation: false, switch: true, unpaid: false });

  const base = 0.018 * salary * 12;
  const mul =
    1 +
    (flags.kids ? 0.3 : 0) +
    (flags.donation ? 0.15 : 0) +
    (flags.switch ? 0.25 : 0) +
    (flags.unpaid ? 0.4 : 0);
  const per = base * mul;
  const total = per * years;

  return (
    <section style={{ padding: "40px clamp(16px, 5vw, 40px) clamp(60px, 10vw, 100px)" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          background: KC.ink,
          borderRadius: 32,
          padding: "clamp(28px, 5vw, 56px)",
          display: "grid",
          gridTemplateColumns: isMd ? "1fr 1.1fr" : "1fr",
          gap: isMd ? 60 : 36,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: -150,
            insetInlineEnd: -80,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${KC.lime} 0%, transparent 70%)`,
            opacity: 0.35,
          }}
        />

        <div style={{ position: "relative", color: KC.card }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: KC.lime,
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            מחשבון מהיר
          </div>
          <h2
            style={{
              fontFamily: KC.display,
              fontSize: "clamp(34px, 7vw, 54px)",
              lineHeight: 0.98,
              letterSpacing: "-0.035em",
              fontWeight: 800,
              margin: 0,
              color: KC.card,
            }}
          >
            כמה בערך
            <br />
            מגיע לך?
          </h2>

          <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 26 }}>
            <LandingSlider
              label="משכורת ברוטו חודשית"
              value={salary}
              min={6000}
              max={40000}
              step={500}
              format={(v) => "₪" + v.toLocaleString("he-IL")}
              onChange={setSalary}
            />
            <LandingSlider
              label="כמה שנים אחורה"
              value={years}
              min={1}
              max={6}
              step={1}
              format={(v) => v + " שנים"}
              onChange={setYears}
            />

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>
                קורה לך משהו מאלה?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {([
                  ["kids", "ילדים עד גיל 18"],
                  ["donation", "תרומות השנה"],
                  ["switch", "החלפתי עבודה"],
                  ["unpaid", 'חל"ת / לידה'],
                ] as const).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setFlags((f) => ({ ...f, [k]: !f[k] }))}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      padding: "10px 16px",
                      borderRadius: 99,
                      fontSize: 13.5,
                      fontWeight: 600,
                      background: flags[k] ? KC.lime : "rgba(255,255,255,0.06)",
                      color: flags[k] ? KC.ink : KC.card,
                      border: `1px solid ${flags[k] ? KC.lime : "rgba(255,255,255,0.15)"}`,
                      transition: "all 140ms",
                    }}
                  >
                    {flags[k] ? "✓ " : ""}
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 14, fontWeight: 500 }}>
            אומדן החזר משוער (טרם בדיקה מלאה)
          </div>
          <div
            style={{
              fontFamily: KC.display,
              fontSize: "clamp(64px, 14vw, 128px)",
              lineHeight: 0.92,
              letterSpacing: "-0.045em",
              fontWeight: 800,
              color: KC.card,
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ fontSize: "0.47em", color: KC.lime }}>₪</span>
            {Math.round(total).toLocaleString("he-IL")}
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 15,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.55,
              maxWidth: 380,
            }}
          >
            מתוכם כ־{fmt(per)} לשנה. הבדיקה שלנו לרוב מגלה עוד 2–3 סעיפים שלא חשבת עליהם.
          </div>
          <Link
            href="/welcome"
            style={{
              marginTop: 28,
              alignSelf: "flex-start",
              background: KC.lime,
              color: KC.ink,
              padding: "18px 28px",
              borderRadius: 99,
              fontSize: 16,
              fontWeight: 800,
              fontFamily: KC.display,
              textDecoration: "none",
            }}
          >
            קבל את הסכום המדויק שלי →
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (n: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, color: KC.card }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{label}</span>
        <span style={{ fontFamily: KC.display, fontSize: 17, fontWeight: 700, color: KC.lime }}>{format(value)}</span>
      </div>
      <div style={{ position: "relative", height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 99 }}>
        <div
          style={{
            position: "absolute",
            insetInlineStart: 0,
            top: 0,
            height: 8,
            width: `${pct}%`,
            background: KC.lime,
            borderRadius: 99,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: 8,
            opacity: 0,
            cursor: "pointer",
            direction: "ltr",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -6,
            insetInlineStart: `calc(${pct}% - 10px)`,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: KC.card,
            boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function LandingSocialProof() {
  const isMd = useIsAtLeast(768);
  const isLg = useIsAtLeast(1024);
  const quotes = [
    { sum: "₪4,210", text: "שינוי עבודה באמצע שנה. חשבתי שאני צריך רואה חשבון. 14 דקות בסה״כ ובחשבון.", who: "יעל א׳ · מעצבת, ת״א", yr: "2023" },
    { sum: "₪6,880", text: "3 שנים אחורה מגיע לי. לא האמנתי עד שהכסף נכנס. באמת. 3 שנים.", who: "מוחמד ח׳ · טכנאי, חיפה", yr: "2021–2023" },
    { sum: "₪1,940", text: "שכיר רגיל בהייטק. הייתי בטוח שלי לא מגיע כלום. היה מגיע.", who: "עידן ל׳ · מפתח, כפר סבא", yr: "2024" },
    { sum: "₪12,450", text: "אחרי חופשת לידה גיליתי 4 סעיפים שלא ידעתי שמגיעים לי. הבדיקה הייתה ברורה ומהירה.", who: "רותם פ׳ · מורה, י־ם", yr: "2022–2023" },
  ];
  const avatarColors = [KC.lime, KC.grape, KC.coral, KC.peach];
  return (
    <section style={{ padding: "clamp(60px, 10vw, 100px) clamp(16px, 5vw, 40px)", background: KC.bgSoft }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", marginBottom: 48, flexWrap: "wrap", gap: 24 }}>
          <h2
            style={{
              fontFamily: KC.display,
              fontSize: "clamp(38px, 8vw, 64px)",
              lineHeight: 0.95,
              letterSpacing: "-0.035em",
              fontWeight: 800,
              margin: 0,
              maxWidth: 700,
            }}
          >
            שכירים אמיתיים.
            <br />
            החזרים אמיתיים.
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: KC.inkSoft }}>
            <div style={{ display: "flex" }}>
              {avatarColors.map((c, i) => (
                <div
                  key={i}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: c,
                    border: `2px solid ${KC.bgSoft}`,
                    marginInlineStart: i === 0 ? 0 : -10,
                  }}
                />
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: KC.ink }}>4.9 / 5</div>
              <div style={{ fontSize: 12, color: KC.inkDim }}>מעל 12,000 דירוגים</div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isLg ? "repeat(4, 1fr)" : isMd ? "repeat(2, 1fr)" : "1fr",
            gap: 16,
          }}
        >
          {quotes.map((q, i) => (
            <div
              key={i}
              style={{
                background: KC.card,
                borderRadius: 22,
                padding: 26,
                display: "flex",
                flexDirection: "column",
                gap: 18,
                border: `1px solid ${KC.rule}`,
              }}
            >
              <div style={{ fontFamily: KC.display, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", color: KC.ink }}>
                {q.sum}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.55, color: KC.inkSoft, flex: 1 }}>“{q.text}”</div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "end",
                  paddingTop: 14,
                  borderTop: `1px solid ${KC.rule}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: KC.ink }}>{q.who}</div>
                  <div style={{ fontSize: 11.5, color: KC.inkDim, marginTop: 2 }}>שנות מס: {q.yr}</div>
                </div>
                <div style={{ fontSize: 11, fontFamily: KC.mono, color: KC.inkDim }}>VERIFIED</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFAQ() {
  const isMd = useIsAtLeast(768);
  const [open, setOpen] = useState<number>(0);
  const faqs = [
    { q: "כמה זה עולה?", a: "בשלב הבטא — השירות חינם לחלוטין. אין דמי הרשמה, אין עמלה ואין הפתעות. כשנעבור ממודל הבטא לתוכנית בתשלום, נודיע על כך מראש; כל מחיר עתידי יוצג כשהוא כולל מע״מ." },
    { q: "מה ההבדל ביניכם לבין רואה־חשבון?", a: "רואה־חשבון יושב איתכם, מבקש מסמכים, וגובה לרוב 500–1,500 ₪ על תיק שגרתי. אנחנו מציעים תהליך מודרך באתר: אתם מעלים את טופס 106 ואת אישורי הניכויים בעצמכם, אנחנו מחלצים את הנתונים מה-PDF, מחשבים את ההחזר, ומכינים עבורכם טופס 135 שאתם מגישים בעצמכם באתר רשות המיסים." },
    { q: "כמה אחורה אפשר לתבוע?", a: "עד 6 שנים אחורה (סעיף 160 לפקודת מס הכנסה). בעת ההרשמה תוכלו לבחור אילו שנים לבדוק. רוב המשתמשים בודקים את 3 השנים האחרונות בפעם הראשונה." },
    { q: "מה קורה אם יש לי כמה מעסיקים?", a: "זה אחד המצבים השכיחים בהם יש החזר. אנחנו מזהים כפילויות בתלוש, מחשבים את המס המצרפי, ובודקים תקרות ניכויים שלעיתים נחתכות לא נכון בחודשים שבהם התקבלו שתי משכורות." },
    { q: "כמה זמן עד שהכסף בחשבון?", a: "ההחזר מועבר ישירות מרשות המיסים לחשבון הבנק שלכם, לאחר הגשת טופס 135 דרככם. לוחות הזמנים תלויים ברשות המיסים — אנחנו לא יכולים להתחייב למועד מסוים, ואין לנו גישה אוטומטית למצב ההחזר במערכת רשות המיסים." },
    { q: "המידע שלי מאובטח?", a: "ההתחברות לאתר היא באמצעות חשבון Google. הנתונים שאתם מזינים נשמרים ב־Firebase של Google (Firestore + Cloud Storage) באזור us-central1, ויועברו ל־Anthropic (ארה״ב) רק לצורך פעולות הסיוע של היועץ. פירוט מלא במדיניות הפרטיות. אנחנו לא משתפים נתונים עם צדדי ג׳ נוספים." },
  ];
  return (
    <section id="faq" style={{ padding: "clamp(60px, 10vw, 100px) clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMd ? "1fr 2fr" : "1fr", gap: isMd ? 80 : 32, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: KC.inkDim, letterSpacing: "0.08em", marginBottom: 12 }}>
              ← שאלות נפוצות
            </div>
            <h2 style={{ fontFamily: KC.display, fontSize: "clamp(34px, 7vw, 52px)", lineHeight: 0.95, letterSpacing: "-0.035em", fontWeight: 800, margin: 0 }}>
              שאלות. תשובות.
            </h2>
            <p style={{ marginTop: 18, fontSize: 15, color: KC.inkSoft, lineHeight: 1.6 }}>
              לא מצאת? כתוב לצ׳אט, אנחנו עונים בדרך כלל תוך 4 דקות.
            </p>
          </div>
          <div>
            {faqs.map((f, i) => (
              <div
                key={i}
                onClick={() => setOpen(open === i ? -1 : i)}
                style={{ borderBottom: `1px solid ${KC.rule}`, padding: "22px 0", cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
                  <div style={{ fontFamily: KC.display, fontSize: 20, fontWeight: 600, color: KC.ink, letterSpacing: "-0.01em" }}>
                    {f.q}
                  </div>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: open === i ? KC.lime : KC.bgSoft,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      fontSize: 18,
                      transition: "all 200ms",
                      transform: open === i ? "rotate(45deg)" : "none",
                      flexShrink: 0,
                    }}
                  >
                    +
                  </div>
                </div>
                {open === i && (
                  <div style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, color: KC.inkSoft, maxWidth: 640 }}>
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingFooterCTA() {
  return (
    <section style={{ padding: "40px clamp(16px, 5vw, 40px) clamp(60px, 10vw, 100px)" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          background: KC.lime,
          borderRadius: 32,
          padding: "clamp(44px, 8vw, 80px) clamp(24px, 6vw, 56px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            insetInlineStart: -80,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: KC.ink,
            opacity: 0.06,
          }}
        />
        <div style={{ position: "relative", textAlign: "center", maxWidth: 760, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: KC.display,
              fontSize: "clamp(44px, 10vw, 88px)",
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
              fontWeight: 800,
              color: KC.ink,
            }}
          >
            בודקים בקלות,
            <br />
            מגישים בעצמכם.
          </div>
          <p style={{ marginTop: 22, fontSize: 18, color: KC.ink, lineHeight: 1.5, opacity: 0.75 }}>
            שירות בטא חינם. שאלון מודרך, חישוב החזר, וטופס 135 מוכן להורדה — אתם מגישים אותו באתר רשות המיסים.
          </p>
          <Link
            href="/welcome"
            style={{
              marginTop: 36,
              background: KC.ink,
              color: KC.lime,
              padding: "22px 36px",
              borderRadius: 99,
              fontSize: 19,
              fontWeight: 800,
              fontFamily: KC.display,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
            }}
          >
            בדוק כמה מגיע לי →
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  const isMd = useIsAtLeast(768);
  const cols: [string, { label: string; href: string }[]][] = [
    [
      "מוצר",
      [
        { label: "איך זה עובד", href: "/how-it-works" },
        { label: "מחירים", href: "/pricing" },
        { label: "למי זה מתאים", href: "/about" },
        { label: "מחשבון מס", href: "/tax-calculator" },
      ],
    ],
    [
      "חברה",
      [
        { label: "עלינו", href: "/about" },
        { label: "צור קשר", href: "/contact" },
      ],
    ],
    [
      "משפטי",
      [
        { label: "תנאי שימוש", href: "/terms" },
        { label: "פרטיות", href: "/privacy" },
      ],
    ],
  ];
  return (
    <footer style={{ background: KC.ink, color: KC.card, padding: "60px clamp(16px, 5vw, 40px) 32px" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMd ? "2fr 1fr 1fr 1fr" : "1fr 1fr",
          gap: isMd ? 60 : 32,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: KC.lime,
                display: "grid",
                placeItems: "center",
                color: KC.ink,
                fontFamily: KC.display,
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              ₪
            </div>
            <div style={{ fontFamily: KC.display, fontSize: 19, fontWeight: 800 }}>כסף חזרה</div>
          </div>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.6)", maxWidth: 340, lineHeight: 1.6 }}>
            שירות בטא לבדיקת זכאות להחזר מס לשכירים בישראל. אתם ממלאים שאלון מודרך, אנחנו מכינים את טופס 135, ואתם
            מגישים אותו בעצמכם באתר רשות המיסים.
          </p>
        </div>
        {cols.map(([t, items]) => (
          <div key={t}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: KC.lime }}>{t}</div>
            {items.map((i) => (
              <div key={i.label} style={{ fontSize: 13.5, marginBottom: 10 }}>
                <Link
                  href={i.href}
                  style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none" }}
                >
                  {i.label}
                </Link>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          maxWidth: 1280,
          margin: "40px auto 0",
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "rgba(255,255,255,0.45)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>© 2026 כסף חזרה · גרסת בטא — שירות חינם</div>
        <div style={{ fontFamily: KC.mono }}>Made with ☕ in Tel Aviv</div>
      </div>
    </footer>
  );
}
