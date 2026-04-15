"use client";
import { useEffect, useState } from "react";
import { Sparkles, ChevronLeft, TrendingUp, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { generateOptimizations } from "@/lib/optimizer";
import type { OptimizationSuggestion } from "@/lib/optimizer";
import { currentTaxYear } from "@/lib/currentTaxYear";
import { cn } from "@/lib/utils";

const priorityColors = {
  high: "text-danger-500 bg-danger-500/10 border-danger-500/30",
  medium: "text-accent-500 bg-accent-500/10 border-accent-500/30",
  low: "text-muted-foreground bg-muted border-border",
};
const priorityLabels = { high: "גבוה", medium: "בינוני", low: "נמוך" };

export function Optimizer() {
  const { state } = useApp();
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);

  useEffect(() => {
    const taxYear = state.financials.taxYears[0] ?? currentTaxYear();
    const opts = generateOptimizations(state.taxpayer, state.financials, taxYear);
    setSuggestions(opts.slice(0, 3));
  }, [state.taxpayer, state.financials]);

  const totalSaving = suggestions.reduce((s, o) => s + o.estimatedSaving, 0);

  if (suggestions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-success-500/10 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-success-500" />
        </div>
        <div>
          <p className="font-semibold text-foreground text-sm">הכל מיטובי</p>
          <p className="text-xs text-muted-foreground">לא נמצאו הזדמנויות נוספות להחזר</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent-500/15 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent-500" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">מיטוב מס</p>
            <p className="text-xs text-muted-foreground">{suggestions.length} הזדמנויות</p>
          </div>
        </div>
        {totalSaving > 0 && (
          <div className="flex items-center gap-1 text-success-500">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-bold">+₪{totalSaving.toLocaleString("he-IL")}</span>
          </div>
        )}
      </div>

      {/* Suggestions list */}
      <div className="divide-y divide-border">
        {suggestions.map((s) => (
          <div key={s.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors">
            <AlertCircle className={cn("w-4 h-4 mt-0.5 shrink-0", s.priority === "high" ? "text-danger-500" : s.priority === "medium" ? "text-accent-500" : "text-muted-foreground")} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-foreground truncate">{s.title}</p>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border shrink-0", priorityColors[s.priority])}>
                  {priorityLabels[s.priority]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
            </div>
            <div className="shrink-0 text-left">
              <p className="text-xs font-bold text-success-500">₪{s.estimatedSaving.toLocaleString("he-IL")}</p>
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground mx-auto mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
