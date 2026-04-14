import type { Metadata } from "next";
export const metadata: Metadata = { title: "תמחור" };
export default function PricingPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-foreground mb-4">תמחור שקוף</h1>
      <p className="text-muted-foreground mb-12">פרטי התמחור יפורסמו בקרוב. בשלב הבטא — הכל בחינם.</p>
      <div className="inline-block bg-amber-100 dark:bg-amber-100/20 text-amber-800 dark:text-amber-500 font-semibold px-6 py-3 rounded-2xl border border-amber-500/30">
        🎉 גרסת בטא — גישה מלאה ללא עלות
      </div>
    </div>
  );
}
