"use client";

import { Info, Check } from "lucide-react";
import {
  User,
  GraduationCap,
  TrendingUp,
  Briefcase,
  HandCoins,
  CalendarDays,
} from "lucide-react";
import type { Variants } from "framer-motion";

// ─── Month constants ──────────────────────────────────────────────────────────
export const HEBREW_MONTHS = [
  { v: 1,  l: "ינואר" }, { v: 2,  l: "פברואר" }, { v: 3,  l: "מרץ"     },
  { v: 4,  l: "אפריל" }, { v: 5,  l: "מאי"    }, { v: 6,  l: "יוני"    },
  { v: 7,  l: "יולי"  }, { v: 8,  l: "אוגוסט" }, { v: 9,  l: "ספטמבר"  },
  { v: 10, l: "אוקטובר" }, { v: 11, l: "נובמבר" }, { v: 12, l: "דצמבר" },
];

export function computeMonthsWorked(start: number, end: number): number {
  return end >= start ? end - start + 1 : 0;
}

// ─── Step definitions ─────────────────────────────────────────────────────────
export const STEPS = [
  { id: 1, label: "מצב אישי",   icon: User },
  { id: 2, label: "השכלה",      icon: GraduationCap },
  { id: 3, label: "שוק ההון",   icon: TrendingUp },
  { id: 4, label: "מעסיקים",    icon: Briefcase },
  { id: 5, label: "ניכויים",    icon: HandCoins },
  { id: 6, label: "אירועי חיים", icon: CalendarDays },
];

// ─── Animation variants ───────────────────────────────────────────────────────
export const slideVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 56 : -56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir < 0 ? 56 : -56, opacity: 0 }),
};

// ─── Small helpers ────────────────────────────────────────────────────────────
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-brand-900 dark:text-white mb-1.5">{children}</label>
  );
}

export function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-2.5 rounded-xl border border-blue-100">
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs text-amber-700 bg-accent-100 px-3 py-2.5 rounded-xl border border-accent-500/20">
      <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-accent-500" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs text-orange-700 bg-orange-50 px-3 py-2.5 rounded-xl border border-orange-100">
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-orange-400" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function TogglePair({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      {[
        { v: true, l: "כן" },
        { v: false, l: "לא" },
      ].map((opt) => (
        <button
          key={String(opt.v)}
          onClick={() => onChange(opt.v)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
            value === opt.v
              ? "bg-brand-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {opt.l}
        </button>
      ))}
    </div>
  );
}
