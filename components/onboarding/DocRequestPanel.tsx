"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { docsForSources, sourceById, type SourceDocRequest } from "@/lib/sourceCatalog";
import { useApp } from "@/lib/appContext";
import { uploadUserDocument } from "@/lib/firebase/storage";
import type {
  IncomeSourceId,
  DocMineResponse,
  IbkrParseResponse,
  VaultDocMeta,
  VaultDocType,
} from "@/types";
import { cn } from "@/lib/utils";

/**
 * Mapping doc type → HTML <input accept=""> string. IBKR activity statements
 * are always CSV; Form 106 / form 867 / pension / receipt arrive as PDF or
 * scanned images. Keeping this in one place so both the idle and retry
 * buttons stay in sync.
 */
function acceptForType(type: VaultDocType): string {
  if (type === "ibkr") return ".csv,text/csv";
  return ".pdf,image/*";
}

/** Storage kind used when uploading the raw blob to Cloud Storage. */
function storageKindForType(type: VaultDocType): "form-106" | "form-867" | "ibkr" | "other" {
  if (type === "form106") return "form-106";
  if (type === "form867") return "form-867";
  if (type === "ibkr") return "ibkr";
  return "other";
}

/**
 * DocRequestPanel — second screen of onboarding.
 *
 * Given the selected income sources, renders one upload card per required
 * document type. Each card supports three states:
 *   - idle: drag/drop or click to upload
 *   - mining: spinner + "אני קוראת את המסמך..."
 *   - mined: green check + extracted summary
 *   - failed: red tone + retry button
 *   - deferred ("I'll upload later"): soft placeholder card — first-class state,
 *     not a skip. Written to state.documents with status: "pending_upload" so
 *     the later-state reminder system can nudge the user.
 *
 * On successful mining, the result is passed to applyMiningResult() which
 * both writes the fields AND recalculates the tax engine — so the LiveRefundCounter
 * updates in real time as docs land.
 */

type CardState =
  | { kind: "idle" }
  | { kind: "mining"; docId: string; fileName: string }
  | { kind: "mined"; docId: string; fileName: string; summary?: string }
  | { kind: "failed"; error: string; fileName: string }
  | { kind: "deferred"; docId: string };

interface Props {
  sources: IncomeSourceId[];
  onComplete: () => void;
  onBack: () => void;
}

