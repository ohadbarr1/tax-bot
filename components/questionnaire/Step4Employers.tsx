"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Employer } from "@/types";
import { Label, InfoBox, SuccessBox, WarnBox, HEBREW_MONTHS, computeMonthsWorked } from "./StepShell";

interface Props {
  employers: Employer[];
  hasOverlap: boolean;
  onAddEmployer: () => void;
  onRemoveEmployer: (id: string) => void;
  onUpdateEmployer: (id: string, patch: Partial<Employer>) => void;
}

export default function Step4Employers({
  employers,
  hasOverlap,
  onAddEmployer,
  onRemoveEmployer,
  onUpdateEmployer,
}: Props) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-[#0F172A]">מפת מעסיקים</h2>
        <p className="mt-1 text-sm text-slate-500">
          חפיפת מעסיקים ללא תיאום מס עלולה לגרום לגביית יתר משמעותית.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>מעסיקים בשנת המס</Label>
          <button
            onClick={onAddEmployer}
            className="flex items-center gap-1 text-xs text-[#0F172A] font-medium hover:text-emerald-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            הוסף מעסיק
          </button>
        </div>

        {employers.map((emp, idx) => (
          <div
            key={emp.id}
            className={`border rounded-xl p-4 space-y-3 ${
              emp.isMainEmployer
                ? "border-[#0F172A]/30 bg-slate-50/60"
                : "border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">
                  מעסיק {idx + 1}
                </span>
                {emp.isMainEmployer && (
                  <span className="bg-[#0F172A] text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                    ראשי
                  </span>
                )}
              </div>
              {!emp.isMainEmployer && (
                <button
                  onClick={() => onRemoveEmployer(emp.id)}
                  className="text-slate-300 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <input
              type="text"
              placeholder="שם המעסיק"
              value={emp.name}
              onChange={(e) =>
                onUpdateEmployer(emp.id, { name: e.target.value })
              }
              className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
            />

            {/* Month range pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">מתחילת חודש</label>
                <select
                  value={emp.startMonth ?? 1}
                  onChange={(e) => {
                    const start = Number(e.target.value);
                    const end = emp.endMonth ?? 12;
                    onUpdateEmployer(emp.id, {
                      startMonth: start,
                      monthsWorked: computeMonthsWorked(start, end),
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                >
                  {HEBREW_MONTHS.map((m) => (
                    <option key={m.v} value={m.v}>{m.l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">עד סוף חודש</label>
                <select
                  value={emp.endMonth ?? 12}
                  onChange={(e) => {
                    const end = Number(e.target.value);
                    const start = emp.startMonth ?? 1;
                    onUpdateEmployer(emp.id, {
                      endMonth: end,
                      monthsWorked: computeMonthsWorked(start, end),
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                >
                  {HEBREW_MONTHS.map((m) => (
                    <option key={m.v} value={m.v}>{m.l}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 -mt-1">
              {emp.monthsWorked} חודשי עבודה מחושבים
            </p>

            {/* Form 106 financial data */}
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-medium text-slate-500">נתונים מטופס 106 (אם ידועים)</p>
              <InfoBox>ניתן למלא אחרי קבלת טופס 106 ממעסיקך</InfoBox>
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">₪</span>
                <input
                  type="number"
                  min={0}
                  placeholder="ברוטו שנתי — שדה 158"
                  value={emp.grossSalary ?? ""}
                  onChange={(e) =>
                    onUpdateEmployer(emp.id, {
                      grossSalary: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full ps-7 pe-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                />
              </div>
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">₪</span>
                <input
                  type="number"
                  min={0}
                  placeholder="מס הכנסה שנוכה — שדה 042"
                  value={emp.taxWithheld ?? ""}
                  onChange={(e) =>
                    onUpdateEmployer(emp.id, {
                      taxWithheld: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full ps-7 pe-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                />
              </div>
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">₪</span>
                <input
                  type="number"
                  min={0}
                  placeholder="ניכוי פנסיה — שדה 045"
                  value={emp.pensionDeduction ?? ""}
                  onChange={(e) =>
                    onUpdateEmployer(emp.id, {
                      pensionDeduction: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full ps-7 pe-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Overlap warning */}
      {hasOverlap && (
        <WarnBox>
          זוהתה חפיפה בין מעסיקים — עבדת אצל יותר ממעסיק אחד באותם חודשים.
          המעסיק המשני כנראה ניכה מס בשיעור מרבי (47%) — ייתכן החזר משמעותי.
        </WarnBox>
      )}
      {!hasOverlap && employers.length > 0 && (
        <SuccessBox>
          לא זוהתה חפיפה בין מעסיקים — יש לאמת שנקודות הזיכוי יושמו נכון.
        </SuccessBox>
      )}
    </>
  );
}
