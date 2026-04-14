"use client";

import { useState, useMemo } from "react";
import { Shield, Info } from "lucide-react";

interface IbkrTaxShieldProps {
  parsedProfit: number;   // USD
  parsedLoss: number;     // USD
  parsedDividends: number; // USD
  parsedForeignTax: number; // USD
  exchangeRate: number;
}

function formatILS(val: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatUSD(val: number): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(val)}`;
}

export default function IbkrTaxShield({
  parsedProfit,
  parsedLoss,
  parsedDividends,
  parsedForeignTax,
  exchangeRate,
}: IbkrTaxShieldProps) {
  const [previousLosses, setPreviousLosses] = useState<number>(0);

  const calc = useMemo(() => {
    // Step 1: Net current gain from this year
    const netCurrentGain = parsedProfit - parsedLoss;

    // Step 2: Adjusted gain after offsetting previous-year losses
    const adjustedGain = Math.max(0, netCurrentGain - previousLosses);

    // Step 3: Tax liability in USD
    const taxLiabilityUSD =
      adjustedGain * 0.25 + parsedDividends * 0.25 - parsedForeignTax;

    // Step 4: Final tax to pay in ILS (floor at 0)
    const finalTaxToPayILS = Math.max(0, Math.round(taxLiabilityUSD * exchangeRate));

    // Step 5: Tax saved by carrying forward previous losses
    const taxSavedILS = Math.round(
      (netCurrentGain - adjustedGain) * 0.25 * exchangeRate
    );

    return { netCurrentGain, adjustedGain, taxLiabilityUSD, finalTaxToPayILS, taxSavedILS };
  }, [parsedProfit, parsedLoss, parsedDividends, parsedForeignTax, exchangeRate, previousLosses]);

  const hasSavings = calc.taxSavedILS > 0;
  const noTax = calc.finalTaxToPayILS === 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-base font-bold">מגן מס (Tax Shield)</h3>
          <p className="text-xs text-slate-400">קיזוז הפסדים מועברים משנים קודמות</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* ── Left: Input ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2 text-right">
              הפסדים מועברים משנים קודמות ($)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={100}
                value={previousLosses || ""}
                onChange={(e) => setPreviousLosses(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
                           text-white placeholder-slate-500 text-left tabular-nums
                           focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent
                           transition-all"
                dir="ltr"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
                $
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 text-right flex items-start gap-1 justify-end">
              <span>ניתן למצוא בדוח השנתי מרשות המיסים</span>
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            </p>
          </div>

          {/* Breakdown */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span className="tabular-nums">{formatUSD(parsedProfit)}</span>
              <span>רווח ממומש</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span className="tabular-nums text-red-400">({formatUSD(parsedLoss)})</span>
              <span>הפסד ממומש</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-2">
              <span className={`tabular-nums font-semibold ${calc.netCurrentGain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatUSD(calc.netCurrentGain)}
              </span>
              <span className="text-slate-300">רווח נקי שנוכחי</span>
            </div>
            {previousLosses > 0 && (
              <div className="flex justify-between text-blue-400">
                <span className="tabular-nums">({formatUSD(previousLosses)})</span>
                <span>הפסדים מועברים</span>
              </div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-2">
              <span className="tabular-nums font-semibold text-white">{formatUSD(calc.adjustedGain)}</span>
              <span className="text-slate-300">בסיס חייב במס</span>
            </div>
          </div>
        </div>

        {/* ── Right: Results ───────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Tax to pay */}
          <div
            className={`rounded-xl border p-4 ${
              noTax
                ? "bg-emerald-500/20 border-emerald-500/40"
                : "bg-orange-500/10 border-orange-500/30"
            }`}
          >
            <p className="text-xs text-slate-400 text-right mb-1">מס סופי לתשלום</p>
            <p
              className={`text-3xl font-bold tabular-nums text-right ${
                noTax ? "text-emerald-400" : "text-orange-300"
              }`}
            >
              {noTax ? "₪0" : formatILS(calc.finalTaxToPayILS)}
            </p>
            {noTax && (
              <p className="text-xs text-emerald-500 text-right mt-1">
                ✓ הפסדים קיזזו את כל המס
              </p>
            )}
          </div>

          {/* Tax saved */}
          {hasSavings && (
            <div className="rounded-xl border bg-emerald-500/10 border-emerald-500/30 p-4">
              <p className="text-xs text-slate-400 text-right mb-1">מס שנחסך בזכות הקיזוז</p>
              <p className="text-3xl font-bold tabular-nums text-right text-emerald-400">
                {formatILS(calc.taxSavedILS)}
              </p>
            </div>
          )}

          {!hasSavings && !noTax && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-slate-500">
                הזן הפסדים מועברים כדי לחשב את מגן המס
              </p>
            </div>
          )}

          {/* Formula hint */}
          <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-500 space-y-1 text-right">
            <p className="font-medium text-slate-400 mb-1.5">נוסחת החישוב</p>
            <p>מס = (בסיס × 25%) + (דיבידנדים × 25%) − מס זר</p>
            <p>שע&quot;ח: ${exchangeRate.toFixed(2)} לדולר</p>
          </div>
        </div>
      </div>
    </div>
  );
}
