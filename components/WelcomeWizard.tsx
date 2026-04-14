"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/appContext";
import type { FilingType, FilingGoal } from "@/types";
import { Briefcase, UserCheck, Layers, Receipt, FileText, Eye, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const FILING_TYPES: { value: FilingType; label: string; sublabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "salaried", label: "שכיר/ה", sublabel: "הכנסה ממשכורת בלבד", icon: Briefcase },
  { value: "self_employed", label: "עצמאי/ת", sublabel: "עוסק פטור / מורשה", icon: UserCheck },
  { value: "mixed", label: "משולב", sublabel: "שכיר + עצמאי", icon: Layers },
];

const FILING_GOALS: { value: FilingGoal; label: string; sublabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "refund", label: "בקשת החזר מס", sublabel: "טופס 135 — הדרך הפשוטה", icon: Receipt },
  { value: "full_return", label: "דוח שנתי מלא", sublabel: "טופס 1301 — לכל ההכנסות", icon: FileText },
  { value: "review", label: "סקירה בלבד", sublabel: "בדוק זכאות ללא הגשה", icon: Eye },
];

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

export function WelcomeWizard() {
  const router = useRouter();
  const { createDraft } = useApp();

  const [step, setStep] = useState(1);
  const [taxYear, setTaxYear] = useState(2024);
  const [filingType, setFilingType] = useState<FilingType>("salaried");
  const [filingGoal, setFilingGoal] = useState<FilingGoal>("refund");

  const handleFinish = () => {
    createDraft(taxYear, filingType, filingGoal);
    router.push("/questionnaire");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map((s) => (
            <div key={s} className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              s <= step ? "bg-primary w-12" : "bg-muted w-6"
            )} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="text-2xl font-bold text-foreground mb-2 text-center">בחרו שנת מס</h1>
              <p className="text-muted-foreground text-center mb-6 text-sm">עבור איזו שנה תרצו להגיש?</p>
              <div className="grid grid-cols-3 gap-3">
                {YEARS.map((y) => (
                  <button key={y} onClick={() => setTaxYear(y)} className={cn(
                    "py-4 rounded-2xl border-2 text-lg font-bold transition-all",
                    taxYear === y
                      ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-card-hover)]"
                      : "bg-card text-foreground border-border hover:border-primary/40"
                  )}>{y}</button>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="mt-6 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity">
                המשך ←
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="text-2xl font-bold text-foreground mb-2 text-center">סוג ההכנסה</h1>
              <p className="text-muted-foreground text-center mb-6 text-sm">מה מתאר את מצבכם בשנת {taxYear}?</p>
              <div className="space-y-3">
                {FILING_TYPES.map(({ value, label, sublabel, icon: Icon }) => (
                  <button key={value} onClick={() => setFilingType(value)} className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-start",
                    filingType === value
                      ? "bg-primary/5 border-primary"
                      : "bg-card border-border hover:border-primary/30"
                  )}>
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      filingType === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{sublabel}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl border border-border">
                  <ArrowLeft className="w-4 h-4" /> חזרה
                </button>
                <button onClick={() => setStep(3)} className="flex-1 bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity">
                  המשך ←
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="text-2xl font-bold text-foreground mb-2 text-center">מה המטרה?</h1>
              <p className="text-muted-foreground text-center mb-6 text-sm">נבנה את תהליך ההגשה בהתאם</p>
              <div className="space-y-3">
                {FILING_GOALS.map(({ value, label, sublabel, icon: Icon }) => (
                  <button key={value} onClick={() => setFilingGoal(value)} className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-start",
                    filingGoal === value
                      ? "bg-primary/5 border-primary"
                      : "bg-card border-border hover:border-primary/30"
                  )}>
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      filingGoal === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{sublabel}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl border border-border">
                  <ArrowLeft className="w-4 h-4" /> חזרה
                </button>
                <button onClick={handleFinish} className="flex-1 bg-amber-500 text-stone-950 font-bold py-3 rounded-xl hover:opacity-90 transition-opacity">
                  🚀 צאו לדרך
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
