import type { Metadata } from "next";
export const metadata: Metadata = { title: "אודות" };
export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 space-y-6">
      <h1 className="text-3xl font-bold text-foreground">אודות TaxBack IL</h1>
      <p className="text-muted-foreground leading-relaxed">TaxBack IL היא פלטפורמה טכנולוגית ישראלית לאוטומציה של תהליך בקשת החזר המס. אנחנו מאמינים שכל שכיר בישראל זכאי להחזיר את הכסף שמגיע לו — ללא בירוקרטיה מסובכת.</p>
      <p className="text-muted-foreground leading-relaxed">המערכת מבוססת על חישוב מס ישראלי מקיף, OCR מתקדם לקריאת טפסים, ומנוע AI לגילוי זכאויות נסתרות.</p>
    </div>
  );
}
