"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  active: string;
  setActive: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  active: "",
  setActive: () => {},
});

interface TabsProps {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, children, className }: TabsProps) {
  const [active, setActive] = React.useState(defaultValue);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-muted p-1",
        className
      )}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { active, setActive } = React.useContext(TabsContext);
  const isActive = active === value;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActive(value)}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
        isActive
          ? "bg-background text-brand-900 shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { active } = React.useContext(TabsContext);
  if (active !== value) return null;
  return <div role="tabpanel" className={className}>{children}</div>;
}
