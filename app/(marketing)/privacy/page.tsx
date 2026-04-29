import type { Metadata } from "next";
export const metadata: Metadata = { title: "מדיניות פרטיות" };
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-6 leading-relaxed">
      <h1 className="text-3xl font-bold text-foreground">מדיניות פרטיות</h1>
      <p className="text-muted-foreground text-sm">עודכן לאחרונה: 29 באפריל 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">סטטוס המסמך</h2>
        <p className="text-muted-foreground text-sm">
          זוהי מדיניות פרטיות שקופה לתקופת הבטא. עמידה מלאה בדרישות תיקון 13 לחוק הגנת הפרטיות (תשפ״ד-2024) —
          כולל מינוי DPO, ביצוע DPIA, סיווג תיק נתונים, ויומן ביקורת בלתי-משתנה — מתוכננת לפני יציאה ממצב בטא.
          המסמך הזה נועד לתאר במדויק מה השירות עושה היום, לא להצהיר על עמידה רגולטורית שטרם הושלמה.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">מי אנחנו</h2>
        <p className="text-muted-foreground text-sm">
          השירות &quot;כסף חזרה&quot; (להלן: <strong>השירות</strong>) הוא שירות בטא חינם המסייע לשכירים בישראל לבדוק
          זכאות להחזר מס ולהכין טופס 135 להגשה עצמית באתר רשות המיסים. השירות אינו מהווה ייעוץ מס מקצועי
          ואינו מבצע הגשה אוטומטית.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">איזה מידע אנחנו אוספים</h2>
        <ul className="list-disc ps-5 text-muted-foreground text-sm space-y-1">
          <li>פרטי זיהוי: שם מלא, מספר תעודת זהות, מצב משפחתי, מספרי ילדים ובני זוג.</li>
          <li>פרטי בנק לקליטת ההחזר (מס׳ סניף וחשבון).</li>
          <li>נתוני הכנסה ומיסוי: שכר ברוטו, ניכוי מס, הפקדות לפנסיה וקרנות השתלמות, תרומות, פיצויי פיטורין, נקודות זיכוי.</li>
          <li>מסמכים שאתם מעלים: טופס 106, אישורי ניכויים, Activity Statement של ברוקר, תעודות אקדמיות, אישורי תרומה ועוד.</li>
          <li>מידע טכני בסיסי לצורכי תפעול: כתובת IP, סוג דפדפן וזיהוי ייחודי של המשתמש (UID של Firebase).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">מי מעבד את המידע ואיפה</h2>
        <p className="text-muted-foreground text-sm">המידע אינו נשמר רק במכשיר שלכם. הוא מאוחסן ומעובד אצל קבלני המשנה הבאים:</p>
        <ul className="list-disc ps-5 text-muted-foreground text-sm space-y-1">
          <li>
            <strong>Google LLC</strong> — שירותי Firebase Authentication, Cloud Firestore ו־Cloud Storage.
            איזור עיבוד: <code className="font-mono">us-central1</code> (ארה״ב). המידע (כולל המסמכים שאתם מעלים)
            נשמר על שרתי Google בארה״ב.
          </li>
          <li>
            <strong>Anthropic, PBC</strong> — מודל ה־AI (Claude) המפעיל את עוזר השאלון ויועץ ה־PDF. בעת
            השימוש ב־&quot;יועץ&quot; או ב&quot;כריית מסמך&quot;, תוכן השאלות, נתוני הנישום, וקטעי PDF נשלחים ל־API של
            Anthropic לעיבוד. עיבוד מתבצע בארה״ב.
          </li>
        </ul>
        <p className="text-muted-foreground text-sm">
          אנחנו לא מוכרים נתונים לצדדי ג׳, לא משתפים אותם עם מפרסמים, ולא מעבירים אותם למאגרים שיווקיים.
          העברת מידע אישי אל מחוץ לישראל מבוססת על הסכמתכם בעת השימוש בשירות, ועל מנגנוני SCC/DPF הקיימים אצל
          ספקי הענן הללו.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">לאילו מטרות אנחנו משתמשים במידע</h2>
        <ul className="list-disc ps-5 text-muted-foreground text-sm space-y-1">
          <li>חישוב החזר המס המגיע לכם והכנת טופס 135 להגשה עצמית.</li>
          <li>מתן מענה תוך כדי המילוי באמצעות יועץ ה־AI ושאלון מודרך.</li>
          <li>תפעול תקין של השירות, תמיכה במשתמשים ושיפור איכותו.</li>
          <li>עמידה בחובות חוקיות (למשל סעיפים 13 ו־17F לחוק הגנת הפרטיות).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">זכויות מידע ומחיקה (DSAR / זכות לעיין ולמחוק)</h2>
        <p className="text-muted-foreground text-sm">
          חוק הגנת הפרטיות (סעיף 13) ו־GDPR (סעיפים 15 ו־17) מקנים לכם זכות לעיין במידע ולבקש את מחיקתו. השירות
          תומך בזכויות אלה דרך נקודות הקצה הבאות (זמינות ממשתמש מאומת):
        </p>
        <ul className="list-disc ps-5 text-muted-foreground text-sm space-y-1">
          <li>
            <code className="font-mono">/api/user/export</code> — הורדת המידע השמור עליכם (מטא-נתונים של
            מסמכים וכל נתוני Firestore תחת המשתמש שלכם). שדרוג להחזרת בייטים מלאים בקובץ ZIP מתוכנן ב־Phase 0.
          </li>
          <li>
            <code className="font-mono">/api/user/delete</code> — מחיקה כוללת של פרטי המשתמש, מסמכי
            ה־Storage, ומחיקת חשבון ה־Authentication. הפעולה בלתי-הפיכה.
          </li>
        </ul>
        <p className="text-muted-foreground text-sm">
          בנוסף תוכלו לפנות אלינו במייל (להלן) לבקשת מימוש הזכויות. אנו נשיב תוך 30 יום.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">שמירה ומחיקה</h2>
        <p className="text-muted-foreground text-sm">
          המידע נשמר כל עוד החשבון פעיל. בעת בקשת מחיקה אנחנו מסירים את הנתונים מ־Firestore ומ־Cloud Storage,
          ומבטלים את חשבון ה־Authentication. ייתכן ויידרש זמן עיבוד קצר עד שהקרנות הקרות (cold replicas) של ספק
          הענן מסונכרנות.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">אבטחה</h2>
        <p className="text-muted-foreground text-sm">
          התקשורת מוצפנת ב־TLS. המידע ב־Firestore וב־Cloud Storage מוצפן במנוחה (AES-256 ניהול מפתחות
          Google-managed CMEK). הגישה לנתוני המשתמש מוגבלת על ידי כללי הרשאות של Firestore ו־Cloud Storage.
          אנחנו לא מכריזים על תקני SOC 2 / ISO 27001 ולא על אישורים אחרים שטרם הושגו.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">קבצי Cookie ו־localStorage</h2>
        <p className="text-muted-foreground text-sm">
          השירות משתמש ב־Cookies וב־IndexedDB/localStorage לצורך תחזוקת התחברות (Firebase Auth) ולשמירת
          העדפות תצוגה (כגון נושא תאורה). אין שימוש בקבצי Cookie של פרסום או אנליטיקה צד-ג׳.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">יצירת קשר</h2>
        <p className="text-muted-foreground text-sm">
          לשאלות בנוגע לפרטיות, למימוש זכויות, או להגשת תלונה: <a className="underline" href="mailto:support@taxback.il">support@taxback.il</a>.
        </p>
      </section>
    </div>
  );
}
