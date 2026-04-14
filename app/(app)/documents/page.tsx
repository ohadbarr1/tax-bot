"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { FolderOpen, FileText } from "lucide-react";
import { DocUploadZone, TYPE_LABELS } from "@/components/documents/DocUploadZone";
import { useApp } from "@/lib/appContext";
import type { VaultDocMeta, VaultDocType } from "@/types";

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
  const { state, addDocument, removeDocument, updateDocumentType, hydrated } = useApp();

  // Session-only blob URLs — never persisted (blob URLs are tab-lifetime only).
  // A Map from doc id → objectUrl.
  const [sessionUrls, setSessionUrls] = useState<Map<string, string>>(new Map());
  // Revoke URLs of removed docs to avoid memory leaks.
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

  const [activeCategory, setActiveCategory] = useState<"all" | VaultDocType>("all");

  const docs: VaultDocMeta[] = state.documents ?? [];
  const filtered = activeCategory === "all" ? docs : docs.filter((d) => d.type === activeCategory);

  const handleAdd = useCallback((meta: VaultDocMeta, objectUrl: string) => {
    addDocument(meta);
    setSessionUrls((prev) => new Map(prev).set(meta.id, objectUrl));
  }, [addDocument]);

  const handleRemove = useCallback((id: string) => {
    removeDocument(id);
    revokeUrl(id);
  }, [removeDocument, revokeUrl]);

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
        onAdd={handleAdd}
        onRemove={handleRemove}
        onTypeChange={updateDocumentType}
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
