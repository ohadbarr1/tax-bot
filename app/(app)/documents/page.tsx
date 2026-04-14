"use client";
import { useState } from "react";
import { FolderOpen, FileText } from "lucide-react";
import { DocUploadZone } from "@/components/documents/DocUploadZone";
import type { VaultDoc } from "@/components/documents/DocUploadZone";

const CATEGORIES = [
  { id: "all", label: "כל המסמכים" },
  { id: "form106", label: "טופס 106" },
  { id: "form135", label: "טופס 135" },
  { id: "receipt", label: "קבלות" },
  { id: "bank_statement", label: "דפי חשבון" },
  { id: "rsu_grant", label: "RSU/ESPP" },
  { id: "other", label: "אחר" },
] as const;

export default function DocumentsPage() {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filtered = activeCategory === "all" ? docs : docs.filter((d) => d.type === activeCategory);

  const addDoc = (doc: VaultDoc) => setDocs((prev) => [...prev, doc]);
  const removeDoc = (id: string) => setDocs((prev) => {
    const doc = prev.find((d) => d.id === id);
    if (doc) URL.revokeObjectURL(doc.objectUrl);
    return prev.filter((d) => d.id !== id);
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-900 rounded-xl flex items-center justify-center">
          <FolderOpen className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">כספת מסמכים</h1>
          <p className="text-sm text-muted-foreground">{docs.length} מסמכים · שמורים מקומית</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {cat.label}
            {cat.id === "all" && docs.length > 0 && (
              <span className="mr-1 bg-primary-foreground/20 text-primary-foreground px-1 rounded-full text-[10px]">
                {docs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upload zone */}
      <DocUploadZone docs={filtered} onAdd={addDoc} onRemove={removeDoc} />

      {/* Empty state */}
      {docs.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">כספת המסמכים ריקה</p>
          <p className="text-sm text-muted-foreground">העלה מסמכים כדי להתחיל</p>
        </div>
      )}
    </div>
  );
}