export function DocRequestPanel({ sources, onComplete, onBack }: Props) {
  const { addDocument, updateDocumentStatus, applyMiningResult, updateTaxpayerAndRecalculate } = useApp();
  const docs = docsForSources(sources);
  const [cards, setCards] = useState<Record<string, CardState>>({});

  const setCard = (docType: string, state: CardState) =>
    setCards((prev) => ({ ...prev, [docType]: state }));

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
      setCard(req.type, { kind: "mining", docId, fileName: file.name });

      // Persist the raw blob to Cloud Storage in parallel with parsing so it
      // survives a page reload / re-login. Returns null when Firebase is
      // unconfigured — callers treat that as "in-memory only", no failure.
      const uploadPromise = uploadUserDocument(file, storageKindForType(req.type), file.name);

      try {
        // IBKR activity statements are CSV, not vision-capable — route them
        // through the dedicated CSV parser, which returns structured IbkrData
        // we fold into financials directly (no Claude vision call).
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
            { ibkrData: d, hasForeignBroker: true }
          );

          const summary = `IBKR: רווח $${d.totalProfitUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })} · הפסד $${d.totalLossUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
          const uploadResult = await uploadPromise;
          updateDocumentStatus(docId, "mined", {
            storagePath: uploadResult?.path,
            downloadUrl: uploadResult?.url,
            parsedPayload: { kind: "ibkr", data: d },
          });
          setCard(req.type, { kind: "mined", docId, fileName: file.name, summary });
          return;
        }

        // Default path: PDFs and images → Claude-vision miner.
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
        setCard(req.type, {
          kind: "mined",
          docId,
          fileName: file.name,
          summary: json.data.summary,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "שגיאה בזיהוי המסמך";
        updateDocumentStatus(docId, "failed", { miningError: msg });
        setCard(req.type, { kind: "failed", error: msg, fileName: file.name });
      }
    },
    [addDocument, applyMiningResult, updateDocumentStatus, updateTaxpayerAndRecalculate, sources]
  );

  const handleDefer = (req: SourceDocRequest) => {
    const docId = `doc-defer-${Date.now()}`;
    const meta: VaultDocMeta = {
      id: docId,
      name: req.label,
      type: req.type,
      size: 0,
      uploadedAt: new Date().toISOString(),
      status: "pending_upload",
      sourceIds: sourcesForDoc(sources, req),
    };
    addDocument(meta);
    setCard(req.type, { kind: "deferred", docId });
  };

  const atLeastOneSettled = Object.values(cards).some(
    (c) => c.kind === "mined" || c.kind === "deferred" || c.kind === "failed"
  );

  if (docs.length === 0) {
    return (
      <div dir="rtl" className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">בואו נעבור לפרטים</h1>
        <p className="text-sm text-muted-foreground mb-8">
          אין מסמכים נדרשים — נמשיך לדף הפרטים שלך.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground"
          >
            → חזרה
          </button>
          <button
            onClick={onComplete}
            className="px-6 py-3 rounded-xl bg-amber-500 text-stone-950 font-bold"
          >
            המשך לפרטים
          </button>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-2">
        בואו נתעד את זה
      </h1>
      <p className="text-sm text-muted-foreground text-center mb-8">
        העלו את המסמכים שיש לכם — אני אמלא את הפרטים אוטומטית. מה שאין עדיין, אפשר לדחות.
      </p>

      <div className="space-y-3">
        {docs.map((req) => (
          <DocCard
            key={req.type}
            req={req}
            state={cards[req.type] ?? { kind: "idle" }}
            onUpload={(f) => handleUpload(req, f)}
            onDefer={() => handleDefer(req)}
          />
        ))}
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground"
        >
          → חזרה
        </button>
        <button
          onClick={onComplete}
          disabled={!atLeastOneSettled}
          className={cn(
            "flex-1 px-6 py-3 rounded-xl font-bold transition-opacity",
            atLeastOneSettled
              ? "bg-amber-500 text-stone-950 hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          המשך לפרטים
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sourcesForDoc(
  selected: IncomeSourceId[],
  req: SourceDocRequest
): IncomeSourceId[] {
  return selected.filter((sid) => {
    const cat = sourceById(sid);
    return cat?.docs.some((d) => d.type === req.type);
  });
}

// ─── DocCard ─────────────────────────────────────────────────────────────────

function DocCard({
  req,
  state,
  onUpload,
  onDefer,
}: {
  req: SourceDocRequest;
  state: CardState;
  onUpload: (file: File) => void;
  onDefer: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <motion.div
      layout
      onPaste={onPaste}
      tabIndex={0}
      className={cn(
        "rounded-2xl border-2 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary",
        state.kind === "mined"
          ? "border-emerald-300 bg-emerald-50/50"
          : state.kind === "deferred"
          ? "border-amber-300 bg-amber-50/50 border-dashed"
          : state.kind === "failed"
          ? "border-red-300 bg-red-50/30"
          : dragOver
          ? "border-primary bg-primary/5"
          : "border-border bg-card"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{req.label}</p>
          {req.hint && <p className="text-xs text-muted-foreground mt-0.5">{req.hint}</p>}

          <AnimatePresence mode="wait">
            {state.kind === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex gap-2"
              >
                <label className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground cursor-pointer hover:opacity-90">
                  <Upload className="w-3.5 h-3.5" />
                  העלאה
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
                <button
                  onClick={onDefer}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                >
                  <Clock className="w-3.5 h-3.5" />
                  אעלה אחר כך
                </button>
              </motion.div>
            )}

            {state.kind === "mining" && (
              <motion.div
                key="mining"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                קוראת את המסמך... ({state.fileName})
              </motion.div>
            )}

            {state.kind === "mined" && (
              <motion.div
                key="mined"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3"
              >
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  זוהה בהצלחה
                </div>
                {state.summary && (
                  <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">{state.summary}</p>
                )}
              </motion.div>
            )}

            {state.kind === "failed" && (
              <motion.div
                key="failed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3"
              >
                <div className="flex items-center gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  {state.error}
                </div>
                <label className="inline-flex mt-2 items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white cursor-pointer hover:opacity-90">
                  נסה שוב
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
              </motion.div>
            )}

            {state.kind === "deferred" && (
              <motion.div
                key="deferred"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 text-xs text-amber-800 flex items-center gap-2"
              >
                <Clock className="w-3.5 h-3.5" />
                נדחה — תוכלו להעלות מאוחר יותר מהדף הראשי
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
