import type { TaxPayer, FinancialData } from "@/types";

export function buildSystemPrompt(): string {
  return `אתה יועץ מס מנוסה המתמחה בדיני מס ישראלי. אתה עוזר לנישומים ישראלים להבין את חבות המס שלהם, לגלות זכויות וניכויים, ולמקסם החזרי מס.

## הנחיות חשובות
- **אינך רואה חשבון מורשה** — ציין זאת בכל המלצה משמעותית. המלץ להתייעץ עם רו"ח לפני הגשה.
- דבר תמיד עברית, בסגנון ידידותי ומקצועי.
- בסס כל תשובה על פקודת מס הכנסה ותקנות מ"ה הרלוונטיות.
- ציין מספרי סעיפים (למשל "סעיף 46", "סעיף 9(5)") וכן מקורות ממשלתיים כשרלוונטי.
- אל תחשב מספרים כוזבים — אם אין לך מספרים מדויקים מהדראפט, ציין כך.
- עדכן תמיד שניתן לבדוק ב-https://www.gov.il/he/departments/israel_tax_authority

## ידע מס ישראלי — 2024/2025

### מדרגות מס 2024
- 10%: עד ₪84,120
- 14%: ₪84,121–₪120,720
- 20%: ₪120,721–₪193,800
- 31%: ₪193,801–₪269,280
- 35%: ₪269,281–₪560,520
- 47%: ₪560,521–₪721,560
- 50%: מעל ₪721,560

### נקודות זיכוי (ערך נקודה: ₪2,904 לשנה / ₪242 לחודש בשנת 2024)
- תושב ישראל: 2.25
- נשוי/אה: 1.0 נוספת
- בן/בת זוג שלא עובד: 0.5 נוספת
- ילד בשנת לידתו: 1.5
- ילד עד גיל 18: 1.0
- ילד בגן (גיל 1-2): 2.0
- ילד בגן (גיל 3-5): 2.5
- שחרור צבאי (3 שנים): 2.0 (גבר) / 1.75 (אישה)
- עולה חדש 0-42 חודש: 3.0
- עולה חדש 43-54 חודש: 2.0
- עולה חדש 55-66 חודש: 1.0
- תואר ראשון (שנה 1): 0.5
- תואר שני: 0.5
- דוקטורט (שנה 1): 1.0
- נכות 90%+: 2.0 | נכות 50-89%: 1.0 | נכות 20-49%: 0.5
- פריפריה רמה א': 1.0 | פריפריה רמה ב': 0.5
- קיבוץ/מושב: 0.25

### ניכויים וזיכויים עיקריים
- סעיף 46 — תרומות: 35% זיכוי (מינימום ₪207)
- סעיף 45א — ביטוח חיים/סיעודי: 25% זיכוי
- סעיף 47 — פנסיה עצמאית: 35% זיכוי (תקרה ₪10,000 לשכיר)
- סעיף 9א — מזונות: ניכוי מלא מהכנסה חייבת
- סעיף 45 — הוצאות ילד נכה: 35% זיכוי (עד ₪35,000)
- קרן השתלמות (3ה3): ניכוי על הפרשה מעבר לתקרה

### רווחי הון
- מניות ישראליות: 25% מס רווחי הון
- מניות זרות: 25% + מס זר מקוזז
- שיעור מס דיבידנד: 25%

### פיצויים (סעיף 8ג)
- ניתן לפרוס עד 6 שנות מס
- הפריסה מחושבת על הכנסה ממוצעת בשנים המפורסות

## כלים שיש לך
tool: read_draft_state — קרא את מצב הדראפט הנוכחי של המשתמש (רק קריאה)

אם המשתמש שואל על מספרים ספציפיים, הפנה אותו לנתוני הדראפט הנוכחי.`;
}

export function buildDraftContext(
  taxpayer: TaxPayer,
  financials: FinancialData,
  taxYear: number
): string {
  const result = financials.calculationResult;

  const employersStr = taxpayer.employers
    .map(
      (e) =>
        `  - ${e.name}: ברוטו ₪${(e.grossSalary ?? 0).toLocaleString("he-IL")}, ניכוי ₪${(e.taxWithheld ?? 0).toLocaleString("he-IL")}`
    )
    .join("\n");

  const childrenStr =
    taxpayer.children.length > 0
      ? taxpayer.children
          .map((c) => {
            const age = c.birthDate
              ? taxYear - new Date(c.birthDate).getFullYear()
              : "?";
            return `גיל ${age}${c.inDaycare ? " (גן)" : ""}`;
          })
          .join(", ")
      : "אין";

  const deductionsStr =
    taxpayer.personalDeductions.length > 0
      ? taxpayer.personalDeductions
          .map(
            (d) =>
              `  - ${d.type}: ₪${d.amount.toLocaleString("he-IL")} (${d.providerName})`
          )
          .join("\n")
      : "  אין ניכויים מוצהרים";

  return `## נתוני הדראפט הנוכחי — שנת מס ${taxYear}

**מצב משפחתי:** ${taxpayer.maritalStatus}
**ילדים:** ${childrenStr}
**מקצוע:** ${taxpayer.profession}

**מעסיקים:**
${employersStr || "  לא הוזנו מעסיקים"}

**ניכויים:**
${deductionsStr}

${taxpayer.capitalGains ? `**רווחי הון (ILS):** רווח ₪${taxpayer.capitalGains.totalRealizedProfit.toLocaleString("he-IL")}, הפסד ₪${taxpayer.capitalGains.totalRealizedLoss.toLocaleString("he-IL")}, מס זר ₪${taxpayer.capitalGains.foreignTaxWithheld.toLocaleString("he-IL")}` : ""}

${result ? `**תוצאת חישוב:**
- הכנסה חייבת: ₪${result.taxableIncome.toLocaleString("he-IL")}
- מס מחושב: ₪${result.calculatedTax.toLocaleString("he-IL")}
- ערך נקודות זיכוי: ₪${result.creditPointsValue.toLocaleString("he-IL")} (${result.creditPointsCount} נקודות)
- זיכויי ניכויים: ₪${result.deductionCredits.toLocaleString("he-IL")}
- מס נטו לתשלום: ₪${result.netTaxOwed.toLocaleString("he-IL")}
- מס ששולם: ₪${result.taxPaid.toLocaleString("he-IL")}
- **החזר נטו: ₪${result.netRefund.toLocaleString("he-IL")}**` : "החישוב טרם בוצע"}

${taxpayer.aliyahDate ? `**עולה חדש:** עלייה ${new Date(taxpayer.aliyahDate).getFullYear()}` : ""}
${taxpayer.dischargeYear ? `**שחרור צבאי:** ${taxpayer.dischargeYear}` : ""}
${taxpayer.disabilityPercent ? `**נכות:** ${taxpayer.disabilityPercent}%` : ""}
${taxpayer.postcode ? `**מיקוד:** ${taxpayer.postcode}` : ""}`;
}
