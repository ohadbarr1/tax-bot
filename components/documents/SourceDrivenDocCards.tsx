"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  FileText,
  Briefcase,
  Home,
  UserCheck,
  TrendingUp,
  Bitcoin,
  ShieldCheck,
  Globe,
  HelpCircle,
} from "lucide-react";
import { useApp } from "@/lib/appContext";
import {
  docsForSources,
  sourceById,
  type SourceCatalogEntry,
  type SourceDocRequest,
} from "@/lib/sourceCatalog";
import { uploadUserDocument } from "@/lib/firebase/storage";
import type {
  IncomeSourceId,
  VaultDocMeta,
  VaultDocType,
  VaultDocStatus,
  DocMineResponse,
  IbkrParseResponse,
} from "@/types";
import { cn } from "@/lib/utils";

// ─── Icon resolver ──────────────────────────────────────────────────────────

const ICON_MAP: Record<SourceCatalogEntry["iconName"], typeof Briefcase> = {
  Briefcase,
  Home,
  UserCheck,
  TrendingUp,
  Bitcoin,
  ShieldCheck,
  Globe,
  HelpCircle,
};

function SourceIcon({ iconName, className }: { iconName: SourceCatalogEntry["iconName"]; className?: string }) {
  const Icon = ICON_MAP[iconName] ?? FileText;
  return <Icon className={className} />;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function acceptForType(type: VaultDocType): string {
  if (type === "ibkr") return ".csv,text/csv";
  return ".pdf,image/*";
}

function storageKindForType(type: VaultDocType): "form-106" | "form-867" | "ibkr" | "other" {
  if (type === "form106") return "form-106";
  if (type === "form867") return "form-867";
  if (type === "ibkr") return "ibkr";
  return "other";
}

/** Hebrew status label for display badges. */
function statusLabel(status?: VaultDocStatus): string {
  switch (status) {
    case "mined":          return "נותח";
    case "mining":         return "מנתח...";
    case "uploaded":       return "הועלה";
    case "failed":         return "נדחה";
    case "pending_upload": return "ממתין להעלאה";
    default:               return "ממתין להעלאה";
  }
}

/** Badge colour classes keyed on status. */
function statusClasses(status?: VaultDocStatus): string {
  switch (status) {
    case "mined":   return "bg-emerald-100 text-emerald-800";
    case "mining":  return "bg-blue-100 text-blue-800";
    case "uploaded": return "bg-sky-100 text-sky-800";
    case "failed":  return "bg-red-100 text-red-800";
    default:        return "bg-amber-100 text-amber-800";
  }
}

/** Status icon component */
function StatusIcon({ status }: { status?: VaultDocStatus }) {
  switch (status) {
    case "mined":   return <CheckCircle2 className="w-3.5 h-3.5" />;
    case "mining":  return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    case "failed":  return <AlertCircle className="w-3.5 h-3.5" />;
    default:        return <Clock className="w-3.5 h-3.5" />;
  }
}

/**
 * For a given doc request and the user's selected sources, find which
 * sources require this doc type.
 */
function sourcesForDoc(selected: IncomeSourceId[], req: SourceDocRequest): IncomeSourceId[] {
  return selected.filter((sid) => {
    const cat = sourceById(sid);
    return cat?.docs.some((d) => d.type === req.type);
  });
}

/**
 * Find a matching document in the vault for a given doc request. Matches on
 * type and overlapping sourceIds. Returns the first match (or undefined).
 */
function findMatchingDoc(
  documents: VaultDocMeta[],
  req: SourceDocRequest,
  sources: IncomeSourceId[],
): VaultDocMeta | undefined {
  const relevantSources = sourcesForDoc(sources, req);
  return documents.find((doc) => {
    if (doc.type !== req.type) return false;
    // If the doc has sourceIds, check for overlap with relevant sources
    if (doc.sourceIds && doc.sourceIds.length > 0) {
      return doc.sourceIds.some((sid) => relevantSources.includes(sid));
    }
    // If no sourceIds on the doc, match by type alone
    return true;
  });
}

/** Extract a human-readable summary from parsed payload. */
function parsedSummary(doc: VaultDocMeta): string | undefined {
  if (!doc.parsedPayload) return undefined;
  if (doc.parsedPayload.kind === "form106") {
    const d = doc.parsedPayload.data;
    return [
      `${d.employerName}`,
      `${"\u20AA"}${d.grossSalary.toLocaleString("he-IL")} ברוטו`,
      `${"\u20AA"}${d.taxWithheld.toLocaleString("he-IL")} מס`,
    ].join(" \u00b7 ");
  }
  if (doc.parsedPayload.kind === "ibkr") {
    const d = doc.parsedPayload.data;
    return [
      `$${d.totalProfitUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })} \u05E8\u05D5\u05D5\u05D7`,
      `$${d.totalLossUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })} \u05D4\u05E4\u05E1\u05D3`,
    ].join(" \u00b7 ");
  }
  return undefined;
}

// ─── Local upload state ─────────────────────────────────────────────────────

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

// ─── Main component ─────────────────────────────────────────────────────────

export function SourceDrivenDocCards() {
  const {
    state,
    addDocument,
    updateDocumentStatus,
    applyMiningResult,
    updateTaxpayerAndRecalculate,
  } = useApp();

  const sources = state.onboarding?.sources ?? [];
  const documents = state.documents ?? [];

  // Per-docType local upload state (only for cards where user triggers an upload)
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});

  const setUpload = (key: string, s: UploadState) =>
    setUploadStates((prev) => ({ ...prev, [key]: s }));

  // ── Upload handler (mirrors DocRequestPanel logic) ──────────────────────

  const handleUpload = useCallback(
    async (req: SourceDocRequest, file: File) => {
      const docId = `doc-${Date.now()}`;
      const meta: VaultDocMeta = {
        id: docId,
        name: file.name,
        type: req.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        status: "mining",
        sourceIds: sourcesForDoc(sources, req),
      };
      addDocument(meta);
      setUpload(req.type, { kind: "uploading", fileName: file.name });

      const uploadPromise = uploadUserDocument(file, storageKindForType(req.type), file.name);

      try {
        if (req.type === "ibkr") {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/parse/ibkr", { method: "POST", body: form });
          const json = (await res.json()) as IbkrParseResponse;
          if (!res.ok || !json.success || !json.data) {
            throw new Error(json.error ?? "IBKR parse failed");
          }
          const d = json.data;
          updateTaxpayerAndRecalculate(
            {
              capitalGains: {
                totalRealizedProfit: d.totalRealizedProfit,
                totalRealizedLoss: d.totalRealizedLoss,
                foreignTaxWithheld: d.foreignTaxWithheld,
                dividends: d.dividendsILS,
              },
            },
            { ibkrData: d, hasForeignBroker: true },
          );
          const uploadResult = await uploadPromise;
          updateDocumentStatus(docId, "mined", {
            storagePath: uploadResult?.path,
            downloadUrl: uploadResult?.url,
            parsedPayload: { kind: "ibkr", data: d },
          });
          setUpload(req.type, { kind: "done" });
          return;
        }

        // Default: PDF / image -> Claude-vision miner
        const form = new FormData();
        form.append("file", file);
        form.append("type", req.type);
        const res = await fetch("/api/mine/document", { method: "POST", body: form });
        const json = (await res.json()) as DocMineResponse;
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error ?? "Mining failed");
        }
        applyMiningResult(docId, req.label, json.data.fields);
        const uploadResult = await uploadPromise;
        updateDocumentStatus(docId, "mined", {
          storagePath: uploadResult?.path,
          downloadUrl: uploadResult?.url,
        });
        setUpload(req.type, { kind: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "שגיאה בזיהוי המסמך";
        updateDocumentStatus(docId, "failed", { miningError: msg });
        setUpload(req.type, { kind: "error", message: msg });
      }
    },
    [sources, addDocument, updateDocumentStatus, applyMiningResult, updateTaxpayerAndRecalculate],
  );

  // ── Bail if no sources selected ─────────────────────────────────────────

  if (sources.length === 0) return null;

  const requiredDocs = docsForSources(sources);
  if (requiredDocs.length === 0) return null;

  return (
    <div dir="rtl" className="space-y-3">
      {requiredDocs.map((req) => {
        const matchedDoc = findMatchingDoc(documents, req, sources);
        const localState = uploadStates[req.type];
        const relevantSources = sourcesForDoc(sources, req);
        const firstSource = relevantSources.length > 0 ? sourceById(relevantSources[0]) : undefined;

        return (
          <SourceDocCard
            key={req.type}
            req={req}
            source={firstSource}
            matchedDoc={matchedDoc}
            uploadState={localState}
            onUpload={(file) => handleUpload(req, file)}
          />
        );
      })}
    </div>
  );
}

