import type { Metadata } from "next";
export const metadata: Metadata = { title: "איך זה עובד" };
export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-12">
      <h1 className="text-3xl font-bold text-foreground text-center">איך TaxBack IL עובד?</h1>
      {[
        { step: "01", title: "ענו על השאלון", body: "שאלון חכם של 3 דקות לאיסוף פרטי ההכנסה, המשפחה, הניכויים ונקודות הזיכוי." },
        { step: "02", title: "העלו מסמכים", body: "העלו טופס 106 מהמעסיק, Activity Statement מהברוקר — ה-OCR שלנו מחלץ את הנתונים אוטומטית." },
        { step: "03", title: "קבלו את הטופס", body: "המערכת מחשבת את ההחזר המקסימלי ומייצרת טופס 135 מוכן להגשה לרשות המיסים." },
      ].map(s => (
        <div key={s.step} className="flex gap-6 items-start bg-card border border-border rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <span className="text-4xl font-black text-primary/20 tabular-nums shrink-0">{s.step}</span>
          <div>
            <h2 className="text-lg font-bold text-foreground mb-2">{s.title}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
