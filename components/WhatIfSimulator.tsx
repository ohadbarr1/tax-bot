"use client";
import { useState, useMemo } from "react";
import { Sliders, TrendingUp, TrendingDown } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { calculateFullRefund } from "@/lib/calculateTax";
import type { TaxPayer } from "@/types";

interface SimParams {
  extraIncome: number;       // additional annual income ILS
  extraDonation: number;     // additional donation ILS
  extraChildren: number;     // hypothetical extra children
  extraPension: number;      // additional pension deposit ILS
}

function SliderRow({ label, value, min, max, step, onChange, formatFn }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  formatFn?: (v: number) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{formatFn ? formatFn(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        dir="ltr"
      />
    </div>
  );
}

export function WhatIfSimulator() {
  const { state } = useApp();
  const taxYear = state.financials.taxYears[0] ?? 2024;
  const baseline = state.financials.calculationResult;

  const [params, setParams] = useState<SimParams>({
    extraIncome: 0,
    extraDonation: 0,
    extraChildren: 0,
    extraPension: 0,
  });

  const simResult = useMemo(() => {
    // Build simulated taxpayer
    const simTaxpayer: TaxPayer = {
      ...state.taxpayer,
      employers: state.taxpayer.employers.map((e, i) =>
        i === 0 ? { ...e, grossSalary: (e.grossSalary ?? 0) + params.extraIncome } : e
      ),
      children: [
        ...state.taxpayer.children,
        ...Array.from({ length: params.extraChildren }, (_, i) => ({
          id: `sim-child-${i}`,
          birthDate: `${taxYear - 5}-01-01`, // simulate age 5
        })),
      ],
      personalDeductions: [
        ...state.taxpayer.personalDeductions,
        ...(params.extraDonation > 0 ? [{
          id: "sim-donation",
          type: "donation_sec46" as const,
          amount: params.extraDonation,
          providerName: "תרומה מדומה",
        }] : []),
        ...(params.extraPension > 0 ? [{
          id: "sim-pension",
          type: "pension_sec47" as const,
          amount: params.extraPension,
          providerName: "פנסיה מדומה",
        }] : []),
      ],
    };

    return calculateFullRefund(simTaxpayer, taxYear);
  }, [state.taxpayer, params, taxYear]);

  const baseRefund = baseline?.netRefund ?? 0;
  const simRefund = simResult.netRefund;
  const delta = simRefund - baseRefund;

  const fmt = (v: number) => `₪${Math.abs(Math.round(v)).toLocaleString("he-IL")}`;
  const fmtSign = (v: number) => `${v >= 0 ? "+" : "−"}₪${Math.abs(Math.round(v)).toLocaleString("he-IL")}`;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center">
          <Sliders className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-bold text-foreground text-sm">סימולטור מה-אם</p>
          <p className="text-xs text-muted-foreground">גרור להשוות תרחישים</p>
        </div>
        {delta !== 0 && (
          <div className={`mr-auto flex items-center gap-1 text-sm font-bold ${delta >= 0 ? "text-success-500" : "text-danger-500"}`}>
            {delta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {fmtSign(delta)}
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Sliders */}
        <div className="space-y-4">
          <SliderRow
            label="הכנסה נוספת"
            value={params.extraIncome}
            min={0} max={100000} step={5000}
            onChange={(v) => setParams((p) => ({ ...p, extraIncome: v }))}
            formatFn={(v) => v > 0 ? fmt(v) : "ללא שינוי"}
          />
          <SliderRow
            label="תרומה נוספת (סעיף 46)"
            value={params.extraDonation}
            min={0} max={20000} step={500}
            onChange={(v) => setParams((p) => ({ ...p, extraDonation: v }))}
            formatFn={(v) => v > 0 ? fmt(v) : "ללא שינוי"}
          />
          <SliderRow
            label="הפקדת פנסיה נוספת"
            value={params.extraPension}
            min={0} max={10000} step={500}
            onChange={(v) => setParams((p) => ({ ...p, extraPension: v }))}
            formatFn={(v) => v > 0 ? fmt(v) : "ללא שינוי"}
          />
          <SliderRow
            label="ילדים נוספים (היפותטי)"
            value={params.extraChildren}
            min={0} max={4} step={1}
            onChange={(v) => setParams((p) => ({ ...p, extraChildren: v }))}
            formatFn={(v) => v > 0 ? `+${v} ילד` : "ללא שינוי"}
          />
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div className="bg-muted rounded-xl p-3 text-center">
            <p className="text-[11px] text-muted-foreground mb-1">נוכחי</p>
            <p className="text-lg font-bold text-foreground">{baseRefund >= 0 ? "+" : ""}{fmt(baseRefund)}</p>
            <p className="text-[10px] text-muted-foreground">{baseRefund >= 0 ? "החזר" : "חוב"}</p>
          </div>
          <div className={`rounded-xl p-3 text-center ${simRefund >= 0 ? "bg-success-500/10" : "bg-danger-500/10"}`}>
            <p className="text-[11px] text-muted-foreground mb-1">סימולציה</p>
            <p className={`text-lg font-bold ${simRefund >= 0 ? "text-success-500" : "text-danger-500"}`}>
              {simRefund >= 0 ? "+" : ""}{fmt(simRefund)}
            </p>
            <p className="text-[10px] text-muted-foreground">{simRefund >= 0 ? "החזר" : "חוב"}</p>
          </div>
        </div>

        {params.extraIncome === 0 && params.extraDonation === 0 && params.extraPension === 0 && params.extraChildren === 0 && (
          <p className="text-xs text-muted-foreground text-center">הזז סליידר לסימולציה</p>
        )}
      </div>
    </div>
  );
}
