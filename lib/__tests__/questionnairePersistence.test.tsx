/**
 * Closes audit finding `user-flow-1.3`:
 *   "Refresh during the questionnaire silently destroys in-progress answers."
 *
 * The questionnaire context used to write to AppContext (and therefore
 * Firestore) only inside `handleFinish`. A refresh, tab-close, or wifi blip
 * mid-flow nuked every field the user had typed. The fix mirrors the canonical
 * AppContext debounced-persistence pattern (`appContext.tsx:269-274`) — every
 * state mutation in the questionnaire slice is mirrored into AppContext on a
 * 500ms debounce; AppContext then runs its own 500ms debounce to Firestore.
 *
 * These tests assert:
 *   1. typing into Step 0 fields (`firstName`, `idNumber`, `bank.account`)
 *      eventually calls `updateTaxpayer` with the new values within ≤ 500ms;
 *   2. simulating a "page refresh" by re-mounting `<QuestionnaireProvider>`
 *      with AppContext state set to the values previously persisted re-hydrates
 *      the questionnaire local state correctly.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QuestionnaireProvider, useQuestionnaire } from "../questionnaireContext";
import { INITIAL_TAXPAYER, INITIAL_FINANCIALS } from "../initialState";
import type { TaxPayer, FinancialData, AppState } from "@/types";

// ─── Stub useApp() ────────────────────────────────────────────────────────────
//
// QuestionnaireProvider depends on useApp() for the `state.taxpayer`,
// `state.financials`, and the writers `updateTaxpayer`, `updateFinancials`,
// `completeQuestionnaire`. We give it a hand-rolled stub so tests don't have to
// boot the whole AppProvider stack (which transitively pulls in Firebase auth,
// IndexedDB, the calc engine, etc.).

type AppStub = {
  state: { taxpayer: TaxPayer; financials: FinancialData } & Partial<AppState>;
  updateTaxpayer: (data: Partial<TaxPayer>) => void;
  updateFinancials: (data: Partial<FinancialData>) => void;
  completeQuestionnaire: () => void;
};

let appStub: AppStub;

vi.mock("../appContext", () => ({
  useApp: () => appStub,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAppStub(initial?: {
  taxpayer?: Partial<TaxPayer>;
  financials?: Partial<FinancialData>;
}): AppStub {
  return {
    state: {
      taxpayer: { ...INITIAL_TAXPAYER, ...(initial?.taxpayer ?? {}) } as TaxPayer,
      financials: {
        ...INITIAL_FINANCIALS,
        ...(initial?.financials ?? {}),
      } as FinancialData,
    },
    updateTaxpayer: vi.fn(),
    updateFinancials: vi.fn(),
    completeQuestionnaire: vi.fn(),
  };
}

/**
 * A test-only consumer that exposes the questionnaire context value via a ref,
 * so the test body can drive the setters directly. This mirrors the way
 * `Step{0..7}*.tsx` consume the context — the setters are the public surface.
 */
