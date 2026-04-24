"use client";
import { useState } from "react";
import { Check, Zap, FileDown, Loader2 } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { downloadGeneratedForm } from "@/lib/pdfDownload";
import { refundHeadline } from "@/lib/refundDisplay";

const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

export default function FilingPage() {
  const { state } = useApp();
  const refund = state.financials.estimatedRefund ?? 0;
  const headline = refundHeadline(refund);
  // When the user owes ITA (refund <= 0), no service fee applies and the
  // net === balance-due. When they're owed money, the 6% fee comes off the top.
  const fee = headline.hasRefund ? Math.round(refund * 0.06) : 0;
  const net = headline.hasRefund ? refund - fee : refund;
  const bankAcc = state.taxpayer.bank?.account
    ? `•••${state.taxpayer.bank.account.slice(-3)}`
    : "";
  const bankName = state.taxpayer.bank?.bankName ?? "";
  const taxpayer = state.taxpayer;
  const financials = state.financials;

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadDisabled = !taxpayer.idNumber;

  const handleDownload = async () => {
    if (downloadDisabled || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    const result = await downloadGeneratedForm(taxpayer, financials, {
      selectedSources: state.onboarding?.sources,
    });
    setDownloading(false);
    if (result.kind === "error") setDownloadError(result.message);
    else if (result.kind === "template_missing")
      setDownloadError(`נדרש להעלות את התבנית הרשמית של טופס ${result.formType} לשרת.`);
  };

  const signDisabled = !headline.hasRefund || downloadDisabled;

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

  const summary = headline.hasRefund
    ? [
        { label: "החזר משוער", value: fmt(refund), color: "var(--kc-lime)" },
        { label: "עמלת השירות", value: fmt(fee), sub: "6% מההחזר", color: "var(--kc-ink)" },
        { label: "נטו אליך", value: fmt(net), color: "var(--kc-grape)" },
      ]
    : headline.tone === "debt"
      ? [
          { label: "יתרת מס לתשלום", value: fmt(headline.amountAbs), color: "var(--kc-coral)" },
          { label: "עמלת השירות", value: "לא חלה", sub: "אין עמלה על יתרת חוב", color: "var(--kc-ink-dim)" },
          { label: "סכום לתשלום", value: fmt(headline.amountAbs), color: "var(--kc-coral)" },
        ]
      : [
          { label: "החזר משוער", value: "—", color: "var(--kc-ink-dim)" },
          { label: "עמלת השירות", value: "לא חלה", color: "var(--kc-ink-dim)" },
          { label: "סכום נטו", value: "—", color: "var(--kc-ink-dim)" },
        ];

  return (
    <div className="kc-rise px-5 md:px-10 pt-2 pb-20">
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5">
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
              {headline.hasRefund
                ? "עוד חתימה אחת והחזר בדרך"
                : headline.tone === "debt"
                  ? "טיוטה מראה יתרת חוב"
                  : "הטיוטה טרם שלמה"}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 10, lineHeight: 1.55, maxWidth: 440 }}>
              {headline.hasRefund
                ? `ברגע שתחתום, נשלח את הטופס ישירות למחשב של מס הכנסה. ברוב המקרים הכסף מגיע תוך 21–45 יום ${bankName ? `לחשבון ${bankName} שלך` : "לחשבון הבנק שלך"}.`
                : headline.tone === "debt"
                  ? "לפי הנתונים כרגע, נוכה מהמעסיק פחות מהחבות בפועל. בדוק את הנתונים לפני הגשה — התשלום מבוצע ישירות מול רשות המיסים."
                  : "השלם שאלון, מסמכים וחישוב סופי כדי לראות אם מגיע לך החזר."}
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

          {headline.hasRefund ? (
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
          ) : (
            <div
              style={{
                background: "var(--kc-coral-soft)",
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
                  background: "var(--kc-coral)",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  fontWeight: 800,
                  fontFamily: "var(--font-figtree)",
                  fontSize: 20,
                }}
              >
                ₪
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--kc-ink)" }}>
                  {headline.tone === "debt"
                    ? "יתרה לתשלום לרשות המיסים"
                    : "אין החזר צפוי בטיוטה הנוכחית"}
                </div>
                <div style={{ fontSize: 12, color: "var(--kc-ink-soft)", marginTop: 2 }}>
                  {headline.tone === "debt"
                    ? "התשלום מבוצע ישירות מול רשות המיסים, לא דרך כסף חזרה"
                    : "השלם את השאלון והמסמכים כדי לראות חישוב סופי"}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={signDisabled ? undefined : () => { /* signing flow — see Round 2 plan */ }}
            disabled={signDisabled}
            title={
              !headline.hasRefund
                ? "אין מה להגיש — הטיוטה הנוכחית לא מזכה בהחזר"
                : downloadDisabled
                  ? "השלם פרטים אישיים לפני חתימה"
                  : undefined
            }
            style={{
              all: "unset",
              cursor: signDisabled ? "not-allowed" : "pointer",
              textAlign: "center",
              background: signDisabled ? "rgba(26,26,31,0.45)" : "var(--kc-ink)",
              color: signDisabled ? "rgba(255,255,255,0.6)" : "var(--kc-lime)",
              padding: "18px 24px",
              borderRadius: 22,
              fontSize: 16,
              fontWeight: 800,
              fontFamily: "var(--font-figtree)",
              letterSpacing: "-0.01em",
              opacity: signDisabled ? 0.7 : 1,
            }}
          >
            {signDisabled && !headline.hasRefund ? "אין מה להגיש עדיין" : "חתום והגש עכשיו"}
          </button>
          <div style={{ fontSize: 12, color: "var(--kc-ink-dim)", textAlign: "center", lineHeight: 1.55 }}>
            בלחיצה על חתום אתה מאשר את הצהרת מגיש · ניתן לבטל תוך 14 יום
          </div>

          <button
            onClick={handleDownload}
            disabled={downloadDisabled || downloading}
            title={downloadDisabled ? "השלם פרטים אישיים לפני הורדה" : undefined}
            style={{
              all: "unset",
              cursor: downloadDisabled || downloading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--kc-ink-dim)",
              textAlign: "center",
              textDecoration: "underline",
              marginTop: 6,
              opacity: downloadDisabled || downloading ? 0.6 : 1,
            }}
          >
            {downloading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                מייצר טיוטה...
              </>
            ) : (
              <>
                <FileDown size={14} />
                הצג טיוטת 135 המלאה
              </>
            )}
          </button>
          {downloadError && (
            <div
              role="alert"
              style={{
                fontSize: 12,
                color: "var(--kc-coral)",
                textAlign: "center",
                marginTop: 2,
              }}
            >
              {downloadError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
