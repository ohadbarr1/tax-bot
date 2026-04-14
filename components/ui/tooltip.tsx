"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({ children, content, side = "top", className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false);

  const positionClass = {
    top:    "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left:   "right-full mr-2 top-1/2 -translate-y-1/2",
    right:  "left-full ml-2 top-1/2 -translate-y-1/2",
  }[side];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-brand-900 rounded-lg shadow-lg",
            "max-w-xs text-center whitespace-nowrap pointer-events-none",
            positionClass,
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
