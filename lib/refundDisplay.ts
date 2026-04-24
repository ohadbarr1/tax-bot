/**
 * lib/refundDisplay.ts — presentation-layer helper for refund-sign semantics
 *
 * `calculateTax.ts` legitimately produces a negative `netRefund` when the
 * taxpayer owes more than was withheld at source. This helper normalizes that
 * signed number into a consistent label/sign/color for the UI so Hero, Filing,
 * and FilingKit render the same copy (no "החזר" on a debt, no green lime on
 * money-out).
 *
 * Copy decisions (per PM plan T3, round 1):
 *   refund > 0  → "החזר המס המשוער שלך" + lime
 *   refund < 0  → "יתרת מס לתשלום" + coral
 *   refund == 0 → "אין החזר צפוי" + ink-dim
 */

export type RefundTone = "refund" | "debt" | "neutral";

export interface RefundHeadline {
  /** Long headline copy — dashboard pill / filing summary. */
  label: string;
  /** Compact label — filing summary rows. */
  labelCompact: string;
  /** "+" | "-" | "" — caller renders Math.abs(amount) alongside. */
  sign: "+" | "-" | "";
  /** CSS color value — plain color, not a CSS variable, for safe inline use
   *  in styles that can't resolve var() at runtime. Falls back to the
   *  brand tokens (var(--kc-lime) / var(--kc-coral) / var(--kc-ink-dim))
   *  when the caller passes them through className/style. */
  tone: RefundTone;
  /** CSS variable reference suitable for style={{ color: ... }}. */
  colorToken: string;
  /** Math.abs(refund) — caller formats with toLocaleString / currency. */
  amountAbs: number;
  /** True when a service fee should apply (refund > 0). */
  hasRefund: boolean;
}

export function refundHeadline(refund: number | null | undefined): RefundHeadline {
  const r = refund ?? 0;
  if (r > 0) {
    return {
      label: "החזר המס המשוער שלך",
      labelCompact: "החזר משוער",
      sign: "+",
      tone: "refund",
      colorToken: "var(--kc-lime)",
      amountAbs: r,
      hasRefund: true,
    };
  }
  if (r < 0) {
    return {
      label: "יתרת מס לתשלום",
      labelCompact: "לתשלום",
      sign: "-",
      tone: "debt",
      colorToken: "var(--kc-coral)",
      amountAbs: Math.abs(r),
      hasRefund: false,
    };
  }
  return {
    label: "אין החזר צפוי",
    labelCompact: "אין החזר",
    sign: "",
    tone: "neutral",
    colorToken: "var(--kc-ink-dim)",
    amountAbs: 0,
    hasRefund: false,
  };
}
