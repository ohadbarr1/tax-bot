"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Image as ImageIcon, FileQuestion } from "lucide-react";
import { authedFetch } from "@/lib/admin/adminFetch";

/**
 * FilePreview — fetches a 5-min V4 signed URL for a storage object and
 * renders either an <img>, a PDF <iframe>, or a download link depending
 * on the content type.
 */
export function FilePreview({
  path,
  contentType,
  name,
}: {
  path: string;
  contentType: string | null;
  name: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadUrl() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/files/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "failed");
      }
      const body = (await res.json()) as { url: string };
      setUrl(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUrl(null);
    setError(null);
  }, [path]);

  const isImage = contentType?.startsWith("image/") ?? false;
  const isPdf = contentType === "application/pdf";

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        {isImage ? (
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
        ) : isPdf ? (
          <FileText className="w-4 h-4 text-muted-foreground" />
        ) : (
          <FileQuestion className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="truncate font-medium text-foreground">{name}</span>
      </div>
      <div className="text-xs text-muted-foreground font-mono truncate">{path}</div>

      {!url && (
        <button
          type="button"
          onClick={loadUrl}
          disabled={loading}
          className="w-full py-2 px-3 rounded-lg border border-border bg-background hover:bg-muted text-sm transition-colors disabled:opacity-60"
        >
          {loading ? "טוען…" : "טען תצוגה מקדימה"}
        </button>
      )}

      {url && isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="w-full rounded-lg border border-border" />
      )}
      {url && isPdf && (
        <iframe
          src={url}
          title={name}
          className="w-full h-80 rounded-lg border border-border"
        />
      )}
      {url && !isImage && !isPdf && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Download className="w-4 h-4" />
          הורד
        </a>
      )}

      {error && (
        <div className="text-xs text-red-700 dark:text-red-300">{error}</div>
      )}
    </div>
  );
}
