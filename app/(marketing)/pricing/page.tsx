import type { Metadata } from "next";
export const metadata: Metadata = { title: "תמחור" };
export default function PricingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <header className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-foreground">תמחור שקוף</h1>
        <p className="text-muted-foreground">בשלב הבטא — שירות חינם. אין עמלת הצלחה, אין דמי הרשמה, אין דמי ביטול.</p>
      </header>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-3 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <span className="inline-block bg-emerald-100 text-emerald-800 dark:bg-emerald-100/20 dark:text-emerald-400 font-semibold px-3 py-1 rounded-full text-xs">
            כעת בבטא
          </span>
          <h2 className="text-lg font-bold text-foreground">גרסת בטא — חינם</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          בתקופת הבטא כל הפיצ׳רים זמינים ללא עלות: בדיקת זכאות, חישוב החזר מס, יצירת טופס 135 להורדה ועזרה
          באמצעות יועץ AI. אתם מגישים את הטופס בעצמכם באתר רשות המיסים (taxes.gov.il).
        </p>
        <ul className="text-sm text-muted-foreground list-disc ps-5 space-y-1">
          <li>בדיקת זכאות במגוון רחב של סעיפי החזר.</li>
          <li>טופס 135 PDF מוכן להגשה ידנית באזור האישי באתר רשות המיסים.</li>
          <li>גישה מלאה לעוזר ה־AI לשאלות תוך כדי המילוי.</li>
        </ul>
      </div>

      <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-3">
        <h2 className="text-lg font-bold text-foreground">תוכנית בתשלום (מתוכננת)</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          כשנעבור ממודל הבטא לתוכנית בתשלום, נודיע על כך מראש לכל המשתמשים. כל מחיר עתידי יוצג ככולל מע״מ
          (חוק הגנת הצרכן, התשמ״א-1981) ויפורט בתנאי השימוש לפני חיוב כלשהו.
        </p>
        <p className="text-xs text-muted-foreground/80">
          נכון להיום אין בשירות תשתית גבייה: לא Stripe, לא Cardcom, ולא חשבונית ישראל. כל הכלים שמופיעים באתר —
          חינם.
        </p>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        שאלות על תמחור?{" "}
        <a href="/contact" className="underline hover:text-foreground">צרו קשר</a>.
      </div>
    </div>
  );
}
