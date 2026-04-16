"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Child, DisabilityType } from "@/types";
import { Label, InfoBox, SuccessBox, TogglePair } from "./StepShell";

interface Props {
  gender: "male" | "female" | undefined;
  servedInArmy: boolean;
  dischargeYear: number | undefined;
  isOleh: boolean;
  aliyahDate: string;
  postcode: string;
  kibbutzMember: boolean;
  hasDisability: boolean;
  disabilityType: DisabilityType | undefined;
  disabilityPercent: number;
  children: Child[];
  onGenderChange: (v: "male" | "female") => void;
  onServedInArmyChange: (v: boolean) => void;
  onDischargeYearChange: (v: number | undefined) => void;
  onIsOlehChange: (v: boolean) => void;
  onAliyahDateChange: (v: string) => void;
  onPostcodeChange: (v: string) => void;
  onKibbutzMemberChange: (v: boolean) => void;
  onHasDisabilityChange: (v: boolean) => void;
  onDisabilityTypeChange: (v: DisabilityType) => void;
  onDisabilityPercentChange: (v: number) => void;
  onChildrenChange: (v: Child[]) => void;
}

/** Return age in whole years as of the current tax year (2025). */
function childAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const birthYear = new Date(birthDate).getFullYear();
  if (isNaN(birthYear)) return null;
  return 2025 - birthYear;
}

export default function Step7CreditPoints({
  gender,
  servedInArmy,
  dischargeYear,
  isOleh,
  aliyahDate,
  postcode,
  kibbutzMember,
  hasDisability,
  disabilityType,
  disabilityPercent,
  children,
  onGenderChange,
  onServedInArmyChange,
  onDischargeYearChange,
  onIsOlehChange,
  onAliyahDateChange,
  onPostcodeChange,
  onKibbutzMemberChange,
  onHasDisabilityChange,
  onDisabilityTypeChange,
  onDisabilityPercentChange,
  onChildrenChange,
}: Props) {
  const daycareChildren = children
    .map((c, idx) => ({ child: c, idx, age: childAge(c.birthDate) }))
    .filter((entry) => entry.age !== null && entry.age >= 1 && entry.age <= 5);

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-[#0F172A] dark:text-white">נקודות זיכוי</h2>
        <p className="mt-1 text-sm text-slate-500">
          פרטים נוספים שמשפיעים על נקודות הזיכוי שלך
        </p>
      </div>

      {/* ── Gender ── */}
      <div>
        <Label>מגדר</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "male" as const, l: "זכר" },
              { v: "female" as const, l: "נקבה" },
            ]
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => onGenderChange(opt.v)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                gender === opt.v
                  ? "bg-[#0F172A] text-white border-[#0F172A]"
                  : "bg-background dark:bg-secondary text-foreground border-border hover:border-muted-foreground/40"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Military service ── */}
      <div className="space-y-2">
        <Label>האם שירתת בצה&quot;ל?</Label>
        <TogglePair value={servedInArmy} onChange={onServedInArmyChange} />
        <AnimatePresence>
          {servedInArmy && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-2"
            >
              <Label>שנת שחרור</Label>
              <input
                type="number"
                min={1980}
                max={2026}
                placeholder="לדוגמה: 2020"
                value={dischargeYear ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onDischargeYearChange(val ? parseInt(val, 10) : undefined);
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
              />
              {dischargeYear && 2025 - dischargeYear <= 3 && 2025 - dischargeYear >= 0 && (
                <SuccessBox>
                  זכאות לנקודות זיכוי בגין שחרור משירות (
                  {gender === "female" ? "1.75" : "2.0"} נקודות).
                </SuccessBox>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Aliyah ── */}
      <div className="space-y-2">
        <Label>האם עלית לארץ?</Label>
        <TogglePair value={isOleh} onChange={onIsOlehChange} />
        <AnimatePresence>
          {isOleh && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-2"
            >
              <Label>תאריך עלייה</Label>
              <input
                type="date"
                value={aliyahDate}
                onChange={(e) => onAliyahDateChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
              />
              <InfoBox>
                עולה חדש זכאי לנקודות זיכוי מדורגות: 3 נקודות בשנה הראשונה, 2 בשנייה, 1 בשלישית.
              </InfoBox>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Postcode ── */}
      <div>
        <Label>מיקוד</Label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="לדוגמה: 1234567"
          maxLength={7}
          value={postcode}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "");
            onPostcodeChange(val);
          }}
          className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
        />
        <p className="text-xs text-slate-400 mt-1">
          המיקוד משמש לבדיקת זכאות לנקודות זיכוי בגין יישוב פריפריה.
        </p>
      </div>

      {/* ── Kibbutz ── */}
      <div className="space-y-2">
        <Label>האם את/ה חבר/ת קיבוץ/מושב?</Label>
        <TogglePair value={kibbutzMember} onChange={onKibbutzMemberChange} />
        {kibbutzMember && (
          <SuccessBox>חברות בקיבוץ/מושב מזכה ב-0.25 נקודות זיכוי.</SuccessBox>
        )}
      </div>

      {/* ── Disability ── */}
      <div className="space-y-2">
        <Label>האם יש לך נכות מוכרת?</Label>
        <TogglePair value={hasDisability} onChange={onHasDisabilityChange} />
        <AnimatePresence>
          {hasDisability && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-3"
            >
              <div>
                <Label>סוג נכות</Label>
                <select
                  value={disabilityType ?? ""}
                  onChange={(e) => onDisabilityTypeChange(e.target.value as DisabilityType)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                >
                  <option value="" disabled>
                    בחר סוג נכות
                  </option>
                  <option value="work_injury">נכות עבודה</option>
                  <option value="general">נכות כללית</option>
                  <option value="ita_recognized">מוכרת ע&quot;י רשות המסים</option>
                </select>
              </div>
              <div>
                <Label>אחוז נכות</Label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0-100"
                  value={disabilityPercent || ""}
                  onChange={(e) => onDisabilityPercentChange(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-background dark:bg-secondary focus:outline-none focus:ring-2 focus:ring-[#0F172A]/20 focus:border-[#0F172A]"
                />
              </div>
              {disabilityPercent >= 100 && (
                <SuccessBox>נכות 100% מזכה ב-2 נקודות זיכוי.</SuccessBox>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Children daycare ── */}
      {daycareChildren.length > 0 && (
        <div className="space-y-2">
          <Label>גן/מעון מוכר</Label>
          <InfoBox>
            ילדים בגילאי 1-5 הנמצאים במעון/גן מוכר מזכים ב-2.0/2.5 נקודות זיכוי (במקום 1.0).
          </InfoBox>
          <div className="space-y-2">
            {daycareChildren.map(({ child, idx }) => (
              <div
                key={child.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border bg-background dark:bg-secondary"
              >
                <span className="text-sm font-medium text-foreground">
                  ילד {idx + 1} (גיל {childAge(child.birthDate)}) &mdash; בגן/מעון מוכר?
                </span>
                <div className="flex gap-2 shrink-0">
                  {[
                    { v: true, l: "כן" },
                    { v: false, l: "לא" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      onClick={() =>
                        onChildrenChange(
                          children.map((c) =>
                            c.id === child.id ? { ...c, inDaycare: opt.v } : c
                          )
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        child.inDaycare === opt.v
                          ? "bg-brand-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
