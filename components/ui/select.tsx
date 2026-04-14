"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            "flex h-9 w-full appearance-none rounded-xl border border-input bg-background px-3 py-1 pe-8 text-sm shadow-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:bg-input/30",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
