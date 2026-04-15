"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { FolderOpen, FileText } from "lucide-react";
import { DocUploadZone, TYPE_LABELS } from "@/components/documents/DocUploadZone";
import type { ParseStatus, ParseResult } from "@/components/documents/DocUploadZone";
import { useApp } from "@/lib/appContext";
import { uploadUserDocument } from "@/lib/firebase/storage";
import { AuthGate } from "@/components/auth/AuthGate";
import type { VaultDocMeta, VaultDocType, Form106ParseResponse, IbkrParseResponse } from "@/types";

const CATEGORIES: { id: "all" | VaultDocType; label: string }[] = [
  { id: "all",          label: "כל המסמכים" },
  { id: "form106",      label: "טופס 106" },
  { id: "ibkr",        label: "IBKR / ברוקר" },
  { id: "pension",      label: "קרן פנסיה" },
  { id: "form135",      label: "טופס 135" },
  { id: "receipt",      label: "קבלות" },
  { id: "bank_statement", label: "דפי חשבון" },
  { id: "rsu_grant",   label: "RSU / ESPP" },
  { id: "other",        label: "אחר" },
];

export default function DocumentsPage() {
  return (
    <AuthGate>
      <DocumentsPageInner />
    </AuthGate>
  );
}

function DocumentsPageInner() {
  const { state, addDocument, removeDocument, updateDocumentType, updateDocumentStatus, updateTaxpayerAndRecalculate, hydrated } = useApp();

  // Session-only blob URLs — never persisted (blob URLs are tab-lifetime only).
  const [sessionUrls, setSessionUrls] = useState<Map<string, string>>(new Map());
  // Session-only File objects — needed for parsing
  const [sessionFiles, setSessionFiles] = useState<Map<string, File>>(new Map());
  // Parse status per doc
  const [parseStatuses, setParseStatuses] = useState<Map<string, ParseStatus>>(new Map());
  // Parse results per doc
  const [parseResults, setParseResults] = useState<Map<string, ParseResult>>(new Map());

  const revokeUrl = useCallback((id: string) => {
    setSessionUrls((prev) => {
      const next = new Map(prev);
      const url = next.get(id);
      if (url) URL.revokeObjectURL(url);
      next.delete(id);
      return next;
    });
  }, []);

  // Revoke all blob URLs when the component unmounts.
  const sessionUrlsRef = useRef(sessionUrls);
  useEffect(() => { sessionUrlsRef.current = sessionUrls; }, [sessionUrls]);
  useEffect(() => () => {
    sessionUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Rehydrate parse summaries from persisted payloads once AppState loads —
  // turns a freshly-reloaded page into the exact card view the user left.
  useEffect(() => {
    if (!hydrated) return;
    const docs = state.documents ?? [];
    setParseStatuses((prev) => {
      const next = new Map(prev);
      for (const doc of docs) {
        if (doc.parsedPayload && !next.has(doc.id)) next.set(doc.id, "done");
      }
      return next;
    });
    setParseResults((prev) => {
      const next = new Map(prev);
      for (const doc of docs) {
        if (!doc.parsedPayload || next.has(doc.id)) continue;
        if (doc.parsedPayload.kind === "form106") {
          const d = doc.parsedPayload.data;
          next.set(doc.id, {
            summary: [
              `מעסיק: ${d.employerName}`,
              `ברוטו: ₪${d.grossSalary.toLocaleString("he-IL")}`,
              `מס שנוכה: ₪${d.taxWithheld.toLocaleString("he-IL")}`,
              `פנסיה: ₪${d.pensionDeduction.toLocaleString("he-IL")}`,
              `חודשים: ${d.monthsWorked}`,
            ].join(" · "),
            raw: d,
          });
        } else {
          const d = doc.parsedPayload.data;
          next.set(doc.id, {
            summary: [
              `רווח: $${d.totalProfitUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
              `הפסד: $${d.totalLossUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
              `דיבידנדים: $${d.dividendsUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
              `WHT: $${d.foreignTaxUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
              `שער: ${d.exchangeRate}`,
            ].join(" · "),
            raw: d,
          });
        }
      }
      return next;
    });
  }, [hydrated, state.documents]);

  const [activeCategory, setActiveCategory] = useState<"all" | VaultDocType>("all");

  const docs: VaultDocMeta[] = state.documents ?? [];
  const filtered = activeCategory === "all" ? docs : docs.filter((d) => d.type === activeCategory);

  // ── Parse a file and update state ─────────────────────────────────────────

  const parseDocument = useCallback(async (docId: string, docType: VaultDocType, file: File) => {
    if (docType !== "form106" && docType !== "ibkr") return;

    setParseStatuses((prev) => new Map(prev).set(docId, "parsing"));

    // Upload to Cloud Storage in parallel with parsing — we need the
    // {path, url} result to persist alongside the parsed payload so the
    // document survives page reloads.
    const uploadPromise = uploadUserDocument(
      file,
      docType === "form106" ? "form-106" : "ibkr",
      file.name,
    );

    try {
      const formData = new FormData();
      formData.append("file", file);

      if (docType === "form106") {
        const res = await fetch("/api/parse/form-106", { method: "POST", body: formData });
        const json: Form106ParseResponse = await res.json();
        if (!json.success || !json.data) throw new Error(json.error ?? "parse failed");

        const d = json.data;
        const summary = [
          `מעסיק: ${d.employerName}`,
          `ברוטו: ₪${d.grossSalary.toLocaleString("he-IL")}`,
          `מס שנוכה: ₪${d.taxWithheld.toLocaleString("he-IL")}`,
          `פנסיה: ₪${d.pensionDeduction.toLocaleString("he-IL")}`,
          `חודשים: ${d.monthsWorked}`,
        ].join(" · ");

        setParseResults((prev) => new Map(prev).set(docId, { summary, raw: d }));
        setParseStatuses((prev) => new Map(prev).set(docId, "done"));

        // Update global state — add/replace employer.
        // Dedupe by doc-ID (emp-${docId}), NOT by name: a re-parse of the same
        // document must replace the prior entry even if the new parser ran
        // with a different name extraction, and two real employers that share
        // a name prefix must not collide. Also strip legacy empty-name rows.
        const empId = `emp-${docId}`;
        const cleanExisting = state.taxpayer.employers.filter(
          (e) => e.id !== empId && e.name && e.name.trim().length > 0
        );
        updateTaxpayerAndRecalculate({
          employers: [
            ...cleanExisting,
            {
              id: empId,
              name: d.employerName,
              isMainEmployer: cleanExisting.length === 0,
              monthsWorked: d.monthsWorked,
              grossSalary: d.grossSalary,
              taxWithheld: d.taxWithheld,
              pensionDeduction: d.pensionDeduction,
            },
          ],
        });

        const uploadResult = await uploadPromise;
        updateDocumentStatus(docId, "mined", {
          storagePath: uploadResult?.path,
          downloadUrl: uploadResult?.url,
          parsedPayload: { kind: "form106", data: d },
        });

      } else if (docType === "ibkr") {
        const res = await fetch("/api/parse/ibkr", { method: "POST", body: formData });
        const json: IbkrParseResponse = await res.json();
        if (!json.success || !json.data) throw new Error(json.error ?? "parse failed");

        const d = json.data;
        const summary = [
          `רווח: $${d.totalProfitUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          `הפסד: $${d.totalLossUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          `דיבידנדים: $${d.dividendsUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          `WHT: $${d.foreignTaxUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          `שער: ${d.exchangeRate}`,
        ].join(" · ");

        setParseResults((prev) => new Map(prev).set(docId, { summary, raw: d }));
        setParseStatuses((prev) => new Map(prev).set(docId, "done"));

        // Update global state
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

        const uploadResult = await uploadPromise;
        updateDocumentStatus(docId, "mined", {
          storagePath: uploadResult?.path,
          downloadUrl: uploadResult?.url,
          parsedPayload: { kind: "ibkr", data: d },
        });
      }
    } catch {
      setParseStatuses((prev) => new Map(prev).set(docId, "error"));
    }
  }, [state.taxpayer.employers, updateTaxpayerAndRecalculate, updateDocumentStatus]);

  const handleAdd = useCallback((meta: VaultDocMeta, objectUrl: string, file: File) => {
    addDocument(meta);
    setSessionUrls((prev) => new Map(prev).set(meta.id, objectUrl));
    setSessionFiles((prev) => new Map(prev).set(meta.id, file));
    // Auto-parse if parseable type
    if (meta.type === "form106" || meta.type === "ibkr") {
      parseDocument(meta.id, meta.type, file);
    }
  }, [addDocument, parseDocument]);

  const handleRemove = useCallback((id: string) => {
    removeDocument(id);
    revokeUrl(id);
    setSessionFiles((prev) => { const n = new Map(prev); n.delete(id); return n; });
    setParseStatuses((prev) => { const n = new Map(prev); n.delete(id); return n; });
    setParseResults((prev) => { const n = new Map(prev); n.delete(id); return n; });
  }, [removeDocument, revokeUrl]);

  const handleTypeChange = useCallback((id: string, type: VaultDocType) => {
    updateDocumentType(id, type);
    // If type changed to a parseable type and we have the file, auto-parse
    const file = sessionFiles.get(id);
    if (file && (type === "form106" || type === "ibkr")) {
      parseDocument(id, type, file);
    }
  }, [updateDocumentType, sessionFiles, parseDocument]);

  const handleReparse = useCallback((id: string) => {
    // Called for docs from previous sessions (no File object) — prompt user
    alert("הקובץ שמור ממפגש קודם. אנא העלה אותו מחדש לניתוח.");
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-900 rounded-xl flex items-center justify-center">
          <FolderOpen className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">כספת מסמכים</h1>
          <p className="text-sm text-muted-foreground">
            {docs.length} מסמכים
            {docs.length > 0 && " · נשמרים אוטומטית"}
          </p>
        </div>
      </div>

      {/* Category filter — only show tabs that have docs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.filter((cat) =>
          cat.id === "all" || docs.some((d) => d.type === cat.id)
        ).map((cat) => {
          const count = cat.id === "all" ? docs.length : docs.filter((d) => d.type === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {cat.label}
              {count > 0 && (
                <span className={`px-1 rounded-full text-[10px] ${
                  activeCategory === cat.id
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-background text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload zone */}
      <DocUploadZone
        docs={filtered}
        sessionUrls={sessionUrls}
        parseStatuses={parseStatuses}
        parseResults={parseResults}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onTypeChange={handleTypeChange}
        onReparse={handleReparse}
      />

      {/* Empty state */}
      {docs.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">כספת המסמכים ריקה</p>
          <p className="text-sm text-muted-foreground">
            גרור קבצים או לחץ להעלאה · המסמכים נשמרים אוטומטית
          </p>
        </div>
      )}
    </div>
  );
}
