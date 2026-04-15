"use client";

/**
 * FileDropzone — Data Ingestion Engine
 *
 * Handles real server-side parsing for two document types:
 *   • .csv files  → POST /api/parse/ibkr    → updates state.taxpayer.capitalGains
 *                                              + state.financials.ibkrData
 *                                              → navigates to "ibkr" view for deep-dive
 *   • .pdf/.image → POST /api/parse/form-106 → pushes employer to state.taxpayer.employers
 *                                              → re-runs tax engine in place
 *
 * State is written to global AppContext via updateTaxpayerAndRecalculate()
 * and updateFinancials(), so Dashboard and IbkrAnalysisDashboard both read
 * the same live data.
 */

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  Upload,
  FileText,
  CheckCircle2,
  X,
  ArrowLeft,
  AlertCircle,
  BarChart3,
  FileCheck,
  Loader2,
  LineChart,
} from "lucide-react";
import { useApp } from "@/lib/appContext";
import { uploadUserDocument } from "@/lib/firebase/storage";
import type {
  IbkrParseResponse,
  Form106ParseResponse,
  Employer,
  VaultDocMeta,
  VaultDocType,
} from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadCategory = "IBKR" | "FORM106" | "OTHER";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  category: UploadCategory;
  status: "processing" | "done" | "error";
  errorMessage?: string;
  progress: number;
}

