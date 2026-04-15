"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Home,
  UserCheck,
  TrendingUp,
  Bitcoin,
  ShieldCheck,
  Globe,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { SOURCE_CATALOG } from "@/lib/sourceCatalog";
import type { IncomeSourceId } from "@/types";
import { cn } from "@/lib/utils";

/**
 * IncomeSourceGrid — the first screen of the new onboarding paradigm.
 *
 * Big chip grid, 3 columns on mobile. Users toggle sources; state lives in the
 * parent. No "next" button nagging — the parent decides when to advance based
 * on selection length.
 *
 * Intentionally no auth, no PII, no year picker above this. The grid is
 * a single clean question: "מאיפה הגיע כסף?"
 */

const ICONS: Record<string, LucideIcon> = {
  Briefcase,
  Home,
  UserCheck,
  TrendingUp,
  Bitcoin,
  ShieldCheck,
  Globe,
  HelpCircle,
};

interface Props {
  selected: IncomeSourceId[];
  onChange: (next: IncomeSourceId[]) => void;
}

export function IncomeSourceGrid({ selected, onChange }: Props) {
  const toggle = (id: IncomeSourceId) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectedCount = selected.length;

  return (
    <div dir="rtl">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-2">
        מאיפה הגיע כסף השנה?
      </h1>
      <p className="text-sm text-muted-foreground text-center mb-8">
        לחצו על כל מה שרלוונטי — אפשר לבחור כמה. זה ייקח פחות מדקה.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SOURCE_CATALOG.map((src) => {
          const Icon = ICONS[src.iconName] ?? HelpCircle;
          const active = selected.includes(src.id);
          return (
            <motion.button
              key={src.id}
              type="button"
              onClick={() => toggle(src.id)}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 transition-all text-center min-h-[120px]",
                active
                  ? "bg-primary/5 border-primary shadow-[var(--shadow-card-hover)]"
                  : "bg-card border-border hover:border-primary/30"
              )}
              aria-pressed={active}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{src.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{src.blurb}</p>
              </div>
              <AnimatePresence>
                {active && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center"
                  >
                    ✓
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-center text-xs text-muted-foreground"
        >
          נבחרו {selectedCount} מקורות הכנסה
        </motion.div>
      )}
    </div>
  );
}
