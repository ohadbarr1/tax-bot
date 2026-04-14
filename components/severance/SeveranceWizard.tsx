"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calculator, Calendar, TrendingDown, CheckCircle } from "lucide-react";

interface SpreadYear {
  year: number;
  taxableAmount: number;
  marginalRate: number;
  taxLiability: number;
}

interface SpreadingResult {
  spreadSchedule: SpreadYear[];
  totalTaxWithSpreading: number;
  totalTaxLumpSum: number;
  savings: number;
}

export function SeveranceWizard() {
  const [step, setStep] = useState(1);
  const [taxableSeverance, setTaxableSeverance] = useState("");
  const [currentYearIncome, setCurrentYearIncome] = useState("");
  const [spreadYears, setSpreadYears] = useState(3);
  const [result, setResult] = useState<{ form161: { spreading: SpreadingResult; recommendation: string; taxableSeverance: number } } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/generate/form-161", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxableSeverance: Number(taxableSeverance),
          currentYearIncome: Number(currentYearIncome),
          spreadYears,
          currentYear: 2024,
        }),
      });
      const data = await res.json();
      setResult(data);
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-900 rounded-xl flex items-center justify-center">
          <Calculator className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">מחשבון פריסת פיצויים</h2>
          <p className="text-sm text-muted-foreground">סעיף 8ג — מיטוב מס על פיצויים חייבים</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 rounded-full flex-1 transition-all ${s <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">סכום הפיצויים החייבים במס (₪)</label>
                <input
                  type="number"
                  value={taxableSeverance}
                  onChange={(e) => setTaxableSeverance(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="לדוגמה: 100000"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground mt-1">סכום מטופס 161 — שדה 272</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">הכנסה שנתית ממשכורת (₪)</label>
                <input
                  type="number"
                  value={currentYearIncome}
                  onChange={(e) => setCurrentYearIncome(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="לדוגמה: 180000"
                  dir="ltr"
                />
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!taxableSeverance || !currentYearIncome}
              className="mt-4 w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              המשך ←
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">מספר שנות פריסה</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">החוק מאפשר פריסה על פני 1 עד 6 שנות מס. בדרך כלל פריסה ל-3-4 שנים מיטבית.</p>

              <div className="flex items-center gap-4 mb-2">
                <span className="text-sm text-muted-foreground w-4">1</span>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={spreadYears}
                  onChange={(e) => setSpreadYears(Number(e.target.value))}
                  className="flex-1 accent-primary"
                  dir="ltr"
                />
                <span className="text-sm text-muted-foreground w-4">6</span>
              </div>
              <div className="text-center mt-4">
                <span className="text-4xl font-bold text-primary">{spreadYears}</span>
                <span className="text-lg text-muted-foreground mr-2">שנים</span>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                חזרה
              </button>
              <button
                onClick={handleCalculate}
                disabled={loading}
                className="flex-1 bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {loading ? "מחשב..." : "חשב פריסה ←"}
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && result && (
          <motion.div key="s3" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="space-y-4">
              {/* Summary card */}
              <div className={`rounded-2xl p-5 border-2 ${result.form161.spreading.savings > 0 ? "bg-success-500/5 border-success-500/40" : "bg-muted border-border"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className={`w-5 h-5 ${result.form161.spreading.savings > 0 ? "text-success-500" : "text-muted-foreground"}`} />
                  <h3 className="font-semibold text-foreground">המלצה</h3>
                </div>
                <p className="text-foreground font-medium">{result.form161.recommendation}</p>
              </div>

              {/* Comparison table */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-primary" />
                  השוואת חבות המס
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-danger-500/5 border border-danger-500/30 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">תשלום חד-פעמי</p>
                    <p className="text-2xl font-bold text-danger-500">
                      ₪{result.form161.spreading.totalTaxLumpSum.toLocaleString("he-IL")}
                    </p>
                  </div>
                  <div className="bg-success-500/5 border border-success-500/30 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">עם פריסה</p>
                    <p className="text-2xl font-bold text-success-500">
                      ₪{result.form161.spreading.totalTaxWithSpreading.toLocaleString("he-IL")}
                    </p>
                  </div>
                </div>
                {result.form161.spreading.savings > 0 && (
                  <div className="mt-4 text-center p-3 bg-accent-100 dark:bg-accent-500/10 rounded-xl">
                    <p className="text-sm text-muted-foreground">חיסכון</p>
                    <p className="text-2xl font-bold text-accent-500">
                      ₪{result.form161.spreading.savings.toLocaleString("he-IL")}
                    </p>
                  </div>
                )}
              </div>

              {/* Spread schedule */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-semibold text-foreground mb-3 text-sm">לוח הפריסה</h3>
                <div className="space-y-2">
                  {result.form161.spreading.spreadSchedule.map((y) => (
                    <div key={y.year} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
                      <span className="text-muted-foreground">{y.year}</span>
                      <span className="text-foreground">₪{Math.round(y.taxableAmount).toLocaleString("he-IL")}</span>
                      <span className="text-xs text-muted-foreground">{Math.round(y.marginalRate * 100)}%</span>
                      <span className="font-medium text-foreground">₪{y.taxLiability.toLocaleString("he-IL")} מס</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => { setStep(1); setResult(null); }} className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                חישוב חדש
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
