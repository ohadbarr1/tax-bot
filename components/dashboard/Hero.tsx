"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { TaxPayer, FinancialData } from "@/types";
import { refundHeadline } from "@/lib/refundDisplay";
import { currentTaxYear } from "@/lib/currentTaxYear";

function formatILSNum(n: number) {
  return Math.round(n).toLocaleString("he-IL");
}

interface HeroProps {
  financials: FinancialData;
  taxpayer: TaxPayer;
  hasOverlap: boolean;
  completedActions: number;
  totalActions: number;
  pendingActions: number;
  /** Fires the 135/1301 PDF download. Disabled when the button is disabled. */
  onDownloadDraft: () => void;
  /** True while a download request is in flight; button shows loading copy. */
  downloading?: boolean;
  /** Disable the download CTA (e.g. no idNumber yet). */
  downloadDisabled?: boolean;
  /** Tooltip explaining why the download CTA is disabled. */
  downloadDisabledReason?: string;
  onQuestionnaire: () => void;
}

function useAnimatedCount(target: number, durationMs = 1400) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return count;
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 180;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setP(pct / 100), 200);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--kc-lime)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div
            className="font-extrabold leading-none tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-figtree)", fontSize: 46 }}
          >
            {pct}
            <span className="text-[22px]" style={{ color: "var(--kc-lime)" }}>
              %
            </span>
          </div>
          <div className="text-[11px] mt-1.5 font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
            הושלם
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero({
  financials,
  taxpayer,
  completedActions,
  totalActions,
  onDownloadDraft,
  downloading = false,
  downloadDisabled = false,
  downloadDisabledReason,
  onQuestionnaire,
}: HeroProps) {
  const headline = refundHeadline(financials.estimatedRefund);
  // Animate the absolute value so the count tween doesn't flip sign midair.
  const count = useAnimatedCount(headline.amountAbs);
  const pct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
  const year = financials.taxYears[financials.taxYears.length - 1] ?? currentTaxYear();
  const sourceCount = new Set(financials.insights.map((i) => i.pillar)).size;
  const pending = totalActions - completedActions;

  return (
    <div
      className="relative overflow-hidden rounded-[32px] px-8 md:px-11 py-10"
      style={{ background: "var(--kc-ink)", color: "#fff" }}
    >
      {/* Decorative blobs */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          top: -60,
          insetInlineEnd: -40,
          width: 280,
          height: 280,
          background: `radial-gradient(circle, var(--kc-lime) 0%, transparent 70%)`,
          opacity: 0.45,
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          bottom: -100,
          insetInlineStart: 40,
          width: 320,
          height: 320,
          background: `radial-gradient(circle, var(--kc-grape) 0%, transparent 70%)`,
          opacity: 0.3,
        }}
      />

      <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-end">
        <div>
          <div
            className="inline-flex items-center gap-2 text-[12px] font-semibold rounded-full px-3 py-1.5"
            style={{
              background:
                headline.tone === "debt"
                  ? "rgba(231,111,81,0.18)"
                  : headline.tone === "refund"
                    ? "rgba(198,255,77,0.15)"
                    : "rgba(255,255,255,0.12)",
              color: headline.colorToken,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: headline.colorToken }}
            />
            {headline.label} · {year}
          </div>

          <div
            className="mt-4 flex items-baseline gap-1.5 font-extrabold tracking-[-0.04em] leading-[0.95] tabular-nums"
            style={{ fontFamily: "var(--font-figtree)", fontSize: "clamp(64px, 10vw, 104px)" }}
          >
            <span className="font-bold" style={{ fontSize: "0.52em", color: headline.colorToken }}>
              ₪
            </span>
            <span style={{ color: headline.tone === "debt" ? headline.colorToken : undefined }}>
              {headline.sign}
              {formatILSNum(count)}
            </span>
          </div>

          <div
            className="mt-4 text-[15px] max-w-[520px] leading-[1.55]"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            {taxpayer.fullName?.split(" - ")[1] ? `היי ${taxpayer.fullName.split(" - ")[1]}, ` : ""}
            זיהינו{" "}
            <strong className="font-bold" style={{ color: "var(--kc-lime)" }}>
              {sourceCount} מקורות להחזר
            </strong>{" "}
            בתיק שלך. עוד {pending} פעולות קטנות ואתה בהגשה.
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5 items-center">
            <button
              onClick={onQuestionnaire}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full font-bold text-[14.5px] transition-transform hover:scale-[1.03]"
              style={{
                background: "var(--kc-lime)",
                color: "var(--kc-ink)",
                fontFamily: "var(--font-figtree)",
              }}
            >
              בוא נסיים את זה
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onDownloadDraft}
              disabled={downloadDisabled || downloading}
              title={downloadDisabled ? downloadDisabledReason : undefined}
              className="px-5 py-3.5 rounded-full font-semibold text-[14px] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {downloading ? "מייצר 135..." : "הצג טיוטת 135"}
            </button>
          </div>
        </div>

        <div className="hidden md:block">
          <ProgressRing pct={pct} />
        </div>
      </div>
    </div>
  );
}
