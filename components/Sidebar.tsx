"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, User, FolderOpen, Menu, X,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "דשבורד", icon: LayoutDashboard },
  { href: "/details", label: "פרטים", icon: User },
  { href: "/documents", label: "מסמכים", icon: FolderOpen },
  { href: "/facts", label: "תמונת מצב", icon: PieChart },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Desktop sidebar — in RTL this is the right side since it's first in flex */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 h-screen sticky top-0",
          "bg-sidebar border-s border-sidebar-border",
          "transition-[width] duration-300 ease-in-out overflow-hidden",
          collapsed ? "w-[68px]" : "w-[220px]"
        )}
      >
        {/* Collapse toggle */}
        <div className="h-16 flex items-center justify-center border-b border-sidebar-border">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  collapsed ? "justify-center" : "justify-start",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 start-0 end-0 z-50 md:hidden bg-sidebar border-t border-sidebar-border flex justify-around py-1 safe-area-pb">
        {NAV_ITEMS.slice(0, 6).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[48px]",
                active ? "text-sidebar-primary" : "text-sidebar-foreground/50"
              )}
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
