"use client";

import { motion } from "framer-motion";
import {
  AlertCircle,
  ShieldAlert,
  Circle,
  CheckCircle2,
} from "lucide-react";
import type { ActionItem, FinancialData } from "@/types";

const PRIORITY_ICON: Record<ActionItem["priority"], React.ReactNode> = {
  high: <AlertCircle className="w-4 h-4 text-rose-500" />,
  medium: <ShieldAlert className="w-4 h-4 text-amber-500" />,
  low: <Circle className="w-4 h-4 text-slate-300" />,
};

interface ActionItemsProps {
  financials: FinancialData;
  completedActions: number;
  totalActions: number;
  pendingActions: number;
  updateFinancials: (patch: Partial<FinancialData>) => void;
}

export function ActionItems({
  financials,
  completedActions,
  totalActions,
  pendingActions,
  updateFinancials,
}: ActionItemsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500" />
          השלמות נדרשות
        </h2>
        {pendingActions > 0 && (
          <span className="bg-rose-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
            {pendingActions}
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Progress */}
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>התקדמות</span>
            <span className="tabular-nums">{completedActions}/{totalActions}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <motion.div
              className="bg-emerald-500 h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(completedActions / totalActions) * 100}%`,
              }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.3 }}
            />
          </div>
        </div>

        <ul className="divide-y divide-border">
          {financials.actionItems.map((action) => (
            <li
              key={action.id}
              onClick={() =>
                updateFinancials({
                  actionItems: financials.actionItems.map((a) =>
                    a.id === action.id ? { ...a, completed: !a.completed } : a
                  ),
                })
              }
              className="flex items-start gap-3 px-4 py-3.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer select-none"
            >
              <div className="mt-0.5 flex-shrink-0">
                {action.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  PRIORITY_ICON[action.priority]
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs leading-snug font-medium ${
                    action.completed
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {action.label}
                </p>
                {action.formNumber && !action.completed && (
                  <span className="mt-1 inline-block text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    טופס {action.formNumber}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