interface Toast {
  id: string;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CSV_EXTENSIONS = [".csv"];
const IMG_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"];

const LOADING_TEXT: Record<UploadCategory, string> = {
  IBKR:    "מנתח נתוני שוק הון (Interactive Brokers)...",
  FORM106: "סורק טופס 106 באמצעות AI...",
  OTHER:   "מעבד קובץ...",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectCategory(fileName: string): UploadCategory {
  const lower = fileName.toLowerCase();
  if (CSV_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "IBKR";
  if (IMG_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "FORM106";
  return "OTHER";
}

// ─── Animation variants ───────────────────────────────────────────────────────

const toastVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1,    transition: { duration: 0.22 } },
  exit:   { opacity: 0, y: 8,  scale: 0.97, transition: { duration: 0.18 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  show:   { opacity: 1, x: 0,  transition: { duration: 0.22 } },
  exit:   { opacity: 0, x: 10, transition: { duration: 0.18 } },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function FileDropzone() {
  const { state, setView, updateTaxpayerAndRecalculate, addDocument } = useApp();
  const { taxpayer, financials } = state;

  const [dragging, setDragging] = useState(false);
  const [files,    setFiles]    = useState<UploadedFile[]>([]);
  const [toasts,   setToasts]   = useState<Toast[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Toast helpers ──────────────────────────────────────────────────────────

  const showToast = useCallback((message: string) => {
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  // ── Fake incremental progress (asymptotic approach to 90%) ────────────────

  const startFakeProgress = useCallback((id: string): NodeJS.Timeout => {
    return setInterval(() => {
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id !== id || f.status !== "processing") return f;
          const increment = (90 - f.progress) * 0.12;
          return { ...f, progress: Math.min(f.progress + increment, 90) };
        })
      );
    }, 180);
  }, []);

  // ── Core upload handler ───────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (file: File, category: UploadCategory) => {
      const id = `file-${Date.now()}-${Math.random()}`;

      setFiles((prev) => [
        ...prev,
        { id, name: file.name, size: file.size, category, status: "processing", progress: 0 },
      ]);

      const progressTimer = startFakeProgress(id);

      // Upload to Cloud Storage concurrently with parsing — we need the
      // {path, url} result to persist alongside the parsed payload so the
      // document survives page reloads.
      const uploadPromise = uploadUserDocument(
        file,
        category === "IBKR" ? "ibkr" : "form-106",
        file.name,
      );

      try {
        const body = new FormData();
        body.append("file", file);

        const endpoint = category === "IBKR" ? "/api/parse/ibkr" : "/api/parse/form-106";
        const res = await fetch(endpoint, { method: "POST", body });

        clearInterval(progressTimer);

        if (!res.ok) throw new Error(`שגיאת שרת: ${res.status}`);

        const uploadResult = await uploadPromise;
        const vaultType: VaultDocType = category === "IBKR" ? "ibkr" : "form106";

        if (category === "IBKR") {
          // ── IBKR CSV ───────────────────────────────────────────────────
          const json: IbkrParseResponse = await res.json();
          if (!json.success || !json.data) {
            throw new Error(json.error ?? "שגיאה בפענוח קובץ ה-CSV.");
          }

          // Update capital gains in taxpayer state + store ibkrData atomically
          // to avoid the double-setState race condition (5a) and draft sync loss (5b).
          updateTaxpayerAndRecalculate(
            {
              capitalGains: {
                totalRealizedProfit: json.data.totalRealizedProfit,
                totalRealizedLoss:   json.data.totalRealizedLoss,
                foreignTaxWithheld:  json.data.foreignTaxWithheld,
                dividends:           json.data.dividendsILS,
              },
            },
            { ibkrData: json.data },
          );

          const meta: VaultDocMeta = {
            id,
            name: file.name,
            type: vaultType,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            status: "mined",
            storagePath: uploadResult?.path,
            downloadUrl: uploadResult?.url,
            parsedPayload: { kind: "ibkr", data: json.data },
          };
          addDocument(meta);

        } else {
          // ── Form 106 ───────────────────────────────────────────────────
          const json: Form106ParseResponse = await res.json();
          if (!json.success || !json.data) {
            throw new Error(json.error ?? "שגיאה בפענוח טופס 106.");
          }

          const newEmployer: Employer = {
            id:               `emp-ocr-${Date.now()}`,
            name:             json.data.employerName,
            isMainEmployer:   taxpayer.employers.length === 0,
            monthsWorked:     json.data.monthsWorked,
            startMonth:       1,
            endMonth:         json.data.monthsWorked,
            grossSalary:      json.data.grossSalary,
            taxWithheld:      json.data.taxWithheld,
            pensionDeduction: json.data.pensionDeduction,
          };

          const existingIdx = taxpayer.employers.findIndex(
            (e) => e.name === newEmployer.name
          );
          const updatedEmployers =
            existingIdx >= 0
              ? taxpayer.employers.map((e, i) => (i === existingIdx ? newEmployer : e))
              : [...taxpayer.employers, newEmployer];

          updateTaxpayerAndRecalculate({ employers: updatedEmployers });

          const meta: VaultDocMeta = {
            id,
            name: file.name,
            type: vaultType,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            status: "mined",
            storagePath: uploadResult?.path,
            downloadUrl: uploadResult?.url,
            parsedPayload: { kind: "form106", data: json.data },
          };
          addDocument(meta);
        }

        // Snap progress to 100%
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: "done", progress: 100 } : f))
        );

        // For IBKR: navigate immediately to the analysis dashboard
        if (category === "IBKR") {
          setTimeout(() => setView("ibkr"), 800); // brief delay so user sees ✓
        }

      } catch (err) {
        clearInterval(progressTimer);
        const message =
          err instanceof Error ? err.message : "שגיאה בפענוח הקובץ. אנא ודא שזהו קובץ תקין.";

        setFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: "error", progress: 0, errorMessage: message } : f
          )
        );
        showToast(message);
      }
    },
    [taxpayer.employers, updateTaxpayerAndRecalculate, addDocument, setView, showToast, startFakeProgress]
  );

  // ── File entry point ───────────────────────────────────────────────────────

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      Array.from(incoming).forEach((file) => handleUpload(file, detectCategory(file.name)));
    },
    [handleUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const allDone = files.length > 0 && files.every((f) => f.status === "done");
  const hasIbkrData = !!financials.ibkrData;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">העלאת מסמכים</h1>
        <p className="mt-1 text-sm text-slate-500">
          המערכת תחלץ אוטומטית את הנתונים הרלוונטיים ותעדכן את חישוב ההחזר בזמן אמת.
        </p>
      </div>

      {/* ── IBKR shortcut (shown when data already uploaded) ── */}
      {hasIbkrData && (
        <motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setView("ibkr")}
          className="w-full flex items-center justify-between bg-purple-50 border border-purple-200
                     hover:bg-purple-100 transition-colors rounded-2xl px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
              <LineChart className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-start">
              <p className="text-sm font-semibold text-purple-900">ניתוח ברוקר זר — IBKR</p>
              <p className="text-xs text-purple-600">הנתונים כבר הועלו · לחץ לפתיחת הניתוח המלא</p>
            </div>
          </div>
          <ArrowLeft className="w-4 h-4 text-purple-400" />
        </motion.button>
      )}

      {/* ── Dropzone ── */}
      <div
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 p-10 text-center ${
          dragging
            ? "border-brand-900 bg-muted scale-[1.01]"
            : "border-border bg-background hover:border-muted-foreground/40 hover:bg-muted/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.tiff"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
              dragging ? "bg-[#0F172A] text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            <Upload className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">
              גרור לכאן טופסי 106, דוחות ברוקר (Activity Statement), ואישורי זכאות
            </p>
            <p className="mt-1 text-xs text-slate-400">PDF, CSV, JPG, PNG · עד 50MB לקובץ</p>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            {[
              { label: "טופס 106",                 color: "bg-slate-100 text-slate-500 border-border",          icon: <FileCheck className="w-3 h-3" /> },
              { label: "Activity Statement (CSV)", color: "bg-purple-50 text-purple-600 border-purple-100",    icon: <BarChart3  className="w-3 h-3" /> },
              { label: "טופס 161 (פיצויים)",        color: "bg-rose-50 text-rose-600 border-rose-100",          icon: null },
              { label: "קבלות תרומות",              color: "bg-violet-50 text-violet-600 border-violet-100",    icon: null },
              { label: "טופסי 851/831",             color: "bg-blue-50 text-blue-600 border-blue-100",          icon: null },
              { label: "אישור תואר",                color: "bg-emerald-50 text-emerald-600 border-emerald-100", icon: null },
            ].map((tag) => (
              <span
                key={tag.label}
                className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border ${tag.color}`}
              >
                {tag.icon}
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── File cards ── */}
      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <h3 className="text-sm font-semibold text-[#0F172A]">קבצים שהועלו</h3>

            {files.map((file) => (
              <motion.div
                key={file.id}
                variants={cardVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                className={`bg-card rounded-xl border shadow-sm p-4 ${
                  file.status === "error" ? "border-rose-200 dark:border-red-900/50" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      file.status === "done"
                        ? "bg-emerald-50 text-emerald-600"
                        : file.status === "error"
                        ? "bg-rose-50 text-rose-500"
                        : file.category === "IBKR"
                        ? "bg-purple-50 text-purple-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {file.status === "done"       && <CheckCircle2 className="w-5 h-5" />}
                    {file.status === "error"      && <AlertCircle  className="w-5 h-5" />}
                    {file.status === "processing" && (
                      file.category === "IBKR" ? <BarChart3 className="w-5 h-5" /> : <FileText className="w-5 h-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[#0F172A] truncate">{file.name}</p>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
                        className="text-slate-300 hover:text-rose-400 transition-colors flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{formatBytes(file.size)}</p>

                    {file.status === "processing" && (
                      <div className="mt-2 space-y-2">
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <motion.div
                            className={`h-1.5 rounded-full ${file.category === "IBKR" ? "bg-purple-500" : "bg-blue-500"}`}
                            animate={{ width: `${file.progress}%` }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="flex-shrink-0"
                          >
                            <Loader2 className={`w-3.5 h-3.5 ${file.category === "IBKR" ? "text-purple-500" : "text-blue-500"}`} />
                          </motion.div>
                          <span className={`text-xs font-medium ${file.category === "IBKR" ? "text-purple-600" : "text-blue-600"}`}>
                            {LOADING_TEXT[file.category]}
                          </span>
                        </div>
                      </div>
                    )}

                    {file.status === "done" && (
                      <p className="mt-1 text-xs text-emerald-600 font-medium">
                        {file.category === "IBKR"
                          ? "נתוני IBKR עודכנו — מעבר לניתוח מתקדם... ✓"
                          : "טופס 106 נסרק — מעסיק נוסף לתיק ✓"}
                      </p>
                    )}

                    {file.status === "error" && (
                      <p className="mt-1 text-xs text-rose-500 font-medium">
                        {file.errorMessage ?? "שגיאה בפענוח הקובץ."}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CTA row ── */}
      {allDone && !files.some((f) => f.category === "IBKR" && f.status === "done") && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
          <button
            onClick={() => setView("dashboard")}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200"
          >
            <span>צפה בלוח הבקרה המעודכן</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {files.length === 0 && (
        <div className="text-center">
          <button
            onClick={() => setView("dashboard")}
            className="text-sm text-slate-400 hover:text-[#0F172A] underline underline-offset-2 transition-colors"
          >
            דלג ועבור ישירות ללוח הבקרה
          </button>
        </div>
      )}

      {/* ── Toast notifications (bottom-start, RTL-aware) ── */}
      <div className="fixed bottom-5 start-5 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              variants={toastVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="pointer-events-auto flex items-center gap-3 bg-rose-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg max-w-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{toast.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="ms-auto opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
