"use client";

import * as React from "react";
import { X, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "warning";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "bg-brand-900 text-white border-brand-700",
  success: "bg-accent-100 text-amber-900 border-accent-500/30",
  error:   "bg-red-50 text-danger-500 border-danger-500/20",
  warning: "bg-orange-50 text-orange-800 border-orange-200",
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="w-4 h-4 shrink-0" />,
  success: <CheckCircle className="w-4 h-4 shrink-0 text-success-500" />,
  error:   <AlertTriangle className="w-4 h-4 shrink-0 text-danger-500" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0 text-orange-500" />,
};

export function Toast({ message, variant = "default", onDismiss, className }: ToastProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-[var(--shadow-card-hover)] text-sm font-medium",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {VARIANT_ICONS[variant]}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100 transition-opacity"
          aria-label="סגור"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/** Simple toast container — place once in app layout */
export function ToastContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none",
        "[&>*]:pointer-events-auto",
        className
      )}
    >
      {children}
    </div>
  );
}
