// @vitest-environment node
/**
 * lib/__tests__/semanticGolden.test.ts — Phase 1 §1.J semantic golden.
 *
 * Closes audits/qa-release.md §3.1.3 + audits/generation.md §1.13.
 *
 * The legacy `pdfGolden.test.ts` snapshots the input dictionary to
 * `buildForm135Fields(...)` — a coordinate regression in the 135 stamper,
 * a code-swap in `route.ts`, or a `hebrewForPdf` glyph-order regression
 * produces a SEMANTICALLY-WRONG PDF that nevertheless passes pdfGolden.
 * This test fills the gap by:
 *
 *   1. Calling the live `POST /api/generate/form-135` (and `form-1301`)
 *      route handler directly with a known TaxPayer + FinancialData fixture
 *      (auth mocked through `withUser`'s firebase-admin path).
 *   2. Re-extracting the rendered PDF text via `pdf-parse`.
 *   3. Recovering the route's drawn values per page from the tail of the
 *      page's text stream (`lib/pdfReExtract.ts:extractStampedValuesFromPage`).
 *   4. Asserting the per-page values match a checked-in fixture
 *      (`__fixtures__/semanticGolden{135,1301}.expected.json`).
 *
 * Why "stamped per page" instead of "code → value dict":
 *   pdf-parse 2.x emits joined text in stream order, not spatial order, so
 *   stamped values land at the END of each page's text — separated from the
 *   template's printed codes. The proximity-regex approach the brief
 *   originally suggested gets dominated by code-to-code pairs from the
 *   template's column headers (every 3-digit code on the form prints next
 *   to ANOTHER 3-digit code). The per-page tail is the cleanest signal we
 *   can extract without per-glyph coordinates.
 *
 *   Empirically (verified by manually swapping a draw's code target):
 *     - y-shift across pages: caught (value moves to a different
 *       `stampedPerPage[i]` slot — see Form 135 / 1301 §1.J verification
 *       commits).
 *     - DRAW_LIST iteration-order swap: caught (per-page values reorder).
 *     - hebrewForPdf rewrite: caught (Hebrew tokens flip from "דהוא" to
 *       "אוהד" or vice-versa).
 *     - within-page x-only swap of two draws to fields that share an
 *       iteration position: NOT caught — the test pins ORDER, not
 *       positions. Phase 1 §1.D's BiDi work will surface positions through
 *       a future per-glyph extractor.
 *
 * Hebrew/RTL caveat (1.J brief):
 *   `lib/pdfUtils.ts:38-42` `hebrewForPdf()` reverses Unicode codepoints
 *   because pdf-lib has no BiDi. Re-extracting Hebrew therefore returns
 *   reversed strings ("דהוא" instead of "אוהד"). Per the 1.J brief we
 *   choose strategy (a): the expected fixture stores the REVERSED form,
 *   marked with a TODO that 1.D will retire when the BiDi rewrite lands.
 *   This test does NOT modify `lib/pdfUtils.ts`.
 *
 * Determinism:
 *   `buildForm135Fields` reads `new Date()` for the signature line. We pin
 *   the system clock with a minimal `Date` shim per beforeEach (NOT
 *   `vi.useFakeTimers` — that stubs setTimeout / Promise scheduling and
 *   makes pdf-lib's async font load hang).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TaxPayer, FinancialData } from "@/types";
import { reExtractFormPdf } from "../pdfReExtract";

// PDF generation + pdf-parse re-extraction is slow (~5-10s per call). Bump
// the per-test timeout so the suite doesn't false-fail on a cold cache.
const TEST_TIMEOUT_MS = 30_000;

// `pdfUtils.buildForm135Fields` reads `new Date()` for the signatureDate
// stamp. Pin it so the fixture's page-4 signature row is deterministic.
const FROZEN_DATE_ISO = "2026-04-29T12:00:00Z";

// Date pinning helpers — vi.useFakeTimers() also stubs setTimeout / Promise
// scheduling, which makes pdf-lib hang on async font / PDF loads. We only
// need to override the Date constructor + Date.now(), so do it minimally.
const RealDate = globalThis.Date;
function pinDate(iso: string): void {
  const fixed = new RealDate(iso);
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(fixed.getTime());
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }
    static override now(): number {
      return fixed.getTime();
    }
  }
  (globalThis as unknown as { Date: typeof Date }).Date = FakeDate as unknown as typeof Date;
}
function unpinDate(): void {
  (globalThis as unknown as { Date: typeof Date }).Date = RealDate;
}

// ── Auth mock — the route is wrapped in `withUser` which calls
//    `getAdminAuth().verifyIdToken`. We mock the firebase-admin module so
//    the bearer token validates without touching production credentials.
const verifyIdToken = vi.fn().mockResolvedValue({ uid: "test-uid" });
vi.mock("../firebase/admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminFirestore: () => ({
    doc: () => ({
      get: () => Promise.resolve({ exists: false, data: () => undefined }),
    }),
  }),
}));

// ── Fixture: a deterministic TaxPayer + FinancialData. Numeric values are
//    chosen to be UNIQUE across the form so the proximity algorithm never
//    has to disambiguate. Hebrew values are stored in LOGICAL order in the
//    fixture; the rendered PDF will reverse them via `hebrewForPdf` and the
//    expected dict reflects the reversed form.
const FIXTURE_TAXPAYER: TaxPayer = {
  id: "fixture-1j",
  idNumber: "123456782",         // valid TZ check-digit
  spouseId: "987654323",         // valid TZ check-digit
  firstName: "אוהד",
  lastName: "בר",
  fullName: "Ohad Bar - אוהד בר",
  profession: "Software Engineer",
  maritalStatus: "married",
  spouseHasIncome: true,
  children: [],
  degrees: [],
  employers: [
    {
      id: "emp-main",
      name: "Acme Ltd",
      monthsWorked: 12,
      grossSalary: 480000,
      taxWithheld: 96000,
      pensionDeduction: 33600,
      isMainEmployer: true,
    },
    {
      id: "emp-2",
      name: "Side Co",
      monthsWorked: 6,
      grossSalary: 60000,
      taxWithheld: 12000,
      pensionDeduction: 3000,
      isMainEmployer: false,
    },
  ],
  personalDeductions: [
    { id: "d1", type: "donation_sec46", amount: 5000, providerName: "Zaka" },
    { id: "d2", type: "life_insurance_sec45a", amount: 2400, providerName: "Migdal" },
    { id: "d3", type: "pension_sec47", amount: 7200, providerName: "Clal" },
  ],
  lifeEvents: {
    changedJobs: false,
    pulledSeverancePay: false,
    hasForm161: false,
    taxableSeverancePay: 0,
  },
  address: { city: "תל אביב", street: "דיזנגוף", houseNumber: "100" },
  bank: { bankId: "12", bankName: "הפועלים", branch: "123", account: "456789" },
  capitalGains: {
    totalRealizedProfit: 50000,
    totalRealizedLoss: 8000,
    foreignTaxWithheld: 1500,
    dividends: 12000,
  },
} as unknown as TaxPayer;

const FIXTURE_FINANCIALS: FinancialData = {
  taxYears: [2024],
  employersCount: 2,
  hasForeignBroker: true,
  estimatedRefund: 18000,
  insights: [],
  actionItems: [],
} as unknown as FinancialData;

const VALID_BEARER = {
  authorization: "Bearer fixture-token",
  "Content-Type": "application/json",
};

async function postForm(routePath: string, body: unknown): Promise<Response> {
  // Lazy-load the route AFTER vi.mock() registration. Cast through `unknown`
  // to expose the POST symbol the auth wrapper produces.
  const mod =
    routePath === "form-135"
      ? ((await import("@/app/api/generate/form-135/route")) as unknown as {
          POST: (req: Request) => Promise<Response>;
        })
      : ((await import("@/app/api/generate/form-1301/route")) as unknown as {
          POST: (req: Request) => Promise<Response>;
        });
  const req = new Request(`https://example.test/api/generate/${routePath}`, {
    method: "POST",
    headers: VALID_BEARER,
    body: JSON.stringify(body),
  });
  return await mod.POST(req);
}

interface SemanticGoldenFixture {
  /**
   * Stamped values pdf-parse emits at the tail of each page, in stream order.
   * Index 0 = page 1. Hebrew names appear in REVERSED glyph order ("דהוא")
   * because of `pdfUtils.ts:38-42` `hebrewForPdf()`. Phase 1 §1.D will retire
   * the reversal; this fixture's Hebrew entries flip then.
   */
  stampedPerPage: string[][];
  /**
   * 3-digit codes the form template MUST still print somewhere. Catches a
   * `scripts/build-field-map.mjs` denylist regression that drops a known code.
   * Subset of the form's full code set; pin only the codes covered by the
   * draw-list (others are template chrome we don't promise).
   */
  requiredCodes: string[];
}

