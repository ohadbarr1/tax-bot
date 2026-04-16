/**
 * questionnaireSteps.ts — Step configuration for the route-based questionnaire.
 *
 * Each step has a URL slug, numeric ID, Hebrew label, and icon.
 * The [step] dynamic route uses the slug to resolve which component to render.
 */

import {
  IdCard,
  User,
  GraduationCap,
  TrendingUp,
  Briefcase,
  HandCoins,
  CalendarDays,
  Award,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface StepConfig {
  /** URL slug — used in /questionnaire/{slug} */
  slug: string;
  /** 1-based step number */
  id: number;
  /** Hebrew label for step indicator */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
}

export const STEP_CONFIG: StepConfig[] = [
  { slug: "personal",      id: 1, label: "פרטים אישיים",  icon: IdCard },
  { slug: "family",        id: 2, label: "מצב אישי",      icon: User },
  { slug: "education",     id: 3, label: "השכלה",          icon: GraduationCap },
  { slug: "capital",       id: 4, label: "שוק ההון",       icon: TrendingUp },
  { slug: "employers",     id: 5, label: "מעסיקים",        icon: Briefcase },
  { slug: "deductions",    id: 6, label: "ניכויים",        icon: HandCoins },
  { slug: "life-events",   id: 7, label: "אירועי חיים",    icon: CalendarDays },
  { slug: "credit-points", id: 8, label: "נקודות זיכוי",   icon: Award },
];

export const FIRST_SLUG = STEP_CONFIG[0].slug;
export const LAST_STEP_ID = STEP_CONFIG[STEP_CONFIG.length - 1].id;

/** Resolve a URL slug to its step config. Returns undefined if invalid. */
export function getStepBySlug(slug: string): StepConfig | undefined {
  return STEP_CONFIG.find((s) => s.slug === slug);
}

/** Resolve a step ID to its URL slug. */
export function stepToSlug(id: number): string {
  return STEP_CONFIG.find((s) => s.id === id)?.slug ?? FIRST_SLUG;
}

/** Check if a slug is valid. */
export function isValidSlug(slug: string): boolean {
  return STEP_CONFIG.some((s) => s.slug === slug);
}

/** Get the next step's slug (or undefined if last). */
export function nextSlug(currentSlug: string): string | undefined {
  const idx = STEP_CONFIG.findIndex((s) => s.slug === currentSlug);
  return idx >= 0 && idx < STEP_CONFIG.length - 1
    ? STEP_CONFIG[idx + 1].slug
    : undefined;
}

/** Get the previous step's slug (or undefined if first). */
export function prevSlug(currentSlug: string): string | undefined {
  const idx = STEP_CONFIG.findIndex((s) => s.slug === currentSlug);
  return idx > 0 ? STEP_CONFIG[idx - 1].slug : undefined;
}
