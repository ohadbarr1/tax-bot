import type { Metadata } from "next";
export const metadata: Metadata = { title: "אודות" };
export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 space-y-6 leading-relaxed">
      <h1 className="text-3xl font-bold text-foreground">אודות כסף חזרה</h1>
      <p className="text-muted-foreground">
        כסף חזרה היא פלטפורמה טכנולוגית ישראלית בגרסת בטא, שמטרתה לפשט את התהליך של בדיקת זכאות להחזר מס לשכירים
        בישראל. אנחנו מאמינים שכל שכיר זכאי לראות בבירור מה מגיע לו — ללא בירוקרטיה מיותרת.
      </p>
      <p className="text-muted-foreground">
        המערכת מבוססת על חישוב מס ישראלי, OCR לקריאת טפסים שאתם מעלים (טופס 106 ואישורי ניכויים), ושימוש במודל
        שפה (Anthropic Claude) להסבר ולעוזר שאלון. בסיום התהליך אנחנו מכינים עבורכם טופס 135 PDF; אתם מעלים
        אותו ידנית באזור האישי באתר רשות המיסים (taxes.gov.il) ומגישים אותו בעצמכם.
      </p>
      <p className="text-muted-foreground">
        בשלב הבטא — השירות חינם. אין עמלת הצלחה ואין דמי הרשמה. השירות אינו מהווה ייעוץ מס מקצועי; במקרי ספק
        מומלץ להתייעץ עם רואה חשבון או יועץ מס מוסמך.
      </p>
    </div>
  );
}
