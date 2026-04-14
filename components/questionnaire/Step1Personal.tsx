"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import type { Child } from "@/types";
import { Label, InfoBox, SuccessBox, TogglePair } from "./StepShell";

interface Props {
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  spouseIncome: boolean;
  paysAlimony: boolean;
  children: Child[];
  onMaritalStatusChange: (v: "single" | "married" | "divorced" | "widowed") => void;
  onSpouseIncomeChange: (v: boolean) => void;
  onPaysAlimonyChange: (v: boolean) => void;
  onChildrenChange: (v: Child[]) => void;
}

export default function Step1Personal({
  maritalStatus,
  spouseIncome,
  paysAlimony,
  children,
  onMaritalStatusChange,
  onSpouseIncomeChange,
  onPaysAlimonyChange,
  onChildrenChange,
}: Props) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-[#0F172A]">מצב אישי ומשפחתי</h2>
        <p className="mt-1 text-sm text-slate-500">
          נתונים אלה משפיעים ישירות על נקודות הזיכוי שלך.
        </p>
      </div>

      <div>
        <Label>מצב משפחתי</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              { v: "single",  l: "רווק/ה" },
              { v: "married", l: "נשוי/אה" },
              { v: "divorced",l: "גרוש/ה" },
              { v: "widowed", l: "אלמן/ה" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => onMaritalStatusChange(opt.v)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                maritalStatus === opt.v
                  ? "bg-[#0F172A] text-white border-[#0F172A]"
                  : "bg-background dark:bg-secondary text-foreground border-border hover:border-muted-foreground/40"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {maritalStatus === "married" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-2"
          >
            <Label>האם לבן/בת הזוג יש הכנסה?</Label>
            <TogglePair value={spouseIncome} onChange={onSpouseIncomeChange} />
            {!spouseIncome && (
              <InfoBox>ייתכן שתהיה זכאי לנקודת זיכוי בגין בן/בת זוג שאינו עובד.</InfoBox>
            )}
          </motion.div>
        )}
        {maritalStatus === "divorced" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-2"
          >
            <Label>האם אתה משלם מזונות?</Label>
            <TogglePair value={paysAlimony} onChange={onPaysAlimonyChange} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Children */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>ילדים</Label>
          <button
            onClick={() =>
              onChildrenChange([
                ...children,
                { id: `c-${Date.now()}`, birthDate: "" },
              ])
            }
            className="flex items-center gap-1 text-xs text-[#0F172A] font-medium hover:text-emerald-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            הוסף ילד
          </button>
        </div>
        {children.length === 0 ? (
          <div className="text-center py-5 rounded-xl border border-dashed border-border text-xs text-slate-400">
            לא הוספו ילדים
          </div>
        ) : (
          <div className="space-y-2">
            {children.map((child, idx) => {
              const yr = child.birthDate
                ? new Date(child.birthDate).getFullYear()
                : null;
              return (
                <div key={child.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="date"
                        value={child.birthDate}
                        onChange={(e) =>
                          onChildrenChange(
                            children.map((c) =>
                              c.id === child.id
                                ? { ...c, birthDate: e.target.value }
                                : c
                            )
                          )
                        }
                        className="w-full ps-3 pe-16 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                        ילד {idx + 1}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        onChildrenChange(children.filter((c) => c.id !== child.id))
                      }
                      className="text-slate-300 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {(yr === 2024 || yr === 2025) && (
                    <SuccessBox>
                      ילד שנולד ב-{yr} מזכה בנקודת זיכוי מלאה לאותה שנה (ערך:{" "}
                      {yr === 2025 ? "3,000 ₪" : "2,904 ₪"}).
                    </SuccessBox>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
