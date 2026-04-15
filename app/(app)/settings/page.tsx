"use client";

import { useEffect, useState } from "react";
import { Download, RotateCcw, Trash2 } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { useAuth } from "@/lib/firebase/authContext";
import { AuthGate } from "@/components/auth/AuthGate";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";
import { authedFetch } from "@/lib/admin/adminFetch";

const LANG_KEY = "tbk.lang";
type Lang = "he" | "en";

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsInner />
    </AuthGate>
  );
}

function SettingsInner() {
  const { state, discardCurrentDraft, updatePreferences } = useApp();
  const { user } = useAuth();
  const currentDraft = state.drafts[state.currentDraftId];

  const [lang, setLang] = useState<Lang>("he");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === "he" || stored === "en") setLang(stored);
    } catch {
      /* localStorage unavailable (private mode) — ignore */
    }
  }, []);

  function persistLang(next: Lang) {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const notifyChecked = state.preferences?.notifyOnRefundUpdates ?? false;

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const res = await authedFetch("/api/user/export", { method: "GET" });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        throw new Error((body as { error?: string } | null)?.error ?? "ייצוא נכשל");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taxback-export-${user?.uid ?? "user"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[settings] export failed:", err);
      setExportError(err instanceof Error ? err.message : "ייצוא נכשל");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div dir="rtl" className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>

      {/* Existing summary header — read-only */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
        <h2 className="font-semibold text-foreground">פרטי חשבון</h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">שם</span>
            <span className="text-foreground font-medium">
              {currentDraft?.taxpayer.fullName || "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">שנת מס נוכחית</span>
            <span className="text-foreground font-medium">{currentDraft?.taxYear ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* 1. Language */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-foreground">שפה</h2>
          <p className="text-xs text-muted-foreground mt-1">
            כרגע רק עברית פעילה. תמיכה באנגלית תגיע בהמשך.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-background p-1" role="group">
          <button
            type="button"
            onClick={() => persistLang("he")}
            className={
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors " +
              (lang === "he"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            עברית
          </button>
          <button
            type="button"
            onClick={() => persistLang("en")}
            className={
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors " +
              (lang === "en"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            English
          </button>
        </div>
      </section>

      {/* 2. Theme */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">ערכת נושא</h2>
            <p className="text-xs text-muted-foreground mt-1">בהיר / כהה</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* 3. Notifications */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-foreground">התראות</h2>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={notifyChecked}
            onChange={(e) => updatePreferences({ notifyOnRefundUpdates: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-foreground">
            שלחו לי עדכונים על החזר המס
            <div className="text-xs text-muted-foreground mt-0.5">
              נשלח רק עדכונים על סטטוס ההחזר, לא פרסומות.
            </div>
          </span>
        </label>
      </section>

      {/* 4. Data & Danger */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-foreground">נתונים וחשבון</h2>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors disabled:opacity-60"
        >
          <span className="flex items-center gap-2 text-foreground font-medium">
            <Download className="w-4 h-4" />
            הורד את כל הנתונים שלי
          </span>
          {exporting && <span className="text-xs text-muted-foreground">מייצא…</span>}
        </button>
        {exportError && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
            {exportError}
          </div>
        )}

        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors"
        >
          <span className="flex items-center gap-2 text-foreground font-medium">
            <RotateCcw className="w-4 h-4" />
            איפוס שאלון
          </span>
        </button>

        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <Trash2 className="w-4 h-4" />
            מחק חשבון
          </span>
        </button>
      </section>

      {resetOpen && (
        <ResetQuestionnaireModal
          onClose={() => setResetOpen(false)}
          onConfirm={() => {
            discardCurrentDraft();
            setResetOpen(false);
          }}
        />
      )}

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

function ResetQuestionnaireModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">איפוס שאלון?</h2>
        <p className="text-sm text-muted-foreground">
          פעולה זו תאפס את התשובות והפרטים בטיוטה הנוכחית. מסמכים שהעלית יישמרו.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-xl border border-border bg-background hover:bg-muted transition-colors"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="py-2 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
          >
            אפס
          </button>
        </div>
      </div>
    </div>
  );
}
