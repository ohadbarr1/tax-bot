import type { Metadata } from "next";
export const metadata: Metadata = { title: "תנאי שימוש" };
export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-6 leading-relaxed">
      <h1 className="text-3xl font-bold text-foreground">תנאי שימוש</h1>
      <p className="text-muted-foreground text-sm">עודכן לאחרונה: 29 באפריל 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. כללי</h2>
        <p className="text-muted-foreground text-sm">
          תנאי שימוש אלה מסדירים את השימוש בשירות &quot;כסף חזרה&quot; (להלן: <strong>השירות</strong>). השירות
          נמצא כיום בגרסת בטא וזמין ללא תשלום. עצם השימוש בשירות מהווה הסכמה לתנאים אלה. אם אינכם מסכימים —
          אנא הימנעו מלהשתמש בשירות.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. מהות השירות</h2>
        <p className="text-muted-foreground text-sm">
          השירות מסייע לשכירים בישראל לבדוק זכאות להחזר מס ולמלא טופס 135. אנחנו מספקים מנוע חישוב, OCR
          לחילוץ נתונים מטפסים, ועוזר AI מבוסס מודל שפה. אתם — ולא אנחנו — מגישים את הטופס באתר רשות המיסים
          (taxes.gov.il) ובאחריותכם המלאה. השירות אינו מבצע הגשה אוטומטית לרשות המיסים.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">3. לא ייעוץ מס מקצועי</h2>
        <p className="text-muted-foreground text-sm">
          השירות הוא כלי עזר טכנולוגי בלבד ואינו מהווה ייעוץ מס מקצועי, ייעוץ משפטי, או ייצוג בפני רשות
          המיסים כמשמעם בחוק הסדרת העיסוק בייצוג על ידי יועצי מס, התשס״ה-2005. במקרי ספק או במצבים מורכבים
          (למשל פיצויי פיטורין גדולים, מקורות הכנסה זרים, נכויות, או רב-שנתי) מומלץ להתייעץ עם רואה חשבון
          או יועץ מס מוסמך לפני ההגשה.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">4. תמחור — תקופת בטא</h2>
        <p className="text-muted-foreground text-sm">
          בתקופת הבטא השירות זמין חינם — ללא דמי הרשמה, ללא עמלת הצלחה, וללא התחייבות. אנחנו לא גובים אחוז
          מההחזר, ואין במערכת תשתית גבייה או חיוב כלשהי. אם בעתיד נעבור לתוכנית בתשלום, נודיע על כך מראש,
          וכל מחיר יוצג כשהוא כולל מע״מ בהתאם לחוק הגנת הצרכן, התשמ״א-1981.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">5. הקניין הרוחני שלכם</h2>
        <p className="text-muted-foreground text-sm">
          אתם בעלי הקניין הרוחני בכל הנתונים והמסמכים שאתם מזינים או מעלים לשירות, וכן בטפסים שמופקים עבורכם
          (לרבות טופס 135 שהמערכת מייצרת על בסיס הנתונים שלכם). אנחנו מקבלים רישיון מוגבל לעבד את הנתונים
          אך ורק לצורך אספקת השירות, לפי תנאי מדיניות הפרטיות.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">6. אחריות המשתמש על נכונות הנתונים</h2>
        <p className="text-muted-foreground text-sm">
          אתם אחראים לאמיתות, נכונות ושלמות הנתונים שאתם מזינים. הגשת דוח עם נתונים שגויים לרשות המיסים היא
          באחריותכם בלבד. השירות אינו אחראי לתוצאות הגשה הנובעות מנתונים שגויים, ממסמכים שלא הועלו, או
          מהחלטות שיפוטיות של רשות המיסים בעניינכם.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">7. שירות בבטא — שינויים והפסקה</h2>
        <p className="text-muted-foreground text-sm">
          זוהי גרסת בטא. השירות עשוי להשתנות, להתעדכן או להופסק זמנית בכל עת ללא הודעה מוקדמת, לרבות
          סגירת חשבונות בטא, איפוס נתונים לצורך תחזוקה, או שינוי מהותי בפונקציונליות. אנחנו נשתדל לתת התראה
          סבירה לפני שינויים מהותיים, אך אין על כך התחייבות חוזית בתקופת הבטא.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">8. השירות &quot;כפי שהוא&quot; (AS-IS) והגבלת אחריות</h2>
        <p className="text-muted-foreground text-sm">
          השירות מסופק &quot;כפי שהוא&quot; (AS-IS) ו&quot;כפי שזמין&quot; (AS-AVAILABLE) ללא כל הצהרה
          או אחריות מפורשת או משתמעת — לרבות התאמתו למטרה מסוימת, אי-הפרת זכויות, או רציפות פעולה. השירות אינו
          ערב לסכום החזר כלשהו, ללוחות זמנים של רשות המיסים, או לקבלה של בקשת ההחזר. החברה אינה אחראית
          לשגיאות הנובעות מנתונים שגויים שהוזנו על ידי המשתמש; כל חישוב הוא אינדיקטיבי בלבד.
        </p>
        <p className="text-muted-foreground text-sm">
          תקרת אחריות: בכל מקרה, סך כל אחריות החברה כלפי משתמש מסוים מוגבל לסכום הדמים ששילם המשתמש לחברה
          ב־12 החודשים שקדמו לאירוע (נכון לתקופת הבטא — סכום זה הוא ₪0, מאחר שהשירות חינם). החברה לא תישא
          באחריות לנזקים עקיפים, תוצאתיים, אובדן רווחים או אובדן נתונים.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">9. נגישות</h2>
        <p className="text-muted-foreground text-sm">
          השירות שואף לעמוד בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג-2013.
          הצהרת נגישות מלאה תפורסם בדף <code className="font-mono">/accessibility</code> במהלך פיתוח Phase 3.
          לבעיות נגישות אנא פנו ל־<a className="underline" href="mailto:support@taxback.il">support@taxback.il</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">10. דין וסמכות שיפוט</h2>
        <p className="text-muted-foreground text-sm">
          על תנאים אלה ועל היחסים בין הצדדים יחול הדין הישראלי בלבד. סמכות השיפוט הבלעדית בכל מחלוקת
          הנובעת מתנאים אלה או מהשימוש בשירות נתונה לבתי המשפט המוסמכים בעיר תל אביב-יפו.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">11. יצירת קשר</h2>
        <p className="text-muted-foreground text-sm">
          לשאלות, תלונות, או בקשות הקשורות לתנאים אלה: <a className="underline" href="mailto:support@taxback.il">support@taxback.il</a>.
        </p>
      </section>
    </div>
  );
}