// ─── Individual card ────────────────────────────────────────────────────────

function SourceDocCard({
  req,
  source,
  matchedDoc,
  uploadState,
  onUpload,
}: {
  req: SourceDocRequest;
  source?: SourceCatalogEntry;
  matchedDoc?: VaultDocMeta;
  uploadState?: UploadState;
  onUpload: (file: File) => void;
}) {
  const hasDoc = !!matchedDoc && matchedDoc.status !== "pending_upload";
  const isMined = matchedDoc?.status === "mined";
  const isFailed = matchedDoc?.status === "failed";
  const isMining = matchedDoc?.status === "mining" || uploadState?.kind === "uploading";

  const summary = matchedDoc ? parsedSummary(matchedDoc) : undefined;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        isMined
          ? "border-emerald-200 bg-emerald-50/40"
          : isFailed
          ? "border-red-200 bg-red-50/30"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Source icon */}
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
          {source ? (
            <SourceIcon iconName={source.iconName} className="w-5 h-5 text-muted-foreground" />
          ) : (
            <FileText className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Source label + doc type */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-foreground">{req.label}</p>
            {source && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                {source.label}
              </span>
            )}
          </div>
          {req.hint && (
            <p className="text-xs text-muted-foreground mt-0.5">{req.hint}</p>
          )}

          {/* Status badge */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
                statusClasses(matchedDoc?.status),
              )}
            >
              <StatusIcon status={matchedDoc?.status} />
              {statusLabel(matchedDoc?.status)}
            </span>

            {/* Upload button — show if no doc uploaded yet or if failed */}
            {(!hasDoc || isFailed) && !isMining && (
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground cursor-pointer hover:opacity-90">
                <Upload className="w-3.5 h-3.5" />
                {isFailed ? "נסה שוב" : "העלאה"}
                <input
                  type="file"
                  accept={acceptForType(req.type)}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                  }}
                />
              </label>
            )}
          </div>

          {/* Mining spinner */}
          {isMining && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              מנתח את המסמך...
            </div>
          )}

          {/* Parse summary */}
          {isMined && summary && (
            <p className="mt-1.5 text-xs text-emerald-800/80 leading-relaxed">{summary}</p>
          )}

          {/* Error message */}
          {isFailed && matchedDoc?.miningError && (
            <p className="mt-1.5 text-xs text-red-700">{matchedDoc.miningError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
