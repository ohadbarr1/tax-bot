/**
 * lib/pdfDownload.ts — shared client-side PDF download helper
 *
 * Single source of truth for the blob → anchor-click → revoke pattern used
 * to deliver generated tax forms to the user. Lifted verbatim from the
 * original FilingKit.handleDownload so Hero + /filing + FilingKit all call
 * the same code path.
 *
 * Callers derive which form to request via `determineFormType()` (already
 * done inside FilingKit); the helpers accept an explicit {taxpayer, financials,
 * selectedSources?} tuple and resolve the endpoint + filename internally.
 */

import type { Form135Payload, TaxPayer, FinancialData, IncomeSourceId } from "@/types";
import { determineFormType } from "./formTypeSelector";
import { clientFetch, ClientFetchUnauthenticatedError } from "./api/clientFetch";

export type PdfDownloadStatus =
  | { kind: "ok"; filename: string }
  | { kind: "template_missing"; formType: "135" | "1301" }
  | { kind: "error"; message: string };

export interface PdfDownloadOpts {
  /** Forward the calibration flag for layout-debug overlays. */
  calibrate?: boolean;
  /** Onboarding sources (for 135 vs 1301 resolution). */
  selectedSources?: IncomeSourceId[];
  /** Override auto-detected form type (rare — used when the caller knows). */
  forceFormType?: "135" | "1301";
}

function resolveEndpoint(formType: "135" | "1301") {
  return formType === "1301" ? "/api/generate/form-1301" : "/api/generate/form-135";
}

function resolveFilename(formType: "135" | "1301", calibrate: boolean) {
  const base = formType === "1301" ? "form_1301" : "form_135";
  return calibrate ? `${base}_calibration.pdf` : `${base}_ready.pdf`;
}

/**
 * Request the PDF from the server, trigger a browser download, and return a
 * normalized status. Does not throw — template-missing and network errors are
 * reflected in the returned object so callers can render matching UI.
 */
export async function downloadGeneratedForm(
  taxpayer: TaxPayer,
  financials: FinancialData,
  opts: PdfDownloadOpts = {},
): Promise<PdfDownloadStatus> {
  const formType = opts.forceFormType
    ?? determineFormType(taxpayer, financials, opts.selectedSources).formType;
  const endpoint = resolveEndpoint(formType);
  const calibrate = opts.calibrate ?? false;
  const filename = resolveFilename(formType, calibrate);

  try {
    const payload: Form135Payload & { calibrate?: boolean } = { taxpayer, financials, calibrate };
    // clientFetch attaches the Firebase ID token. Plain fetch here would
    // bypass auth and the server would reject with 401 (regression observed
    // 2026-05-04 — the /filing download button was unusable for every user).
    const res = await clientFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json?.error === "TEMPLATE_MISSING") {
        return { kind: "template_missing", formType };
      }
      // Server-side Zod schema rejects (400 INVALID_INPUT) when the
      // questionnaire isn't complete — surface a Hebrew message that points
      // the user back to the right place rather than a raw status code.
      if (res.status === 400 && json?.error?.code === "INVALID_INPUT") {
        return {
          kind: "error",
          message: "השאלון לא מלא — חזור והשלם את הפרטים האישיים והכלכליים לפני הורדת הטופס.",
        };
      }
      return { kind: "error", message: json?.detail ?? json?.error?.message ?? `שגיאת שרת: ${res.status}` };
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { kind: "ok", filename };
  } catch (err) {
    if (err instanceof ClientFetchUnauthenticatedError) {
      return { kind: "error", message: err.message };
    }
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "אירעה שגיאה. נסה שוב.",
    };
  }
}
