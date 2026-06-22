@AGENTS.md

# Deferred-action discipline

[`DEFERRED_ACTIONS.md`](../DEFERRED_ACTIONS.md) at the repo root tracks every "crucial step we agreed to skip" — leaked secrets to rotate, services to provision, half-finished features paused for MVP, broken UX gated on a future phase.

**Rules:**

1. When the user says "skip this", "we'll come back to it", "MVP only", "defer", or otherwise opts out of something that has security, correctness, or visible-UX impact, append an entry to `DEFERRED_ACTIONS.md` **before** moving on. Do not rely on memory or commit messages.
2. Each entry must have: severity (🔴 P0 / 🟠 P1 / 🟡 P2), date logged, why it matters, plan, and a concrete verify step.
3. Read 🔴 P0 entries before any deploy. Read 🟠 P1 entries before any demo.
4. When an action ships, delete its entry — don't strike through. Git history is the audit trail.
5. The user explicitly chose this file as the single source of truth for deferred work. Don't propose alternative tracking (Linear, GitHub Issues, comments) without the user asking.
