"use client";
import Link from "next/link";
import { useState } from "react";

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
        padding: "18px 40px",
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
  return (
    <section style={{ padding: "72px 40px 40px", position: "relative", overflow: "hidden" }}>
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
            fontSize: 132,
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
            gridTemplateColumns: "1.1fr 1fr",
            gap: 60,
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
            כ־<strong style={{ color: KC.ink }}>2.5 מיליון שכירים</strong> בישראל זכאים להחזר מס ולא מגישים. אנחנו עושים
            את זה בשבילך — בלי רואה־חשבון, בלי טפסים, ב־12 דקות.
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
                בדיקה חינם ב־60 שניות →
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
              <span>✓ משלמים רק אם יש החזר</span>
              <span>✓ 15% בלבד</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 72,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            background: KC.ink,
            borderRadius: 24,
            overflow: "hidden",
            color: KC.card,
          }}
        >
          <LandingStat value="₪2,840" label="החזר ממוצע ב־2024" />
          <LandingStat value="89,412" label="משתמשים הגישו דרכנו" dim />
          <LandingStat value="12 דקות" label="זמן המילוי הממוצע" />
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
        padding: "28px 28px",
        background: dim ? "rgba(255,255,255,0.03)" : "transparent",
        borderInlineStart: `1px solid rgba(255,255,255,0.08)`,
      }}
    >
      <div
        style={{
          fontFamily: KC.display,
          fontSize: 38,
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
          fontSize: 28,
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
  const steps = [
    {
      n: "01",
      title: "מתחברים למס הכנסה",
      body: "מזהים אותך דרך MyGov בלחיצה אחת. אנחנו שולפים את טפסי 106 ואישורי הניכויים שלך אוטומטית. בלי לחפש PDFים.",
      chip: "MyGov · 12 שניות",
      color: KC.grapeSoft,
      ink: KC.grape,
    },
    {
      n: "02",
      title: "עונים על 8 שאלות",
      body: "שינית עבודה? ילדת? תרמת? שאלון חכם שמזהה ב־12 דקות לאיזה מ־43 סעיפי החזר אתה זכאי.",
      chip: "43 תרחישים",
      color: KC.limeSoft,
      ink: KC.ink,
    },
    {
      n: "03",
      title: "חותמים ושולחים",
      body: "אנחנו מייצרים טופס 135, שאתה חותם עליו דיגיטלית. הוא עף למס הכנסה. את הכסף תקבל תוך 90 יום לחשבון.",
      chip: "₪ ← לחשבון",
      color: KC.peachSoft,
      ink: KC.coral,
    },
  ];
  return (
    <section style={{ padding: "100px 40px" }}>
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
                fontSize: 72,
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
            gridTemplateColumns: "repeat(3, 1fr)",
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
    <section style={{ padding: "40px 40px 100px" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          background: KC.ink,
          borderRadius: 32,
          padding: 56,
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr",
          gap: 60,
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
              fontSize: 54,
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
              fontSize: 128,
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
  const quotes = [
    { sum: "₪4,210", text: "שינוי עבודה באמצע שנה. חשבתי שאני צריך רואה חשבון. 14 דקות בסה״כ ובחשבון.", who: "יעל א׳ · מעצבת, ת״א", yr: "2023" },
    { sum: "₪6,880", text: "3 שנים אחורה מגיע לי. לא האמנתי עד שהכסף נכנס. באמת. 3 שנים.", who: "מוחמד ח׳ · טכנאי, חיפה", yr: "2021–2023" },
    { sum: "₪1,940", text: "שכיר רגיל בהייטק. הייתי בטוח שלי לא מגיע כלום. היה מגיע.", who: "עידן ל׳ · מפתח, כפר סבא", yr: "2024" },
    { sum: "₪12,450", text: "אחרי חופשת לידה גיליתי 4 סעיפים. התשלום של 15% החזיר את עצמו פי 100.", who: "רותם פ׳ · מורה, י־ם", yr: "2022–2023" },
  ];
  const avatarColors = [KC.lime, KC.grape, KC.coral, KC.peach];
  return (
    <section style={{ padding: "100px 40px", background: KC.bgSoft }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", marginBottom: 48, flexWrap: "wrap", gap: 24 }}>
          <h2
            style={{
              fontFamily: KC.display,
              fontSize: 64,
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
            gridTemplateColumns: "repeat(4, 1fr)",
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
  const [open, setOpen] = useState<number>(0);
  const faqs = [
    { q: "זה באמת חינם אם לא מגיע לי החזר?", a: "כן. אנחנו לוקחים 15% מהסכום שמתקבל בחשבון שלך בפועל. אם לא התקבל דבר — לא שילמת דבר. אין דמי הרשמה, אין דמי ביטול, אין הפתעות." },
    { q: "מה ההבדל ביניכם לבין רואה־חשבון?", a: "רואה־חשבון גובה 500–1,500₪ מראש ומבקש ממך לאסוף ערימת מסמכים. אנחנו מושכים את המסמכים אוטומטית ממס הכנסה, עובדים עם אותם כללים בדיוק, וגובים רק אם יצא לך כסף." },
    { q: "כמה אחורה אפשר לתבוע?", a: "עד 6 שנים אחורה. בעת ההרשמה תוכל לבחור אילו שנים לבדוק. רוב המשתמשים מגישים על 3 שנים אחרונות בפעם הראשונה." },
    { q: "מה קורה אם יש לי כמה מעסיקים?", a: "זה דווקא המצב שבו הכי סביר שמגיע לך החזר. אנחנו מזהים כפילויות בתלוש, מחשבים מס ממוצע נכון, ושוברים תקרות ניכויים שמס הכנסה מחשב לא נכון בחודשים של שתי משכורות." },
    { q: "כמה זמן עד שהכסף בחשבון?", a: "בממוצע 45–90 יום מרגע ההגשה. אנחנו עוקבים אחרי הבקשה שלך מול מס הכנסה, ומתריעים לך על כל התקדמות. אם יש בירור — אנחנו מטפלים בו." },
    { q: "המידע שלי מאובטח?", a: "החיבור למס הכנסה הוא דרך MyGov, בדיוק כמו בכל שירות ממשלתי. המידע שלך מוצפן, אנחנו לא שומרים סיסמאות, ולא משתפים נתונים עם אף צד שלישי. מאושרים ע״י רשות האבטחה." },
  ];
  return (
    <section id="faq" style={{ padding: "100px 40px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 80, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: KC.inkDim, letterSpacing: "0.08em", marginBottom: 12 }}>
              ← שאלות נפוצות
            </div>
            <h2 style={{ fontFamily: KC.display, fontSize: 52, lineHeight: 0.95, letterSpacing: "-0.035em", fontWeight: 800, margin: 0 }}>
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
    <section style={{ padding: "40px 40px 100px" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          background: KC.lime,
          borderRadius: 32,
          padding: "80px 56px",
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
              fontSize: 88,
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
              fontWeight: 800,
              color: KC.ink,
            }}
          >
            עוד 12 דקות
            <br />
            והכסף בדרך.
          </div>
          <p style={{ marginTop: 22, fontSize: 18, color: KC.ink, lineHeight: 1.5, opacity: 0.75 }}>
            בדיקה חינם. משלמים רק אם מתקבל החזר. בלי רואה־חשבון. בלי להוריד שום דבר.
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
  const cols: [string, string[]][] = [
    ["מוצר", ["איך זה עובד", "מחירים", "למי זה מתאים", "אבטחה"]],
    ["חברה", ["עלינו", "בלוג", "קריירה", "שותפויות"]],
    ["משפטי", ["תנאי שימוש", "פרטיות", "רישיון יועץ מס", "צור קשר"]],
  ];
  return (
    <footer style={{ background: KC.ink, color: KC.card, padding: "60px 40px 32px" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 60,
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
            האפליקציה שמחזירה לשכירים בישראל מה שהמדינה חייבת להם — בלי טפסים, בלי רואה־חשבון.
          </p>
        </div>
        {cols.map(([t, items]) => (
          <div key={t}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: KC.lime }}>{t}</div>
            {items.map((i) => (
              <div key={i} style={{ fontSize: 13.5, color: "rgba(255,255,255,0.7)", marginBottom: 10, cursor: "pointer" }}>
                {i}
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
        <div>© 2025 כסף חזרה · רישיון יועצי מס 8811·2024</div>
        <div style={{ fontFamily: KC.mono }}>Made with ☕ in Tel Aviv</div>
      </div>
    </footer>
  );
}
