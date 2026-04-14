"use client";

/**
 * EducationCenter — /education
 *
 * Static informational page covering Israeli tax topics:
 *   1. Tax brackets 2024/2025 (from JSON)
 *   2. Credit points table
 *   3. Capital gains tax
 *   4. Real estate taxation
 *   5. Key deductions
 *
 * Uses native <details>/<summary> for collapsible sections.
 * All text in Hebrew, RTL layout.
 */

import taxDataRaw from "@/data/tax_brackets_2024_2025.json";
import { BookOpen } from "lucide-react";

const taxData = taxDataRaw as {
  [year: string]: {
    tax_year: number;
    credit_point_monthly_value: number;
    credit_point_annual_value: number;
    tax_brackets: { bracket: number; rate: number; min: number; max: number }[];
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtILS(n: number) {
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
}

function pct(r: number) {
  return `${(r * 100).toFixed(0)}%`;
}

// ─── Collapsible Section Wrapper ──────────────────────────────────────────────

function Section({ title, children, defaultOpen = false }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group bg-card border border-border rounded-2xl overflow-hidden"
    >
      <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none list-none hover:bg-muted/50 transition-colors">
        <span className="font-bold text-base text-foreground">{title}</span>
        <span className="text-muted-foreground text-xl leading-none group-open:rotate-180 transition-transform duration-200">
          ›
        </span>
      </summary>
      <div className="px-6 pb-6 pt-2">{children}</div>
    </details>
  );
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm text-right">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="bg-muted/60 px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">{children}</th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-2.5 border-t border-border tabular-nums ${className ?? ""}`}>{children}</td>
  );
}

// ─── Section 1: Tax Brackets ──────────────────────────────────────────────────

