"use client";

/**
 * MotionRoot — root <MotionConfig> with `reducedMotion="user"`.
 *
 * Phase 3 §3.A. Honours the OS-level `prefers-reduced-motion` setting across
 * every framer-motion call in the tree without per-component plumbing.
 * Required by IS 5568 / Equal Rights for Persons with Disabilities Act.
 */

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