function ContextProbe({
  onMount,
}: {
  onMount: (ctx: ReturnType<typeof useQuestionnaire>) => void;
}) {
  const ctx = useQuestionnaire();
  // Run on every render so tests can grab the latest setters/state.
  React.useEffect(() => {
    onMount(ctx);
  });
  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("QuestionnaireProvider — partial-draft persistence (user-flow-1.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    appStub = makeAppStub();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces Step 0 edits and calls updateTaxpayer within ≤500ms", async () => {
    let captured: ReturnType<typeof useQuestionnaire> | null = null;

    render(
      <QuestionnaireProvider>
        <ContextProbe onMount={(ctx) => (captured = ctx)} />
      </QuestionnaireProvider>,
    );

    expect(captured).not.toBeNull();
    // The initial mount should NOT call updateTaxpayer — we only persist on
    // user-driven changes, not the hydration round-trip.
    expect(appStub.updateTaxpayer).not.toHaveBeenCalled();

    // Simulate the user filling Step 0: first name, ID number, bank account.
    act(() => {
      captured!.setFirstName("דוד");
      captured!.setIdNumber("123456782");
      captured!.setBank({
        bankId: "12",
        bankName: "הפועלים",
        branch: "600",
        account: "987654",
      });
    });

    // Before the debounce window elapses, no write should have fired.
    expect(appStub.updateTaxpayer).not.toHaveBeenCalled();

    // Advance just past the 500ms debounce window.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(appStub.updateTaxpayer).toHaveBeenCalled();
    // The most recent call should carry the typed values.
    const lastCall = (appStub.updateTaxpayer as ReturnType<typeof vi.fn>).mock
      .calls.at(-1)!;
    const patch = lastCall[0] as Partial<TaxPayer>;
    expect(patch.firstName).toBe("דוד");
    expect(patch.idNumber).toBe("123456782");
    expect(patch.bank?.account).toBe("987654");
  });

  it("collapses many keystrokes into a single debounced write (≤500ms after the LAST edit)", async () => {
    let captured: ReturnType<typeof useQuestionnaire> | null = null;
    render(
      <QuestionnaireProvider>
        <ContextProbe onMount={(ctx) => (captured = ctx)} />
      </QuestionnaireProvider>,
    );

    // Type one character at a time, with each character arriving inside the
    // 500ms window — the debounce should reset on every keystroke and fire
    // exactly once after the user pauses.
    act(() => captured!.setFirstName("ד"));
    await act(async () => void vi.advanceTimersByTime(200));
    act(() => captured!.setFirstName("דו"));
    await act(async () => void vi.advanceTimersByTime(200));
    act(() => captured!.setFirstName("דוד"));

    // Total elapsed = 400ms; debounce hasn't fired yet.
    expect(appStub.updateTaxpayer).not.toHaveBeenCalled();

    await act(async () => void vi.advanceTimersByTime(500));

    expect(appStub.updateTaxpayer).toHaveBeenCalled();
    const last = (appStub.updateTaxpayer as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect((last[0] as Partial<TaxPayer>).firstName).toBe("דוד");
  });

  it("re-hydrates local state from AppContext on remount (simulating a page refresh)", () => {
    // Wire the stub BEFORE the first mount so QuestionnaireProvider captures
    // a writer that actually mutates appStub.state — mimicking AppContext's
    // setState-then-Firestore-debounce pipeline.
    appStub.updateTaxpayer = vi.fn((patch: Partial<TaxPayer>) => {
      appStub.state.taxpayer = { ...appStub.state.taxpayer, ...patch };
    });

    // ── First mount: user types something. ──────────────────────────────────
    let firstCtx: ReturnType<typeof useQuestionnaire> | null = null;
    const { unmount } = render(
      <QuestionnaireProvider>
        <ContextProbe onMount={(ctx) => (firstCtx = ctx)} />
      </QuestionnaireProvider>,
    );

    act(() => {
      firstCtx!.setFirstName("שרה");
      firstCtx!.setIdNumber("000000018");
      firstCtx!.setBank({
        bankId: "10",
        bankName: "לאומי",
        branch: "800",
        account: "111222",
      });
    });

    act(() => void vi.advanceTimersByTime(500));
    // After this tick, appStub.state.taxpayer must reflect the typed values:
    expect(appStub.state.taxpayer.firstName).toBe("שרה");
    expect(appStub.state.taxpayer.bank?.account).toBe("111222");

    // ── Simulate a page refresh: unmount, then remount with the persisted
    //    AppContext state still in place. The new QuestionnaireProvider should
    //    seed its local state from AppContext, not from a blank slate.
    unmount();

    let secondCtx: ReturnType<typeof useQuestionnaire> | null = null;
    render(
      <QuestionnaireProvider>
        <ContextProbe onMount={(ctx) => (secondCtx = ctx)} />
      </QuestionnaireProvider>,
    );

    expect(secondCtx).not.toBeNull();
    // The hydrated local state should match what was previously persisted —
    // i.e. the user does NOT lose their answers across the refresh.
    expect(secondCtx!.firstName).toBe("שרה");
    expect(secondCtx!.idNumber).toBe("000000018");
    expect(secondCtx!.bank.account).toBe("111222");
    expect(secondCtx!.bank.bankName).toBe("לאומי");
  });

  it("mirrors questionnaire-only state slices to updateFinancials when relevant (Step 3)", async () => {
    let captured: ReturnType<typeof useQuestionnaire> | null = null;
    render(
      <QuestionnaireProvider>
        <ContextProbe onMount={(ctx) => (captured = ctx)} />
      </QuestionnaireProvider>,
    );

    // Step 3: portfolio location → foreign_broker, broker name picked.
    act(() => {
      captured!.setInvestsCapital(true);
      captured!.setPortfolioLocation("foreign_broker");
      captured!.setSelectedBroker("Interactive Brokers");
    });

    await act(async () => void vi.advanceTimersByTime(500));

    expect(appStub.updateFinancials).toHaveBeenCalled();
    const last = (appStub.updateFinancials as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    const patch = last[0] as Partial<FinancialData>;
    expect(patch.hasForeignBroker).toBe(true);
    expect(patch.brokerName).toBe("Interactive Brokers");
  });
});