function TaxBracketsSection() {
  const brackets2024 = taxData["2024"].tax_brackets;
  const brackets2025 = taxData["2025"].tax_brackets;
  const cpv2024 = taxData["2024"].credit_point_annual_value;
  const cpv2025 = taxData["2025"].credit_point_annual_value;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        מדרגות מס ההכנסה בישראל הן פרוגרסיביות — שיעור המס עולה עם ההכנסה. הסכומים מתעדכנים מדי שנה לפי מדד.
      </p>

      {/* 2-year comparison */}
      <Table>
        <thead>
          <tr>
            <Th>מדרגה</Th>
            <Th>שיעור</Th>
            <Th>רצועה 2024 (₪)</Th>
            <Th>רצועה 2025 (₪)</Th>
          </tr>
        </thead>
        <tbody>
          {brackets2024.map((b, i) => {
            const b25 = brackets2025[i];
            const maxLabel2024 = b.max >= 9_000_000 ? "ומעלה" : fmtILS(b.max);
            const maxLabel2025 = b25.max >= 9_000_000 ? "ומעלה" : fmtILS(b25.max);
            return (
              <tr key={b.bracket} className="hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{b.bracket}</Td>
                <Td className="font-semibold text-primary">{pct(b.rate)}</Td>
                <Td>{fmtILS(b.min)} – {maxLabel2024}</Td>
                <Td>{fmtILS(b25.min)} – {maxLabel2025}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="flex gap-6 text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
        <span>נקודת זיכוי 2024: <strong className="text-foreground">{fmtILS(cpv2024)} לשנה</strong></span>
        <span>נקודת זיכוי 2025: <strong className="text-foreground">{fmtILS(cpv2025)} לשנה</strong></span>
      </div>
    </div>
  );
}

// ─── Section 2: Credit Points ─────────────────────────────────────────────────

function CreditPointsSection() {
  const cpv2024 = taxData["2024"].credit_point_annual_value; // 2904
  const cpv2025 = taxData["2025"].credit_point_annual_value; // 3000

  const rows: { type: string; points: string; note: string }[] = [
    { type: "תושב ישראל", points: "2.25", note: "כל אזרח ישראלי" },
    { type: "נשוי/נשואה", points: "+1.0", note: "בנוסף על בסיס" },
    { type: "בן/בת זוג שאינו/ה עובד/ת", points: "+0.5", note: "אם בן/בת הזוג ללא הכנסה" },
    { type: "הורה יחידני", points: "+1.0", note: "ראש משק בית" },
    { type: "ילד מתחת לגיל 18", points: "+1.0", note: "לכל ילד" },
    { type: "ילד שנולד בשנת המס", points: "+1.5", note: "בשנת הלידה" },
    { type: "ילד בגיל 1-2 בגן", points: "+2.0", note: "ילד ראשון/שני במעון מוכר" },
    { type: "ילד בגיל 3-5 בגן", points: "+2.5", note: "ילד ראשון/שני בגן מוכר" },
    { type: "תואר ראשון (BA)", points: "+0.5", note: "שנה אחת לאחר סיום" },
    { type: "תואר שני (MA)", points: "+1.0", note: "שנה אחת לאחר סיום" },
    { type: "תואר שלישי (PhD)", points: "+1.5", note: "שנה אחת לאחר סיום" },
    { type: "שחרור מצבא (זכר)", points: "2.0", note: "3 שנים מיום השחרור" },
    { type: "שחרור מצבא (נקבה)", points: "1.75", note: "3 שנים מיום השחרור" },
    { type: "עולה חדש", points: "3→2→1", note: "שנים 1, 2, 3 מיום העלייה" },
    { type: "נכות מוכרת", points: "משתנה", note: "לפי אחוז נכות ואישור מס הכנסה" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        נקודת זיכוי מקטינה ישירות את סכום המס. ערך נקודה בשנת 2024 הוא{" "}
        <strong className="text-foreground">{fmtILS(cpv2024)}</strong> לשנה ובשנת 2025{" "}
        <strong className="text-foreground">{fmtILS(cpv2025)}</strong> לשנה.
      </p>

      <Table>
        <thead>
          <tr>
            <Th>סוג זיכוי</Th>
            <Th>מספר נקודות</Th>
            <Th>שווי שנתי 2024</Th>
            <Th>שווי שנתי 2025</Th>
            <Th>הערות</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pts = parseFloat(r.points.replace("→", "").replace("+", ""));
            const isVariable = isNaN(pts) || r.points.includes("→") || r.points === "משתנה";
            return (
              <tr key={r.type} className="hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{r.type}</Td>
                <Td className="text-primary font-semibold">{r.points}</Td>
                <Td>{isVariable ? "—" : fmtILS(pts * cpv2024)}</Td>
                <Td>{isVariable ? "—" : fmtILS(pts * cpv2025)}</Td>
                <Td className="text-muted-foreground text-xs">{r.note}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

// ─── Section 3: Capital Gains ─────────────────────────────────────────────────

function CapitalGainsSection() {
  return (
    <div className="space-y-4 text-sm text-foreground leading-relaxed">
      <p>
        <strong>שיעור מס רווחי הון בישראל: 25% על הרווח הנטו</strong> (רווחים פחות הפסדים ממומשים).
      </p>

      <div className="space-y-3">
        <h4 className="font-semibold text-base">זיכוי מס זר</h4>
        <p className="text-muted-foreground">
          מס ששולם בחו"ל (Withholding Tax) מקוזז כנגד המס הישראלי. אם ניכוי המס זר עולה על 25% —
          ניתן לקבל החזר חלקי. החישוב מתבצע לפי אמנות המס של ישראל עם כל מדינה.
        </p>

        <h4 className="font-semibold text-base">כיצד ניכוי IBKR מקזז מס ישראלי</h4>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground pr-2">
          <li>Interactive Brokers מנכה מס דיבידנד אמריקאי (בדרך כלל 25% או 15% לפי אמנה)</li>
          <li>מס זה מדווח בשדה 055 בטופס 1301</li>
          <li>קיזוז: מס ישראלי שחושב − ניכוי מס זר = יתרת חבות</li>
          <li>אם הניכוי גבוה מהמס הישראלי — אין החזר אך אין תוספת תשלום</li>
        </ul>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-xs">
          <strong>חשוב:</strong> הפסדי הון ממומשים מקזזים רווחים בשנה הנוכחית. הפסד שלא קוזז ניתן
          להעביר לשנות מס עתידיות. נדרש דיווח בטופס 1301.
        </div>
      </div>
    </div>
  );
}

// ─── Section 4: Real Estate ───────────────────────────────────────────────────

function RealEstateSection() {
  const purchaseRowsPrimary = [
    { range: "0 – ₪1,978,745", rate: "0%" },
    { range: "₪1,978,746 – ₪2,347,040", rate: "3.5%" },
    { range: "₪2,347,041 – ₪6,055,070", rate: "5%" },
    { range: "₪6,055,071 – ₪20,183,565", rate: "8%" },
    { range: "מעל ₪20,183,565", rate: "10%" },
  ];

  const purchaseRowsInvestment = [
    { range: "0 – ₪6,055,070", rate: "8%" },
    { range: "מעל ₪6,055,070", rate: "10%" },
  ];

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-3">
        <h4 className="font-semibold text-base text-foreground">מס רכישה — דירה יחידה (עיקרית)</h4>
        <Table>
          <thead>
            <tr>
              <Th>טווח מחיר</Th>
              <Th>שיעור מס</Th>
            </tr>
          </thead>
          <tbody>
            {purchaseRowsPrimary.map((r) => (
              <tr key={r.range} className="hover:bg-muted/30 transition-colors">
                <Td>{r.range}</Td>
                <Td className="font-semibold text-primary">{r.rate}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="space-y-3">
        <h4 className="font-semibold text-base text-foreground">מס רכישה — דירה להשקעה</h4>
        <Table>
          <thead>
            <tr>
              <Th>טווח מחיר</Th>
              <Th>שיעור מס</Th>
            </tr>
          </thead>
          <tbody>
            {purchaseRowsInvestment.map((r) => (
              <tr key={r.range} className="hover:bg-muted/30 transition-colors">
                <Td>{r.range}</Td>
                <Td className="font-semibold text-primary">{r.rate}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-base text-foreground">מס שבח (רווח ממכירת נכס)</h4>
        <p className="text-muted-foreground leading-relaxed">
          <strong className="text-foreground">25%</strong> על הרווח הריאלי (לאחר התאמת מדד).
          פטור מלא למכירת דירת מגורים יחידה שהוחזקה{" "}
          <strong className="text-foreground">18 חודשים ומעלה</strong>, בתנאי שלמוכר אין דירה
          נוספת. הפטור ניתן אחת ל-18 חודשים.
        </p>
      </div>
    </div>
  );
}

// ─── Section 5: Deductions ────────────────────────────────────────────────────

function DeductionsSection() {
  const rows: { section: string; name: string; rate: string; cap: string; note: string }[] = [
    {
      section: "סעיף 9א",
      name: "מזונות",
      rate: "ניכוי מלא מהכנסה",
      cap: "ללא תקרה",
      note: "תשלומי מזונות מכוח פסק דין",
    },
    {
      section: "סעיף 46",
      name: "תרומות",
      rate: "זיכוי 35%",
      cap: "עד 30% מהכנסה חייבת",
      note: "לגופים מוכרים ע\"י מס הכנסה",
    },
    {
      section: "סעיף 45א",
      name: "ביטוח חיים פרטי",
      rate: "זיכוי 25%",
      cap: "עד 5% ממשכורת (מקסימום 1,800₪)",
      note: "פוליסות מוכרות בלבד",
    },
    {
      section: "סעיף 47",
      name: "פנסיה עצמאית",
      rate: "זיכוי 35%",
      cap: "עד 5% ממשכורת (מקסימום ~10,000₪)",
      note: "הפקדות מעל ניכוי מעסיק",
    },
    {
      section: "קרן השתלמות",
      name: "קרן השתלמות שכיר",
      rate: "ניכוי מהכנסה",
      cap: "פטור עד 19,800₪ לשנה (2024)",
      note: "הפקדת עובד פטורה ממס",
    },
    {
      section: "קרן השתלמות",
      name: "קרן השתלמות עצמאי",
      rate: "ניכוי מהכנסה",
      cap: "עד 4.5% מהכנסה (מקסימום ~18,400₪)",
      note: "הפקדה מוכרת עד תקרה",
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ניכויים מפחיתים את ההכנסה החייבת לפני חישוב המס, בעוד שזיכויים מפחיתים ישירות את סכום המס שנחשב.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>סעיף</Th>
            <Th>שם</Th>
            <Th>שיעור</Th>
            <Th>תקרה</Th>
            <Th>הערות</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.section + r.name} className="hover:bg-muted/30 transition-colors">
              <Td className="font-medium text-primary">{r.section}</Td>
              <Td className="font-medium">{r.name}</Td>
              <Td>{r.rate}</Td>
              <Td className="text-xs">{r.cap}</Td>
              <Td className="text-muted-foreground text-xs">{r.note}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EducationCenter() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8" dir="rtl">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">מרכז ידע</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          מדריך מקיף למיסוי ישראלי — מדרגות מס, נקודות זיכוי, רווחי הון ומקרקעין
        </p>
      </div>

      <div className="space-y-4">
        <Section title="מדרגות מס הכנסה 2024 / 2025" defaultOpen>
          <TaxBracketsSection />
        </Section>

        <Section title="נקודות זיכוי">
          <CreditPointsSection />
        </Section>

        <Section title="מס רווחי הון">
          <CapitalGainsSection />
        </Section>

        <Section title="מיסוי מקרקעין — מס רכישה ומס שבח">
          <RealEstateSection />
        </Section>

        <Section title="ניכויים עיקריים">
          <DeductionsSection />
        </Section>
      </div>

      <p className="mt-8 text-xs text-muted-foreground text-center">
        המידע מוצג לצרכי לימוד בלבד ואינו מהווה ייעוץ משפטי או מס. המספרים נכונים לשנות המס 2024–2025.
      </p>
    </div>
  );
}
