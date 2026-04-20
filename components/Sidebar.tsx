"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, User, ClipboardList, FolderOpen, PieChart, FileText,
} from "lucide-react";
import { useApp } from "@/lib/appContext";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "הבית", icon: Home },
  { href: "/details", label: "הפרטים שלי", icon: User },
  { href: "/questionnaire", label: "שאלון", icon: ClipboardList },
  { href: "/documents", label: "מסמכים", icon: FolderOpen },
  { href: "/facts", label: "תמונת מצב", icon: PieChart },
  { href: "/filing", label: "הגשה", icon: FileText },
];

function WordMark() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div
        className="w-[38px] h-[38px] rounded-[14px] grid place-items-center font-extrabold text-[20px] -rotate-6"
        style={{
          background: "var(--kc-ink)",
          color: "var(--kc-lime)",
          fontFamily: "var(--font-figtree)",
        }}
      >
        ₪
      </div>
      <div>
        <div
          className="text-[18px] font-extrabold leading-none tracking-[-0.03em]"
          style={{ color: "var(--kc-ink)", fontFamily: "var(--font-figtree)" }}
        >
          כסף<span style={{ color: "var(--kc-lime-dark)" }}>חזרה</span>
        </div>
        <div className="text-[11px] mt-[3px] font-medium" style={{ color: "var(--kc-ink-dim)" }}>
          החזר המס שלך, באפליקציה
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const { state } = useApp();
  const financials = state.financials;
  const completed = financials.actionItems.filter((a) => a.completed).length;
  const total = financials.actionItems.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remaining = Math.max(0, total - completed);

  const fullName = state.taxpayer.fullName || "דוד כהן";
  const displayName = fullName.split(" - ")[1] || fullName;
  const initials =
    displayName
      .split(" ")
      .filter((w) => w.length > 0)
      .slice(0, 1)
      .map((w) => w[0])
      .join("") || "ד";

  return (
    <>
      {/* Desktop sidebar — first in RTL flex = visually right */}
      <aside
        className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 w-[250px] px-4 py-6 gap-[22px]"
        style={{ background: "var(--kc-bg)" }}
      >
        <WordMark />

        <nav className="flex flex-col gap-1 mt-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-3 rounded-[14px] text-[14.5px] transition-all duration-150",
                  active ? "font-semibold" : "font-medium"
                )}
                style={
                  active
                    ? {
                        color: "var(--kc-ink)",
                        background: "var(--kc-card)",
                        boxShadow: "0 4px 14px rgba(26,26,31,0.06)",
                        border: "1px solid var(--kc-rule)",
                      }
                    : {
                        color: "var(--kc-ink-soft)",
                        border: "1px solid transparent",
                      }
                }
              >
                <div
                  className="w-[30px] h-[30px] rounded-[10px] grid place-items-center transition-all"
                  style={{
                    background: active ? "var(--kc-lime)" : "var(--kc-bg-soft)",
                  }}
                >
                  <Icon className="w-4 h-4" style={{ color: "var(--kc-ink)" }} />
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Streak card */}
        <div
          className="relative overflow-hidden rounded-[20px] p-[18px]"
          style={{ background: "var(--kc-ink)", color: "#fff" }}
        >
          <div
            className="absolute w-[120px] h-[120px] rounded-full opacity-95"
            style={{ top: -30, insetInlineEnd: -30, background: "var(--kc-lime)" }}
          />
          <div className="relative">
            <div className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
              מיד סיימת
            </div>
            <div
              className="mt-1 font-extrabold leading-none tracking-[-0.03em] text-[42px]"
              style={{ fontFamily: "var(--font-figtree)" }}
            >
              {pct}
              <span className="text-[22px]" style={{ color: "var(--kc-lime)" }}>
                %
              </span>
            </div>
            <div className="text-[12px] mt-2.5 leading-[1.5]" style={{ color: "rgba(255,255,255,0.7)" }}>
              {remaining > 0 ? `${remaining} דברים קטנים ואתה בהגשה` : "כל הפעולות הושלמו"}
            </div>
            <div
              className="h-1.5 rounded-full mt-3"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: "var(--kc-lime)" }}
              />
            </div>
          </div>
        </div>

        {/* User chip */}
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <div
            className="w-9 h-9 rounded-full grid place-items-center text-white text-[14px] font-bold"
            style={{
              background: `linear-gradient(135deg, var(--kc-coral), var(--kc-peach))`,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold leading-[1.2]" style={{ color: "var(--kc-ink)" }}>
              {displayName}
            </div>
            <div className="text-[11px] leading-[1.2] mt-0.5" style={{ color: "var(--kc-ink-dim)" }}>
              חשבון חינמי
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed bottom-0 start-0 end-0 z-50 md:hidden border-t flex justify-around py-1 safe-area-pb"
        style={{ background: "var(--kc-bg)", borderColor: "var(--kc-rule)" }}
      >
        {NAV_ITEMS.slice(0, 6).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[48px]"
              style={{ color: active ? "var(--kc-ink)" : "var(--kc-ink-dim)" }}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
