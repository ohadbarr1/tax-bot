"use client";
import { useCallback } from "react";
import { Upload, File, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VaultDocMeta, VaultDocType } from "@/types";

export type { VaultDocMeta };

export const TYPE_LABELS: Record<VaultDocType, string> = {
  form106:       "טופס 106",
  form135:       "טופס 135",
  ibkr:          "IBKR / ברוקר",
  pension:       "קרן פנסיה",
  receipt:       "קבלה",
  bank_statement:"דף חשבון",
  rsu_grant:     "RSU / ESPP",
  other:         "אחר",
};

// All selectable types in the dropdown (same set, ordered nicely)
const TYPE_OPTIONS: VaultDocType[] = [
  "form106", "ibkr", "pension", "form135",
  "receipt", "bank_statement", "rsu_grant", "other",
];

interface DocUploadZoneProps {
  /** Persisted metadata docs (no blob URLs) */
  docs: VaultDocMeta[];
  /** Session-only blob URLs for current-session previews */
  sessionUrls: Map<string, string>;
  onAdd: (meta: VaultDocMeta, objectUrl: string) => void;
  onRemove: (id: string) => void;
  onTypeChange: (id: string, type: VaultDocType) => void;
}

export function DocUploadZone({ docs, sessionUrls, onAdd, onRemove, onTypeChange }: DocUploadZoneProps) {
  const processFile = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const meta: VaultDocMeta = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      type: guessDocType(file.name, file.type),
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    onAdd(meta, objectUrl);
  }, [onAdd]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
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
          "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center">
          <Upload className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">גרור קבצים לכאן</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, CSV · עד 20MB לקובץ</p>
        </div>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.csv"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </label>

      {/* File list */}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => {
            const sessionUrl = sessionUrls.get(doc.id);
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
                <div className="w-9 h-9 bg-muted rounded-xl flex items-center justify-center shrink-0">
                  <File className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatSize(doc.size)}</span>
                    {/* Type selector — always editable */}
                    <select
                      value={doc.type}
                      onChange={(e) => onTypeChange(doc.id, e.target.value as VaultDocType)}
                      className="text-xs px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    {!sessionUrl && (
                      <span className="text-[10px] text-muted-foreground/60">· שמור ·</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 shrink-0">
                  {sessionUrl && (
                    <a
                      href={sessionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                      title="פתח קובץ"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  )}
                  <button
                    onClick={() => onRemove(doc.id)}
                    className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                    title="מחק"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Guess document type from filename and MIME type.
 * Uses multiple signals — filename keywords, extensions, MIME — in priority order.
 * Falls through to "other" only when nothing matches.
 */
function guessDocType(filename: string, mimeType: string): VaultDocType {
  const lower = filename.toLowerCase();

  // CSV → almost always IBKR / broker export
  if (lower.endsWith(".csv") || mimeType === "text/csv") return "ibkr";

  // Form numbers in filename
  if (/\b106\b/.test(lower)) return "form106";
  if (/\b135\b/.test(lower)) return "form135";

  // Broker / brokerage keywords
  if (/ibkr|interactive|broker|activity.?statement|trade/.test(lower)) return "ibkr";

  // Pension / provident fund keywords (Hebrew & English)
  if (/pension|פנסיה|גמל|השתלמות|provident|phoenix|מגדל|מנורה|הפניקס|כלל|הראל/.test(lower)) return "pension";

  // RSU / equity keywords
  if (/rsu|espp|grant|equity|vesting|morgan.?stanley|etrade|schwab/.test(lower)) return "rsu_grant";

  // Bank keywords
  if (/bank|חשבון|mizrahi|hapoalim|leumi|discount|fibi|יורובנק/.test(lower)) return "bank_statement";

  // Receipt keywords
  if (/receipt|קבלה|invoice|חשבונית/.test(lower)) return "receipt";

  // Hebrew "106" alternate spellings
  if (/טופס.?106|106.?טופס/.test(lower)) return "form106";

  return "other";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
