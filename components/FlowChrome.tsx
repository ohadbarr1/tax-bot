"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { useApp } from "@/lib/appContext";
import { Sidebar } from "@/components/Sidebar";
import {
  FLOW_STAGES,
  STAGE_PATH,
  STAGE_LABEL,
  currentStage,
  stageForPath,
  stageIndex,
  canAccess,
} from "@/lib/flowStage";

/**
 * FlowChrome (Loop 2 / R1) — the navigation shell.
 *
 * On a flow route (sources→documents→questionnaire→summary→filing) it renders
 * the gated 5-step STEPPER instead of the old grab-bag sidebar, and enforces the
 * no-skip-ahead guard (deep-linking past the current stage redirects back to it).
 * Off the flow (dashboard hub, settings, etc.) it renders the normal Sidebar.
 */
export function FlowChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, hydrated } = useApp();

  const stage = stageForPath(pathname);

  // Guard: never let the user be on a stage ahead of the current one.
  useEffect(() => {
    if (!stage || !hydrated) return;
    if (!canAccess(state, stage)) {
      router.replace(STAGE_PATH[currentStage(state)]);
    }
  }, [stage, hydrated, state, router]);

  if (!stage) return <Sidebar />;

  const cur = currentStage(state);
  const curIdx = stageIndex(cur);

  return (
    <nav
      aria-label="שלבי ההגשה"
      className="hidden md:flex flex-col gap-1 w-56 shrink-0 border-l border-border bg-card p-4"
      style={{ minHeight: "100vh" }}
    >
      <Link
        href="/dashboard"
        className="text-sm font-bold text-kc-ink mb-4 px-2"
        style={{ textDecoration: "none" }}
      >
        כסף חזרה
      </Link>
      {FLOW_STAGES.map((s, i) => {
        const done = i < curIdx;
        const active = s === stage;
        const reachable = canAccess(state, s);
        const content = (
          <span className="flex items-center gap-2.5">
            <span
              className="flex items-center justify-center rounded-full text-[11px] font-bold"
              style={{
                width: 22,
                height: 22,
                background: active ? "var(--kc-ink)" : done ? "var(--kc-lime)" : "var(--kc-bg-soft)",
                color: active ? "var(--kc-lime)" : done ? "var(--kc-ink)" : "var(--kc-ink-dim)",
              }}
            >
              {done ? <Check size={13} /> : !reachable ? <Lock size={11} /> : i + 1}
            </span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--kc-ink)" : reachable ? "var(--kc-ink-dim)" : "var(--kc-ink-faint, #b8b8b8)",
              }}
            >
              {STAGE_LABEL[s]}
            </span>
          </span>
        );
        return reachable && !active ? (
          <Link key={s} href={STAGE_PATH[s]} className="px-2 py-2 rounded-xl hover:bg-kc-bg-soft transition-colors" style={{ textDecoration: "none" }}>
            {content}
          </Link>
        ) : (
          <div key={s} className="px-2 py-2 rounded-xl" aria-current={active ? "step" : undefined}>
            {content}
          </div>
        );
      })}
    </nav>
  );
}
