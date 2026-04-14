import type { Metadata } from "next";
export const metadata: Metadata = { title: "מדיניות פרטיות" };
export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 space-y-6">
      <h1 className="text-3xl font-bold text-foreground">מדיניות פרטיות</h1>
      <p className="text-muted-foreground text-sm">עודכן לאחרונה: ינואר 2025</p>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">איסוף מידע</h2>
        <p className="text-muted-foreground leading-relaxed text-sm">TaxBack IL אוספת מידע אישי ופיננסי אך ורק לצורך חישוב החזר המס שלכם. המידע מוצפן בצד הלקוח ואינו נשלח לשרתים חיצוניים ללא הסכמתכם.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">שמירת מידע</h2>
        <p className="text-muted-foreground leading-relaxed text-sm">כל הנתונים נשמרים מקומית בדפדפן שלכם (IndexedDB). אין אחסון בענן ללא הסכמה מפורשת.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">יצירת קשר</h2>
        <p className="text-muted-foreground leading-relaxed text-sm">לשאלות בנוגע לפרטיות: privacy@taxback.il</p>
      </section>
    </div>
  );
}
