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
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json?.error === "TEMPLATE_MISSING") {
        return { kind: "template_missing", formType };
      }
      return { kind: "error", message: json?.detail ?? `שגיאת שרת: ${res.status}` };
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
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "אירעה שגיאה. נסה שוב.",
    };
  }
}
