import type { TaxPayer, FinancialData } from "@/types";

/**
 * Builds the system prompt for the structured-nudge advisor.
 *
 * The nudge advisor is a *narrow* Claude call that reads the current draft
 * and returns 0–4 actionable nudges for the /details side rail. It is NOT
 * the chat advisor — it returns only JSON, and its suggestions map onto a
 * whitelisted set of client actions that mutate draft state on accept.
 *
 * Keep the list of action kinds in sync with:
 *   - lib/advisorNudge.ts (zod schema)
 *   - components/details/AdvisorNudgeRail.tsx (dispatcher)
 */
export function buildNudgeSystemPrompt(): string {
  return `אתה יועץ מס ישראלי שעובר על דראפט החזר מס ומציע עד 4 "nudges" מעשיים למשתמש.

מטרתך: לזהות מה חסר או מה ניתן להוסיף כדי להגדיל את ההחזר או לדייק את הדוח. אל תחזור על מידע שכבר קיים בדראפט.

חוקים:
1. החזר מערך nudges עם 0–4 פריטים בלבד. אם אין מה להציע — החזר מערך ריק.
2. כל nudge חייב כותרת קצרה (עד 40 תווים) וגוף ענייני של 1–2 משפטים. עברית תקינה, בגוף שני.
3. כל nudge יכול להתלוות ל-action אחד בלבד מתוך הרשימה המותרת (ראה schema). אם אינך בטוח — אל תחזיר action.
4. טון:
   - "warn" — כשיש חסר קריטי שחוסם החזר (למשל חשבון בנק).
   - "info" — כל השאר.
5. עדיפויות:
   א. פערים חוסמים (זהות, בנק, מעסיק עיקרי).
   ב. זכויות לא מנוצלות: עולה חדש, שחרור צבאי, ילדים בגני ילדים, נקודות תואר.
   ג. ניכויים לא מדווחים: תרומות, ביטוח חיים, פנסיה עצמאית, קרן השתלמות.
   ד. העלאת מסמכים שחסרים (טופס 106 נוסף, 867, IBKR).
6. לעולם אל תמציא מספרים. אם אתה מציע להוסיף ניכוי, השאר את amount כ-null והמשתמש ימלא.
7. אל תציע nudge אם המידע הנדרש כבר נמצא בדראפט (לדוגמה — אל תציע "הוסף מעסיק" אם יש כבר מעסיק).
8. אל תחזיר טקסט חופשי, markdown, או הערות מחוץ לסכמה.

רשימת action.kind המותרים:
- "nav_upload_doc"       — הפנה את המשתמש להעלאת מסמך. payload: { docType: "form106"|"form867"|"ibkr"|"receipt"|"pension" }
- "set_marital_status"   — payload: { value: "single"|"married"|"divorced"|"widowed" }
- "add_child"            — payload: { inDaycare: boolean } (תאריך לידה ימולא ע"י המשתמש)
- "set_aliyah_year"      — payload: { year: number } (בין 1990 לשנת המס הנוכחית)
- "set_discharge_year"   — payload: { year: number } (בין 1990 לשנת המס הנוכחית)
- "add_deduction"        — payload: { type: "donation_sec46"|"life_insurance_sec45a"|"pension_sec47"|"ltc_insurance_sec45a"|"study_fund_sec3e3"|"provident_fund_sec47"|"alimony_sec9a", providerName: string }
- "focus_field"          — payload: { path: string } (למיקוד לשדה קיים בטופס, למשל "taxpayer.bank.account")
`;
}

export function buildNudgeDraftContext(
  taxpayer: TaxPayer,
  financials: FinancialData,
  taxYear: number
): string {
  const lines: string[] = [];
  lines.push(`## דראפט נוכחי (שנת מס ${taxYear})`);

  lines.push(`- שם: ${taxpayer.firstName ?? "(חסר)"} ${taxpayer.lastName ?? ""}`.trim());
  lines.push(`- ת.ז: ${taxpayer.idNumber ?? "(חסר)"}`);
  lines.push(`- מקצוע: ${taxpayer.profession || "(חסר)"}`);
  lines.push(`- מצב משפחתי: ${taxpayer.maritalStatus ?? "(חסר)"}`);
  lines.push(`- ילדים: ${taxpayer.children?.length ?? 0}`);
  lines.push(
    `- כתובת: ${
      taxpayer.address?.city
        ? `${taxpayer.address.city}${taxpayer.address.street ? `, ${taxpayer.address.street}` : ""}`
        : "(חסר)"
    }`
  );
  lines.push(
    `- בנק להחזר: ${taxpayer.bank?.account ? "מולא" : "(חסר — חוסם החזר!)"}`
  );

  if (taxpayer.employers?.length) {
    lines.push(`- מעסיקים (${taxpayer.employers.length}):`);
    for (const e of taxpayer.employers) {
      lines.push(
        `  · ${e.name || "(ללא שם)"} — ברוטו ${e.grossSalary ?? "?"}, ניכוי מס ${e.taxWithheld ?? "?"}, חודשים ${e.monthsWorked ?? "?"}`
      );
    }
  } else {
    lines.push(`- מעסיקים: אין`);
  }

  if (taxpayer.personalDeductions?.length) {
    lines.push(`- ניכויים אישיים:`);
    for (const d of taxpayer.personalDeductions) {
      lines.push(`  · ${d.type} — ${d.amount} ₪ (${d.providerName})`);
    }
  } else {
    lines.push(`- ניכויים אישיים: אין`);
  }

  if (taxpayer.aliyahDate) lines.push(`- עליה: ${taxpayer.aliyahDate}`);
  if (taxpayer.dischargeYear) lines.push(`- שחרור צבאי: ${taxpayer.dischargeYear}`);
  if (taxpayer.disabilityPercent) lines.push(`- נכות: ${taxpayer.disabilityPercent}%`);

  const result = financials.calculationResult;
  if (result) {
    lines.push("");
    lines.push(`## תוצאת חישוב נוכחית`);
    lines.push(`- החזר נטו מוערך: ₪${result.netRefund.toLocaleString("he-IL")}`);
    lines.push(`- הכנסה חייבת: ₪${result.taxableIncome.toLocaleString("he-IL")}`);
  } else {
    lines.push("");
    lines.push(`## תוצאת חישוב: טרם חושבה`);
  }

  return lines.join("\n");
}
