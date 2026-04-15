"use client";

import { useApp } from "@/lib/appContext";
import { SourcePill } from "./SourcePill";
import { cn } from "@/lib/utils";

/**
 * Field — single-input cell wired to a dot-path. Pulls provenance from
 * state and renders a SourcePill when the value was mined from a doc.
 *
 * The first user edit flips `userConfirmed` on the provenance entry so
 * subsequent doc re-mining never overwrites manual input. Clearing the
 * field via the undo button removes provenance entirely.
 */
export function Field({
  path,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  dir = "rtl",
  className,
}: {
  path: string;
  label: string;
  value: string | number | undefined;
  onChange: (v: string) => void;
  type?: "text" | "number" | "tel" | "email";
  placeholder?: string;
  dir?: "rtl" | "ltr";
  className?: string;
}) {
  const { state, markFieldUserConfirmed, undoFieldMining } = useApp();
  const prov = state.provenance?.[path];

  const handleChange = (v: string) => {
    onChange(v);
    if (prov && !prov.userConfirmed) {
      markFieldUserConfirmed(path);
    }
  };

  const tierBorder =
    prov && !prov.userConfirmed
      ? prov.confidence === "medium"
        ? "border-amber-300 focus-within:border-amber-500"
        : prov.confidence === "low"
        ? "border-dashed border-muted-foreground/40"
        : "border-border"
      : "border-border";

  return (
    <div className={cn("space-y-1", className)} dir={dir}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-muted-foreground">{label}</label>
        {prov && (
          <SourcePill
            provenance={prov}
            confirmed={prov.userConfirmed}
            onUndo={() => {
              undoFieldMining(path);
              onChange("");
            }}
          />
        )}
      </div>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 rounded-xl bg-card text-sm text-foreground border-2 transition-colors focus:outline-none focus:border-primary",
          tierBorder
        )}
      />
    </div>
  );
}
