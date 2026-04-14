"use client";
import { useCallback } from "react";
import { Upload, File, Trash2, ExternalLink, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
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

export type ParseStatus = "idle" | "parsing" | "done" | "error";

export interface ParseResult {
  summary: string;     // short human-readable summary shown on card
  raw: unknown;        // raw parsed data (for parent to pass to context)
}

interface DocUploadZoneProps {
  /** Persisted metadata docs (no blob URLs) */
  docs: VaultDocMeta[];
  /** Session-only blob URLs for current-session previews */
  sessionUrls: Map<string, string>;
  /** Per-doc parse status */
  parseStatuses: Map<string, ParseStatus>;
  /** Per-doc parse result summary */
  parseResults: Map<string, ParseResult>;
  onAdd: (meta: VaultDocMeta, objectUrl: string, file: File) => void;
  onRemove: (id: string) => void;
  onTypeChange: (id: string, type: VaultDocType) => void;
  /** Triggered when user clicks "parse" on a doc without a session file */
  onReparse: (id: string) => void;
}

export function DocUploadZone({ docs, sessionUrls, parseStatuses, parseResults, onAdd, onRemove, onTypeChange, onReparse }: DocUploadZoneProps) {
  const processFile = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const meta: VaultDocMeta = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      type: guessDocType(file.name, file.type),
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    onAdd(meta, objectUrl, file);
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
            const parseStatus = parseStatuses.get(doc.id) ?? "idle";
            const parseResult = parseResults.get(doc.id);
            const canParse = doc.type === "form106" || doc.type === "ibkr";
            return (
              <div key={doc.id} className="flex flex-col gap-1.5 p-3 bg-card border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-muted rounded-xl flex items-center justify-center shrink-0">
                    <File className="w-4 h-4 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
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

                  <div className="flex gap-1 shrink-0 items-center">
                    {/* Parse status icon */}
                    {parseStatus === "parsing" && (
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    )}
                    {parseStatus === "done" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    )}
                    {parseStatus === "error" && (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                    )}
                    {/* Re-parse button for saved docs (no session file) */}
                    {canParse && !sessionUrl && parseStatus !== "parsing" && (
                      <button
                        onClick={() => onReparse(doc.id)}
                        className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                        title="נתח מחדש"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
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

                {/* Parsed data summary */}
                {parseStatus === "done" && parseResult && (
                  <div className="mr-12 px-3 py-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 rounded-lg text-xs text-green-800 dark:text-green-300 leading-relaxed">
                    {parseResult.summary}
                  </div>
                )}
                {parseStatus === "error" && (
                  <div className="mr-12 px-3 py-2 bg-destructive/5 border border-destructive/20 rounded-lg text-xs text-destructive leading-relaxed">
                    לא ניתן לנתח את הקובץ אוטומטית. בדוק שהקובץ תקין ונסה שוב.
                  </div>
                )}
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
