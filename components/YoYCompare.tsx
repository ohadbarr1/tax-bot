"use client";
import { useMemo } from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useApp } from "@/lib/appContext";

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 50) return <Minus className="w-3.5 h-3.5 text-muted-foreground inline" />;
  if (value > 0) return (
    <span className="text-success-500 flex items-center gap-0.5 text-xs font-medium">
      <ArrowUp className="w-3 h-3" />+₪{Math.round(value).toLocaleString("he-IL")}
    </span>
  );
  return (
    <span className="text-danger-500 flex items-center gap-0.5 text-xs font-medium">
      <ArrowDown className="w-3 h-3" />₪{Math.round(Math.abs(value)).toLocaleString("he-IL")}
    </span>
  );
}

export function YoYCompare() {
  const { allDrafts } = useApp();

  const sorted = useMemo(
    () => [...allDrafts].filter((d) => d.financials.calculationResult).sort((a, b) => a.taxYear - b.taxYear),
    [allDrafts]
  );

  if (sorted.length < 2) return null;

  const rows = [
    { label: "הכנסה ברוטו", key: "totalGrossIncome" as const },
    { label: "מס מחושב", key: "calculatedTax" as const },
    { label: "נקודות זיכוי (₪)", key: "creditPointsValue" as const },
    { label: "זיכויי ניכויים", key: "deductionCredits" as const },
    { label: "מס נטו", key: "netTaxOwed" as const },
    { label: "החזר / חוב", key: "netRefund" as const },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="font-bold text-foreground text-sm">השוואה שנה-לשנה</p>
        <p className="text-xs text-muted-foreground">{sorted.map((d) => d.taxYear).join(" · ")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground">פריט</th>
              {sorted.map((d) => (
                <th key={d.id} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{d.taxYear}</th>
              ))}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">שינוי</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = sorted.map((d) => d.financials.calculationResult![row.key] as number);
              const delta = values[values.length - 1] - values[0];
              return (
                <tr key={row.key} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-2.5 text-foreground font-medium text-xs">{row.label}</td>
                  {values.map((v, i) => (
                    <td key={i} className="px-4 py-2.5 text-foreground text-xs ltr" dir="ltr">
                      ₪{Math.round(v).toLocaleString("he-IL")}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <Delta value={delta} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
