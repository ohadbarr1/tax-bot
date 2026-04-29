import type { Metadata } from "next";
export const metadata: Metadata = { title: "איך זה עובד" };
export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-12">
      <h1 className="text-3xl font-bold text-foreground text-center">איך כסף חזרה עובד?</h1>
      <p className="text-center text-muted-foreground text-sm max-w-xl mx-auto leading-relaxed">
        בשלב הבטא — שירות חינם. אנחנו עוזרים לכם לבדוק זכאות להחזר מס ולהכין טופס 135. את ההגשה לרשות המיסים אתם
        מבצעים בעצמכם באזור האישי באתר taxes.gov.il.
      </p>
      {[
        { step: "01", title: "התחברות עם Google", body: "מתחברים בלחיצה אחת באמצעות חשבון Google. אין כרגע חיבור ישיר לפורטל הממשלתי (ממשל זמין / gov.il); ההזדהות באתר רשות המיסים מתבצעת בנפרד על ידכם בעת ההגשה." },
        { step: "02", title: "מעלים מסמכים וממלאים שאלון", body: "מעלים טופס 106, אישורי ניכויים, ו־Activity Statement של הברוקר במידת הצורך. ה-OCR מחלץ את הנתונים מהטפסים, ואתם משלימים שאלון מודרך על מצב משפחתי, ניכויים ונקודות זיכוי. זמן מילוי ממוצע 5–15 דקות, תלוי במורכבות התיק." },
        { step: "03", title: "מורידים את טופס 135 ומגישים בעצמכם", body: "המערכת מחשבת את ההחזר ומייצרת טופס 135 PDF להורדה. עליכם להיכנס ל־taxes.gov.il, להעלות את הטופס באזור האישי ולחתום שם. ההחזר יועבר ישירות מרשות המיסים לחשבון הבנק שלכם." },
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