function loadFixture(name: string): SemanticGoldenFixture {
  const p = join(__dirname, "__fixtures__", name);
  return JSON.parse(readFileSync(p, "utf-8")) as SemanticGoldenFixture;
}

// Discovery mode — set SEMANTIC_GOLDEN_DUMP=1 to print the extracted dict so
// we can rebuild the fixture from a known-good PDF run. Off by default; the
// regular tests use the checked-in fixtures.
const DUMP = !!process.env.SEMANTIC_GOLDEN_DUMP;

describe("Form 135 — semantic golden re-extract (qa-release §3.1.3)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: "test-uid" });
    // Pin the system clock so the route's `new Date()` for the signature
    // line emits the same DD/MM/YYYY across runs. We only mock Date itself,
    // NOT timers (vi.useFakeTimers makes pdf-lib's promise scheduling hang).
    pinDate(FROZEN_DATE_ISO);
  });

  afterEach(() => {
    unpinDate();
  });

  it(
    "rendered PDF re-extracts to the expected code→value dict",
    async () => {
      const res = await postForm("form-135", {
        taxpayer: FIXTURE_TAXPAYER,
        financials: FIXTURE_FINANCIALS,
      });
      expect(res.status, "form-135 should respond 200").toBe(200);
      expect(res.headers.get("content-type")).toContain("application/pdf");

      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.byteLength).toBeGreaterThan(1000);

      const { stampedPerPage, codesSeen } = await reExtractFormPdf(
        bytes,
        "135_2025",
      );

      if (DUMP) {
        // eslint-disable-next-line no-console
        console.log(
          "DUMP_135_STAMPED",
          JSON.stringify(stampedPerPage, null, 2),
        );
        // eslint-disable-next-line no-console
        console.log("DUMP_135_CODES_SEEN", JSON.stringify([...codesSeen].sort()));
      }

      const expected = loadFixture("semanticGolden135.expected.json");
      // The fixture pins TWO things:
      //   a. `stampedPerPage` — the ORDERED list of stamped values per page.
      //      A code-swap or y-shift reorders these; a `hebrewForPdf` rewrite
      //      changes the reversed-glyph form of any Hebrew name.
      //   b. `requiredCodes` — codes the form template MUST still print
      //      (catches a denylist regression in the build-field-map script
      //      that drops a known code).
      expect(stampedPerPage).toEqual(expected.stampedPerPage);
      for (const code of expected.requiredCodes ?? []) {
        expect(
          codesSeen.has(code),
          `code ${code} not seen anywhere on Form 135 (template regression?)`,
        ).toBe(true);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "contains the taxpayer ID 123456782 somewhere in the rendered text",
    async () => {
      const res = await postForm("form-135", {
        taxpayer: FIXTURE_TAXPAYER,
        financials: FIXTURE_FINANCIALS,
      });
      expect(res.status).toBe(200);
      const bytes = Buffer.from(await res.arrayBuffer());
      const { text } = await reExtractFormPdf(bytes, "135_2025");
      expect(text).toContain("123456782");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("Form 1301 — semantic golden re-extract (qa-release §3.1.3)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    verifyIdToken.mockResolvedValue({ uid: "test-uid" });
    // Pin the system clock so the route's `new Date()` for the signature
    // line emits the same DD/MM/YYYY across runs. We only mock Date itself,
    // NOT timers (vi.useFakeTimers makes pdf-lib's promise scheduling hang).
    pinDate(FROZEN_DATE_ISO);
  });

  afterEach(() => {
    unpinDate();
  });

  it(
    "rendered PDF re-extracts to the expected code→value dict",
    async () => {
      const res = await postForm("form-1301", {
        taxpayer: FIXTURE_TAXPAYER,
        financials: FIXTURE_FINANCIALS,
      });
      expect(res.status, "form-1301 should respond 200").toBe(200);
      expect(res.headers.get("content-type")).toContain("application/pdf");

      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.byteLength).toBeGreaterThan(1000);

      const { stampedPerPage, codesSeen } = await reExtractFormPdf(
        bytes,
        "1301_2025",
      );

      if (DUMP) {
        // eslint-disable-next-line no-console
        console.log(
          "DUMP_1301_STAMPED",
          JSON.stringify(stampedPerPage, null, 2),
        );
        // eslint-disable-next-line no-console
        console.log(
          "DUMP_1301_CODES_SEEN",
          JSON.stringify([...codesSeen].sort()),
        );
      }

      const expected = loadFixture("semanticGolden1301.expected.json");
      expect(stampedPerPage).toEqual(expected.stampedPerPage);
      for (const code of expected.requiredCodes ?? []) {
        expect(
          codesSeen.has(code),
          `code ${code} not seen anywhere on Form 1301 (template regression?)`,
        ).toBe(true);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
