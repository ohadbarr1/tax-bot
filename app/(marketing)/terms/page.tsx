import type { Metadata } from "next";
export const metadata: Metadata = { title: "תנאי שימוש" };
export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 space-y-6">
      <h1 className="text-3xl font-bold text-foreground">תנאי שימוש</h1>
      <p className="text-muted-foreground text-sm">עודכן לאחרונה: ינואר 2025</p>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">שימוש בשירות</h2>
        <p className="text-muted-foreground leading-relaxed text-sm">TaxBack IL הינה כלי עזר לחישוב מס ואינה מהווה ייעוץ מס מקצועי. יש להתייעץ עם רואה חשבון מוסמך לפני הגשת כל מסמך לרשות המיסים.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">אחריות</h2>
        <p className="text-muted-foreground leading-relaxed text-sm">החברה אינה אחראית לשגיאות הנובעות מנתונים שגויים שהוזנו על ידי המשתמש. כל חישוב הוא אינדיקטיבי בלבד.</p>
      </section>
    </div>
  );
}
