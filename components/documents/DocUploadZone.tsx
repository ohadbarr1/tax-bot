"use client";
import { useState, useCallback } from "react";
import { Upload, File, Trash2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VaultDoc {
  id: string;
  name: string;
  type: "form106" | "form135" | "receipt" | "bank_statement" | "rsu_grant" | "other";
  size: number;
  uploadedAt: string;
  objectUrl: string;
  tags: string[];
}

const TYPE_LABELS: Record<VaultDoc["type"], string> = {
  form106: "טופס 106",
  form135: "טופס 135",
  receipt: "קבלה",
  bank_statement: "דף חשבון",
  rsu_grant: "RSU/ESPP",
  other: "אחר",
};

interface DocUploadZoneProps {
  docs: VaultDoc[];
  onAdd: (doc: VaultDoc) => void;
  onRemove: (id: string) => void;
}

export function DocUploadZone({ docs, onAdd, onRemove }: DocUploadZoneProps) {
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const doc: VaultDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      type: guessDocType(file.name),
      size: file.size,
      uploadedAt: new Date().toISOString(),
      objectUrl,
      tags: [],
    };
    onAdd(doc);
  }, [onAdd]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  }, [processFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(processFile);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        className={cn(
          "flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all",
          dragging ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center">
          <Upload className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">גרור קבצים לכאן</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG · עד 20MB לקובץ</p>
        </div>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={handleFileInput} className="hidden" />
      </label>

      {/* File list */}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
              <div className="w-9 h-9 bg-muted rounded-xl flex items-center justify-center shrink-0">
                <File className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatSize(doc.size)}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
                    {TYPE_LABELS[doc.type]}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <a href={doc.objectUrl} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                </a>
                <button onClick={() => onRemove(doc.id)}
                  className="p-1.5 hover:bg-danger-500/10 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-danger-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function guessDocType(filename: string): VaultDoc["type"] {
  const lower = filename.toLowerCase();
  if (lower.includes("106")) return "form106";
  if (lower.includes("135")) return "form135";
  if (lower.includes("receipt") || lower.includes("קבלה")) return "receipt";
  if (lower.includes("bank") || lower.includes("חשבון")) return "bank_statement";
  if (lower.includes("rsu") || lower.includes("espp") || lower.includes("grant")) return "rsu_grant";
  return "other";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
