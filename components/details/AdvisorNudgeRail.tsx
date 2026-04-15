"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, AlertCircle, ArrowLeft, Sparkles, RefreshCw, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appContext";
import { currentTaxYear } from "@/lib/currentTaxYear";
import type { AdvisorNudge, AdvisorNudgeAction, AdvisorNudgeListResponse } from "@/lib/advisorNudge";
import type { PersonalDeduction, TaxInsight } from "@/types";

/**
 * AdvisorNudgeRail — Claude-backed side column for /details.
 *
 * On mount (and whenever the taxpayer draft meaningfully changes) this calls
 * POST /api/advisor/nudges which returns up to 4 structured nudges. Each
 * nudge is rendered as a card. Nudges whose action kind maps to a safe
 * state mutation show an Accept button — on click the dispatcher below
 * applies the change via useApp setters and marks the nudge "accepted".
 *
 * Graceful degrade: if the API returns empty (key missing or error) we fall
 * back to the deterministic rules layer (missing identity / missing bank /
 * top insights from the engine). The user always sees *something* useful.
 */
export function AdvisorNudgeRail() {
  const router = useRouter();
  const { state, updateTaxpayerAndRecalculate } = useApp();
  const { taxpayer, financials } = state;

  const [remoteNudges, setRemoteNudges] = useState<AdvisorNudge[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const lastSignatureRef = useRef<string>("");

  // Hash the fields Claude cares about so we don't refetch on every keystroke.
  // We debounce with a small setTimeout inside the effect below.
  const draftSignature = useMemo(() => {
    const emps = (taxpayer.employers ?? [])
      .map((e) => `${e.name ?? ""}:${e.grossSalary ?? ""}:${e.monthsWorked ?? ""}`)
      .join("|");
    const deds = (taxpayer.personalDeductions ?? [])
      .map((d) => `${d.type}:${d.amount}`)
      .join("|");
    return [
      taxpayer.idNumber ?? "",
      taxpayer.firstName ?? "",
      taxpayer.maritalStatus ?? "",
      (taxpayer.children ?? []).length,
      taxpayer.bank?.account ?? "",
      taxpayer.aliyahDate ?? "",
      taxpayer.dischargeYear ?? "",
      emps,
      deds,
    ].join("#");
  }, [taxpayer]);

  const fetchNudges = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/advisor/nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxpayer,
          financials,
          taxYear: financials.taxYears[0] ?? currentTaxYear(),
        }),
      });
      if (!res.ok) {
        setRemoteNudges([]);
        return;
      }
      const data = (await res.json()) as AdvisorNudgeListResponse;
      setRemoteNudges(Array.isArray(data.nudges) ? data.nudges : []);
    } catch (err) {
      console.warn("[AdvisorNudgeRail] fetch failed:", err);
      setRemoteNudges([]);
    } finally {
      setLoading(false);
    }
    // taxpayer/financials are captured here intentionally — the effect below
    // gates *when* we call this via the draftSignature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxpayer, financials]);

  useEffect(() => {
    if (draftSignature === lastSignatureRef.current) return;
    lastSignatureRef.current = draftSignature;
    const t = setTimeout(() => {
      fetchNudges();
    }, 800);
    return () => clearTimeout(t);
  }, [draftSignature, fetchNudges]);

  const deterministicNudges = useMemo<AdvisorNudge[]>(() => {
    const out: AdvisorNudge[] = [];

    if (!taxpayer.idNumber || !taxpayer.firstName || !taxpayer.lastName) {
      out.push({
        id: "det-missing-identity",
        tone: "warn",
        title: "חסרים פרטי זהות",
        body: "אפשר להעלות טופס 106 ושם ות.ז יתמלאו אוטומטית.",
        action: { kind: "nav_upload_doc", docType: "form106" },
      });
    }

    if (!taxpayer.bank?.account) {
      out.push({
        id: "det-missing-bank",
        tone: "warn",
        title: "פרטי בנק להחזר",
        body: "חשבון בנק נדרש כדי שרשות המיסים תוכל להעביר את ההחזר.",
        action: { kind: "focus_field", path: "taxpayer.bank.account" },
      });
    }

    const insights: TaxInsight[] = financials.insights ?? [];
    for (const ins of insights.slice(0, 2)) {
      out.push({
        id: `det-ins-${ins.id}`,
        tone: "info",
        title: ins.title.slice(0, 50),
        body: ins.description.slice(0, 240),
      });
    }

    return out;
  }, [taxpayer, financials.insights]);

  // Merge: prefer remote when present and non-empty; otherwise deterministic.
  const visibleNudges = useMemo(() => {
    const source = remoteNudges && remoteNudges.length > 0 ? remoteNudges : deterministicNudges;
    return source.filter((n) => !dismissedIds.has(n.id));
  }, [remoteNudges, deterministicNudges, dismissedIds]);

  const dispatch = useCallback(
    (nudge: AdvisorNudge) => {
      const action = nudge.action;
      if (!action) return;

      setAcceptedIds((prev) => new Set(prev).add(nudge.id));

      switch (action.kind) {
        case "nav_upload_doc":
          router.push("/welcome");
          return;

        case "set_marital_status":
          updateTaxpayerAndRecalculate({ maritalStatus: action.value });
          return;

        case "add_child": {
          const newChild = {
            id: `child-${Date.now()}`,
            birthDate: "",
            inDaycare: action.inDaycare ?? false,
          };
          updateTaxpayerAndRecalculate({
            children: [...(taxpayer.children ?? []), newChild],
          });
          // Scroll the user to the children field so they can fill the DOB.
          requestAnimationFrame(() => focusPath(`taxpayer.children[${(taxpayer.children ?? []).length}].birthDate`));
          return;
        }

        case "set_aliyah_year":
          updateTaxpayerAndRecalculate({
            aliyahDate: `${action.year}-01-01`,
          });
          return;

        case "set_discharge_year":
          updateTaxpayerAndRecalculate({ dischargeYear: action.year });
          return;

        case "add_deduction": {
          const newDed: PersonalDeduction = {
            id: `ded-${Date.now()}`,
            type: action.deductionType,
            amount: 0,
            providerName: action.providerName,
          };
          updateTaxpayerAndRecalculate({
            personalDeductions: [...(taxpayer.personalDeductions ?? []), newDed],
          });
          return;
        }

        case "focus_field":
          focusPath(action.path);
          return;

        default:
          // Exhaustiveness — TS will flag if we add a new action kind and
          // forget to handle it here.
          const _exhaustive: never = action;
          void _exhaustive;
      }
    },
    [router, updateTaxpayerAndRecalculate, taxpayer.children, taxpayer.personalDeductions]
  );

  if (visibleNudges.length === 0 && !loading) return null;

  return (
    <aside dir="rtl" className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
            הצעות של היועצת
          </h2>
        </div>
        <button
          type="button"
          onClick={fetchNudges}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="רענן הצעות"
          title="רענן הצעות"
        >
          <RefreshCw className={loading ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {visibleNudges.map((n, i) => {
          const accepted = acceptedIds.has(n.id);
          const actionLabel = n.action ? labelForAction(n.action) : null;
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: i * 0.05 }}
              className={
                n.tone === "warn"
                  ? "rounded-2xl border border-amber-300 bg-amber-50/60 p-4 text-right"
                  : "rounded-2xl border border-border bg-card p-4 text-right"
              }
            >
              <div className="flex items-start gap-2">
                {n.tone === "warn" ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.body}</p>
                  {actionLabel && n.action && !accepted && (
                    <button
                      type="button"
                      onClick={() => dispatch(n)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80"
                    >
                      {actionLabel}
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                  )}
                  {accepted && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                      <Check className="w-3 h-3" /> הוחל
                    </p>
                  )}
                  {!actionLabel && n.id.startsWith("det-missing-identity") && (
                    <Link
                      href="/welcome"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80"
                    >
                      חזרה להעלאת מסמכים
                      <ArrowLeft className="w-3 h-3" />
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedIds((prev) => new Set(prev).add(n.id))}
                  className="text-muted-foreground/60 hover:text-foreground text-xs"
                  aria-label="הסתר הצעה"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </aside>
  );
}

function labelForAction(action: AdvisorNudgeAction): string {
  switch (action.kind) {
    case "nav_upload_doc":
      return "העלה מסמך";
    case "set_marital_status":
      return "עדכן מצב משפחתי";
    case "add_child":
      return "הוסף ילד";
    case "set_aliyah_year":
      return "סמן עולה חדש";
    case "set_discharge_year":
      return "סמן שחרור צבאי";
    case "add_deduction":
      return "הוסף ניכוי";
    case "focus_field":
      return "מלא עכשיו";
  }
}

/**
 * Best-effort scroll-to + focus for a dot-path field. The <Field> wrapper
 * sets `data-field-path` on its container, so we can find it from here.
 */
function focusPath(path: string) {
  if (typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(`[data-field-path="${cssEscape(path)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = el.querySelector<HTMLInputElement>("input, textarea, select");
  if (input) {
    setTimeout(() => input.focus(), 300);
  }
}

function cssEscape(s: string): string {
  // Lightweight CSS.escape fallback for older envs — only escapes the chars
  // that appear in our field paths (`[`, `]`, `.`).
  if (typeof window !== "undefined" && typeof (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS?.escape === "function") {
    return (window as unknown as { CSS: { escape: (s: string) => string } }).CSS.escape(s);
  }
  return s.replace(/[\[\].]/g, (c) => `\\${c}`);
}
