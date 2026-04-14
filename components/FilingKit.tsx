"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  FileDown,
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
  Monitor,
  Upload,
  Stamp,
  Package,
  Info,
  FolderOpen,
} from "lucide-react";
import { useApp } from "@/lib/appContext";
import type { Form135Payload } from "@/types";

// ─── Animation variants ───────────────────────────────────────────────────────
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

// ─── Submission guide steps ───────────────────────────────────────────────────
const GUIDE_STEPS = [
  {
    icon: Monitor,
    step: "01",
    title: "כניסה לאזור האישי",
    body: "גש לאתר רשות המיסים (taxes.gov.il) ← \"אזור אישי\" ← \"הגשת בקשה להחזר מס (טופס 135)\".",
    color: "bg-blue-50 text-blue-600 border-blue-100",
  },
  {
    icon: Upload,
    step: "02",
    title: "העלאת הקובץ",
    body: "לחץ על \"העלה מסמך\" ובחר את קובץ ה-PDF שהורדת בשלב הקודם. וודא שהשם הוא form_135_ready.pdf.",
    color: "bg-violet-50 text-violet-600 border-violet-100",
  },
  {
    icon: Stamp,
    step: "03",
    title: "חתימה ואישור",
    body: "חתום דיגיטלית בעזרת תעודת הזיהוי האלקטרונית או ה-SMS OTP. ההחזר יועבר ישירות לחשבון הבנק תוך 30–90 יום.",
    color: "bg-emerald-50 text-emerald-600 border-emerald-100",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export function FilingKit() {
  const { state } = useApp();
  const { taxpayer, financials } = state;

  type DownloadState = "idle" | "generating" | "ready" | "error" | "template_missing";
  const [dlState, setDlState]   = useState<DownloadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleDownload = async () => {
    setDlState("generating");
    setErrorMsg("");

    try {
      const payload: Form135Payload = { taxpayer, financials };

      const res = await fetch("/api/generate/form-135", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // 503 = official template PDF not yet uploaded to the server
        if (res.status === 503 && json?.error === "TEMPLATE_MISSING") {
          setDlState("template_missing");
          return;
        }
        throw new Error(json?.detail ?? `שגיאת שרת: ${res.status}`);
      }

      // Stream the PDF blob → trigger browser download
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "form_135_ready.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDlState("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "אירעה שגיאה. נסה שוב.");
      setDlState("error");
    }
  };

  const formattedRefund = financials.estimatedRefund.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-emerald-500" />
        <h2 className="text-base font-semibold text-foreground">תיק הגשה</h2>
        <span className="bg-emerald-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
          מוכן
        </span>
      </div>

      {/* ── Main Download Card ── */}
      <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Top gradient accent */}
        <div
          className="h-1.5 w-full"
          style={{
            background: "linear-gradient(90deg, #0F172A 0%, #10B981 60%, #6366F1 100%)",
          }}
        />

        <div className="p-6 space-y-5">
          {/* Document info row */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-14 rounded-xl bg-[#0F172A] flex flex-col items-center justify-center flex-shrink-0 shadow-md">
              <span className="text-white text-[9px] font-semibold leading-none">PDF</span>
              <span className="text-emerald-400 text-xs font-bold leading-none mt-1">135</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">טופס 135 — בקשה להחזר מס</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {taxpayer.fullName.split(" - ")[1]} · שנת מס {financials.taxYears[0]}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  `${taxpayer.employers.length} מעסיקים`,
                  financials.hasForeignBroker ? "ברוקר זר" : null,
                  taxpayer.lifeEvents?.pulledSeverancePay ? "פיצויים" : null,
                  `${taxpayer.personalDeductions.length} ניכויים`,
                ]
                  .filter(Boolean)
                  .map((tag) => (
                    <span
                      key={tag!}
                      className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            </div>
            {/* Estimated refund */}
            <div className="flex-shrink-0 text-end">
              <p className="text-[10px] text-slate-400">החזר משוער</p>
              <p className="text-lg font-extrabold text-emerald-500 tabular-nums leading-tight">
                {formattedRefund}
              </p>
            </div>
          </div>

          {/* Download CTA button */}
          <div>
            {/* Template-missing state: distinct setup card instead of broken button */}
            <AnimatePresence mode="wait">
              {dlState === "template_missing" ? (
                <motion.div
                  key="tmpl"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <FolderOpen className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        נדרש: תבנית טופס 135 הרשמית
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                        הגישה ל-PDF הרשמי של רשות המיסים טרם הוגדרה בשרת.
                        הורד את הטופס הרשמי ממשרד האוצר ומקם אותו בנתיב הנכון.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-100 border border-amber-200 px-3 py-2 text-[11px] font-mono text-amber-800 break-all">
                    app/public/templates/form135_official.pdf
                  </div>
                  <div className="flex gap-2">
                    <a
                      href="https://www.gov.il/he/departments/guides/guide-1345"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold
                                 bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      הורד טופס 135 מרשות המיסים
                    </a>
                    <button
                      onClick={() => setDlState("idle")}
                      className="text-xs text-amber-700 hover:text-amber-900 underline underline-offset-2 px-2"
                    >
                      סגור
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="btn">
                  <button
                    onClick={handleDownload}
                    disabled={dlState === "generating"}
                    className={`w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      dlState === "ready"
                        ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-200"
                        : dlState === "error"
                        ? "bg-rose-500 text-white hover:bg-rose-600"
                        : dlState === "generating"
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-[#0F172A] text-white hover:bg-slate-800 shadow-sm shadow-slate-200"
                    }`}
                  >
                    <AnimatePresence mode="wait">
                      {dlState === "generating" ? (
                        <motion.span
                          key="gen"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2"
                        >
                          <Loader2 className="w-4 h-4 animate-spin" />
                          מייצר טופס 135…
                        </motion.span>
                      ) : dlState === "ready" ? (
                        <motion.span
                          key="done"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          הורד שוב — form_135_ready.pdf
                        </motion.span>
                      ) : dlState === "error" ? (
                        <motion.span key="err" className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          שגיאה — לחץ לניסיון חוזר
                        </motion.span>
                      ) : (
                        <motion.span key="idle" className="flex items-center gap-2">
                          <FileDown className="w-4 h-4" />
                          הורד טופס 135 מוכן לחתימה
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>

                  {/* Error detail */}
                  {dlState === "error" && errorMsg && (
                    <p className="mt-2 text-xs text-rose-500 text-center">{errorMsg}</p>
                  )}

                  {/* Success message */}
                  {dlState === "ready" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2.5 rounded-xl border border-emerald-100"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        הטופס הורד בהצלחה. כעת עקוב אחר מדריך ההגשה למטה להעלאה לרשות המיסים.
                      </span>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Legal disclaimer */}
          <div className="flex items-start gap-2 text-[10px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-border">
            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              הטופס הופק על בסיס הנתונים שהוזנו. יש לבדוק ולאשר את הנתונים לפני הגשה לרשות
              המיסים. TaxBack IL אינה אחראית לשגיאות הנובעות מנתונים שגויים שסופקו על ידי המשתמש.
            </span>
          </div>
        </div>
      </div>

      {/* ── Submission Guide ── */}
      <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">מדריך הגשה — 3 צעדים פשוטים</h3>
          <a
            href="https://www.taxes.gov.il"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            אתר רשות המיסים
          </a>
        </div>

        <div className="space-y-3">
          {GUIDE_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + idx * 0.08 }}
                className="flex items-start gap-3"
              >
                {/* Step number + icon */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border ${step.color}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  {idx < GUIDE_STEPS.length - 1 && (
                    <div className="w-0.5 h-4 bg-border rounded-full" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-slate-400">{step.step}</span>
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{step.body}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ITA link button */}
        <a
          href="https://www.taxes.gov.il/IncomeTax/Pages/Generic/ItRequests.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          עבור לאזור האישי ברשות המיסים
        </a>
      </div>
    </motion.div>
  );
}
