/**
 * lib/observability/slos.ts — Service Level Objectives.
 *
 * Phase 2 §2.F. UPGRADE_PLAN exit criteria:
 *   - Availability: 99.9% Mar-Apr (filing crunch), 99.5% rest of year.
 *   - p95 form-generate latency < 8s.
 *   - OCR success-rate ≥ 95%.
 *
 * This module is the single source of truth — alerting infra (Cloud Monitoring
 * burn-rate alerts), the public status page, the admin dashboard SLO tile,
 * and the on-call runbook all read from here.
 *
 * Burn-rate math: error budget = (1 - target) × window. A 99.9% monthly target
 * permits ~43.2m of downtime / 30 days. Fast-burn alert fires when 5% of the
 * budget burns in 1h; slow-burn fires when 10% burns in 6h. (Google SRE book
 * "Alerting on SLOs", §5.1.)
 */

export interface Slo {
  /** Stable id for dashboarding + alert routing. */
  id: string;
  /** Human label (Hebrew or English; surface as-is in admin UI). */
  label: string;
  /** Target value (0-1 for ratio; ms for latency). */
  target: number;
  /** Unit ("ratio" | "ms"). */
  unit: "ratio" | "ms";
  /** Aggregation window (e.g. "30d", "p95"). */
  window: string;
  /** Drives alert routing — critical pages on-call; warning emails. */
  severity: "critical" | "warning";
}

/**
 * Filing-season window (inclusive). UPGRADE_PLAN: tighter SLOs Mar 1 → Apr 30.
 * Outside this window, the relaxed targets apply.
 */
export function isFilingSeason(now: Date = new Date()): boolean {
  const m = now.getUTCMonth(); // 0-11
  return m === 2 || m === 3; // March (2) + April (3)
}

const AVAILABILITY_FILING = 0.999;
const AVAILABILITY_OFFSEASON = 0.995;

export function currentAvailabilityTarget(now: Date = new Date()): number {
  return isFilingSeason(now) ? AVAILABILITY_FILING : AVAILABILITY_OFFSEASON;
}

export const SLOS: readonly Slo[] = [
  {
    id: "availability",
    label: "Availability (rolling 30d)",
    target: AVAILABILITY_OFFSEASON, // see currentAvailabilityTarget for season-aware
    unit: "ratio",
    window: "30d",
    severity: "critical",
  },
  {
    id: "p95_form_generate_ms",
    label: "Form generation p95 latency",
    target: 8000,
    unit: "ms",
    window: "p95 over 1h",
    severity: "warning",
  },
  {
    id: "ocr_success_rate",
    label: "Form 106 OCR success rate",
    target: 0.95,
    unit: "ratio",
    window: "rolling 24h",
    severity: "warning",
  },
  {
    id: "advisor_p95_ms",
    label: "Advisor reply p95 latency",
    target: 12000,
    unit: "ms",
    window: "p95 over 1h",
    severity: "warning",
  },
] as const;

/**
 * Public, JSON-safe snapshot for /api/health and the status page.
 */
export function publicSloSnapshot(now: Date = new Date()): {
  filing_season: boolean;
  availability_target: number;
  slos: Slo[];
} {
  return {
    filing_season: isFilingSeason(now),
    availability_target: currentAvailabilityTarget(now),
    slos: SLOS.map((s) =>
      s.id === "availability" ? { ...s, target: currentAvailabilityTarget(now) } : s,
    ),
  };
}
