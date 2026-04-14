"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import type { Degree } from "@/types";
import { Label, InfoBox, TogglePair } from "./StepShell";

interface Props {
  hasDegree: boolean;
  degrees: Degree[];
  onHasDegreeChange: (v: boolean) => void;
  onDegreesChange: (v: Degree[]) => void;
}

function degreeNote(d: Degree): string | null {
  if (d.type === "MA" && d.completionYear >= new Date().getFullYear()) {
    return `זכאי לחצי נקודת זיכוי לשנה, החל מ-${d.completionYear + 1} (שנה לאחר סיום התואר).`;
  }
  if (d.type === "BA") return "תואר ראשון מזכה בנקודת זיכוי אחת לכל שנת לימוד.";
  if (d.type === "PHD") return "תואר שלישי מזכה בנקודת זיכוי נוספת.";
  return null;
}

export default function Step2Education({
  hasDegree,
  degrees,
  onHasDegreeChange,
  onDegreesChange,
}: Props) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-[#0F172A]">השכלה ופיתוח מקצועי</h2>
        <p className="mt-1 text-sm text-slate-500">
          תואר אקדמי עשוי להעניק נקודות זיכוי נוספות.
        </p>
      </div>

      <div className="space-y-2">
        <Label>האם סיימת תואר אקדמי או תעודה מקצועית מוכרת?</Label>
        <TogglePair value={hasDegree} onChange={onHasDegreeChange} />
      </div>

      <AnimatePresence>
        {hasDegree && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-4"
          >
            <div className="flex items-center justify-between">
              <Label>פרטי תואר</Label>
              <button
                onClick={() =>
                  onDegreesChange([
                    ...degrees,
                    {
                      type: "BA",
                      institution: "",
                      completionYear: new Date().getFullYear(),
                    },
                  ])
                }
                className="flex items-center gap-1 text-xs text-[#0F172A] font-medium hover:text-emerald-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף תואר
              </button>
            </div>

            {degrees.map((deg, idx) => {
              const note = degreeNote(deg);
              return (
                <div
                  key={idx}
                  className="border border-border rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">
                      תואר {idx + 1}
                    </span>
                    {degrees.length > 1 && (
                      <button
                        onClick={() =>
                          onDegreesChange(degrees.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { v: "BA",  l: "BA" },
                        { v: "MA",  l: "MA" },
                        { v: "PHD", l: "PhD" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() =>
                          onDegreesChange(
                            degrees.map((d, i) =>
                              i === idx ? { ...d, type: opt.v } : d
                            )
                          )
                        }
                        className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                          deg.type === opt.v
                            ? "bg-[#0F172A] text-white border-[#0F172A]"
                            : "bg-background dark:bg-secondary text-foreground border-border"
                        }`}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="שם המוסד האקדמי"
                    value={deg.institution}
                    onChange={(e) =>
                      onDegreesChange(
                        degrees.map((d, i) =>
                          i === idx ? { ...d, institution: e.target.value } : d
                        )
                      )
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                  />
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      שנת סיום דרישות אקדמיות (לא טקס הענקת תואר)
                    </label>
                    <input
                      type="number"
                      min={2000}
                      max={2030}
                      value={deg.completionYear}
                      onChange={(e) =>
                        onDegreesChange(
                          degrees.map((d, i) =>
                            i === idx
                              ? { ...d, completionYear: Number(e.target.value) }
                              : d
                          )
                        )
                      }
                      className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                    />
                  </div>
                  {note && <InfoBox>{note}</InfoBox>}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
