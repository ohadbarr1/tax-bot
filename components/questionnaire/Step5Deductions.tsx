"use client";

import { Trash2 } from "lucide-react";
import type { PersonalDeduction } from "@/types";
import { Label, SuccessBox, WarnBox } from "./StepShell";

interface Props {
  deductions: PersonalDeduction[];
  donationCredit: number;
  lifeInsCredit: number;
  onAddDeduction: (type: PersonalDeduction["type"]) => void;
  onRemoveDeduction: (id: string) => void;
  onUpdateDeduction: (id: string, patch: Partial<PersonalDeduction>) => void;
}

export default function Step5Deductions({
  deductions,
  donationCredit,
  lifeInsCredit,
  onAddDeduction,
  onRemoveDeduction,
  onUpdateDeduction,
}: Props) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-[#0F172A]">ניכויים וזיכויים אישיים</h2>
        <p className="mt-1 text-sm text-slate-500">
          תרומות וביטוח חיים מזכים בזיכוי מס ישיר — לא ניכוי בלבד.
        </p>
      </div>

      {/* Quick-add buttons */}
      <div>
        <Label>הוסף ניכוי</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { type: "donation_sec46"        as const, label: "תרומה (סעיף 46)",       rate: "35%" },
            { type: "life_insurance_sec45a" as const, label: "ביטוח חיים (סעיף 45א)", rate: "25%" },
            { type: "pension_sec47"         as const, label: "פנסיה עצמאית (סעיף 47)",rate: "35%" },
          ].map((opt) => (
            <button
              key={opt.type}
              onClick={() => onAddDeduction(opt.type)}
              className="flex flex-col items-start px-4 py-3 rounded-xl border border-dashed border-border hover:border-[#0F172A]/40 hover:bg-slate-50 text-start transition-all"
            >
              <span className="text-sm font-medium text-[#0F172A]">
                + {opt.label}
              </span>
              <span className="text-xs text-emerald-600 font-semibold">
                זיכוי {opt.rate}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Deduction rows */}
      {deductions.length > 0 && (
        <div className="space-y-3">
          {deductions.map((ded) => {
            const rate =
              ded.type === "life_insurance_sec45a" ? 0.25 : 0.35;
            const credit = Math.round(ded.amount * rate);
            const typeLabel =
              ded.type === "donation_sec46"
                ? "תרומה — סעיף 46"
                : ded.type === "life_insurance_sec45a"
                ? "ביטוח חיים — סעיף 45א"
                : "פנסיה עצמאית — סעיף 47";
            return (
              <div
                key={ded.id}
                className="border border-border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                    {typeLabel}
                  </span>
                  <button
                    onClick={() => onRemoveDeduction(ded.id)}
                    className="text-slate-300 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="שם הגוף / הספק"
                  value={ded.providerName}
                  onChange={(e) =>
                    onUpdateDeduction(ded.id, { providerName: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                />
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₪</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={ded.amount || ""}
                      onChange={(e) =>
                        onUpdateDeduction(ded.id, {
                          amount: Number(e.target.value),
                        })
                      }
                      className="w-full ps-7 pe-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                    />
                  </div>
                  {ded.amount > 0 && (
                    <div className="flex-shrink-0 text-end">
                      <p className="text-xs text-slate-500">זיכוי</p>
                      <p className="text-sm font-bold text-emerald-600">
                        {credit.toLocaleString("he-IL")} ₪
                      </p>
                    </div>
                  )}
                </div>

                {/* Threshold / cap warnings */}
                {ded.type === "donation_sec46" && ded.amount > 0 && ded.amount < 207 && (
                  <WarnBox>
                    סכום התרומה נמוך מהסף המינימלי (207 ₪) — לא יחושב זיכוי עד שהסכום יעלה על הסף.
                  </WarnBox>
                )}
                {ded.type === "pension_sec47" && ded.amount > 10_000 && (
                  <WarnBox>
                    הפקדה עולה על תקרת 10,000 ₪ — הזיכוי יחושב רק על 10,000 ₪. הסכום מעל התקרה לא יזכה בזיכוי מס.
                  </WarnBox>
                )}
              </div>
            );
          })}

          {/* Running total */}
          {(donationCredit + lifeInsCredit) > 0 && (
            <SuccessBox>
              סך זיכויי מס משוערים:{" "}
              {(donationCredit + lifeInsCredit).toLocaleString("he-IL")} ₪
            </SuccessBox>
          )}
        </div>
      )}

      {deductions.length === 0 && (
        <div className="text-center py-6 rounded-xl border border-dashed border-border text-xs text-slate-400">
          לא הוזנו ניכויים — לחץ על אחד הכפתורים למעלה כדי להוסיף
        </div>
      )}
    </>
  );
}
