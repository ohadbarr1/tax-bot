"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { LifeEvent } from "@/types";
import { Label, SuccessBox, WarnBox, TogglePair } from "./StepShell";

interface Props {
  lifeEvents: LifeEvent;
  // summary values passed in from orchestrator
  maritalStatus: "single" | "married" | "divorced" | "widowed";
  childrenCount: number;
  hasDegree: boolean;
  degreesCount: number;
  investsCapital: boolean;
  portfolioLocation: "bank" | "local_broker" | "foreign_broker";
  selectedBroker: string;
  employersCount: number;
  hasOverlap: boolean;
  deductionsCount: number;
  onUpdateLifeEvent: (patch: Partial<LifeEvent>) => void;
}

export default function Step6LifeEvents({
  lifeEvents,
  maritalStatus,
  childrenCount,
  hasDegree,
  degreesCount,
  investsCapital,
  portfolioLocation,
  selectedBroker,
  employersCount,
  hasOverlap,
  deductionsCount,
  onUpdateLifeEvent,
}: Props) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-[#0F172A]">אירועי חיים</h2>
        <p className="mt-1 text-sm text-slate-500">
          שינויים תעסוקתיים עשויים להשפיע באופן משמעותי על חבות המס.
        </p>
      </div>

      <div className="space-y-2">
        <Label>האם עזבת מקום עבודה במהלך שנת המס?</Label>
        <TogglePair
          value={lifeEvents.changedJobs}
          onChange={(v) => onUpdateLifeEvent({ changedJobs: v })}
        />
      </div>

      <AnimatePresence>
        {lifeEvents.changedJobs && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-4"
          >
            <div className="space-y-2">
              <Label>האם משכת כספי פיצויים?</Label>
              <TogglePair
                value={lifeEvents.pulledSeverancePay}
                onChange={(v) =>
                  onUpdateLifeEvent({ pulledSeverancePay: v })
                }
              />
            </div>

            <AnimatePresence>
              {lifeEvents.pulledSeverancePay && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-3"
                >
                  <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 space-y-2">
                    <p className="text-sm font-semibold text-rose-700">
                      פיצויים חייבים במס — פריסת מס (סעיף 8ג)
                    </p>
                    <p className="text-xs text-rose-600 leading-relaxed">
                      משיכת פיצויים החייבים במס עלולה לדחוף אותך למדרגת מס
                      גבוהה (47%) באותה שנה. החוק מאפשר "פריסת מס" — פריסת
                      ההכנסה על פני עד 6 שנות מס (לאחור או קדימה) לצמצום
                      המדרגה השולית. המערכת תכין עבורך נספח פריסה מפורט.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>האם קיבלת טופס 161 מהמעסיק?</Label>
                    <TogglePair
                      value={lifeEvents.hasForm161}
                      onChange={(v) =>
                        onUpdateLifeEvent({ hasForm161: v })
                      }
                    />
                    {!lifeEvents.hasForm161 && (
                      <WarnBox>
                        טופס 161 נדרש לעיבוד הפיצויים. אנחנו נוסיף אותו לרשימת
                        המסמכים הדרושים.
                      </WarnBox>
                    )}
                    {lifeEvents.hasForm161 && (
                      <SuccessBox>
                        מצוין! העלה את טופס 161 בשלב הבא כדי שנוכל לחשב את
                        אסטרטגיית הפריסה האופטימלית.
                      </SuccessBox>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary box */}
      <div className="rounded-xl border border-border bg-slate-50 p-4 space-y-2">
        <p className="text-xs font-semibold text-[#0F172A]">סיכום השאלון</p>
        {[
          { label: "מצב משפחתי", value: maritalStatus === "married" ? "נשוי/אה" : maritalStatus === "divorced" ? "גרוש/ה" : "רווק/ה" },
          { label: "ילדים", value: `${childrenCount}` },
          { label: "תארים", value: hasDegree ? `${degreesCount}` : "ללא" },
          { label: "ברוקר", value: investsCapital && portfolioLocation === "foreign_broker" ? selectedBroker || "זר" : "לא רלוונטי" },
          { label: "מעסיקים", value: `${employersCount}${hasOverlap ? " (חפיפה!)" : ""}` },
          { label: "ניכויים", value: `${deductionsCount} סעיפים` },
          { label: "פיצויים", value: lifeEvents.pulledSeverancePay ? "כן — נדרשת פריסה" : "לא" },
        ].map((row) => (
          <div key={row.label} className="flex justify-between text-xs">
            <span className="text-slate-500">{row.label}</span>
            <span className="font-medium text-[#0F172A]">{row.value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
