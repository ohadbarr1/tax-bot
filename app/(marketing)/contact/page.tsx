import type { Metadata } from "next";
export const metadata: Metadata = { title: "צור קשר" };

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 space-y-6 leading-relaxed">
      <h1 className="text-3xl font-bold text-foreground">צרו קשר</h1>
      <p className="text-muted-foreground">
        אשמח לשמוע מכם — שאלות על השימוש בשירות, דיווח על באג, בקשות מימוש זכויות מידע (DSAR), או הצעות לשיפור.
      </p>

      <section className="bg-card border border-border rounded-2xl p-6 space-y-3 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold text-foreground">דוא״ל תמיכה</h2>
        <p className="text-sm text-muted-foreground">
          הדרך המהירה ביותר ליצור קשר היא דרך הדוא״ל הבא:
        </p>
        <p className="text-base">
          <a className="font-mono underline hover:text-foreground" href="mailto:support@taxback.il">
            support@taxback.il
          </a>
        </p>
        <p className="text-xs text-muted-foreground">
          זמן תגובה משוער בתקופת הבטא: עד 5 ימי עסקים. ייתכן שגם פנייה בנושאי פרטיות (חוק הגנת הפרטיות, סעיף
          13) ובקשות מחיקה.
        </p>
      </section>

      <section className="bg-muted/30 border border-border rounded-2xl p-6 space-y-2">
        <h2 className="text-base font-semibold text-foreground">חשוב לדעת</h2>
        <ul className="list-disc ps-5 text-sm text-muted-foreground space-y-1">
          <li>כסף חזרה הוא שירות בטא חינם.</li>
          <li>אנחנו לא ממלאים מקום של רואה חשבון או יועץ מס מוסמך.</li>
          <li>הגשת טופס 135 לרשות המיסים מתבצעת על ידיכם באתר taxes.gov.il.</li>
        </ul>
      </section>
    </div>
  );
}
