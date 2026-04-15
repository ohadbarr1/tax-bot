"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { authedFetch } from "@/lib/admin/adminFetch";

interface FileRow {
  path: string;
  uid: string;
  kind: string;
  name: string;
  size: number;
  contentType: string | null;
  updated: string | null;
}

const PAGE_SIZE = 100;

export default function AdminFilesPage() {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uidFilter, setUidFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [sinceFilter, setSinceFilter] = useState("");
  const [untilFilter, setUntilFilter] = useState("");

  // Simple applied-filter snapshot so typing doesn't thrash the API.
  const [applied, setApplied] = useState<{
    uid: string;
    kind: string;
    since: string;
    until: string;
  }>({ uid: "", kind: "", since: "", until: "" });

  const [tokens, setTokens] = useState<(string | null)[]>([null]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const currentToken = tokens[tokens.length - 1] ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = new URL("/api/admin/files", window.location.origin);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (currentToken) url.searchParams.set("pageToken", currentToken);
    if (applied.uid) url.searchParams.set("uid", applied.uid);
    if (applied.kind) url.searchParams.set("kind", applied.kind);
    if (applied.since) url.searchParams.set("since", applied.since);
    if (applied.until) url.searchParams.set("until", applied.until);

    authedFetch(url.toString(), { method: "GET" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { files: FileRow[]; nextPageToken: string | null };
        setRows(body.files);
        setNextPageToken(body.nextPageToken ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "טעינה נכשלה");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentToken, applied]);

  function applyFilters() {
    setTokens([null]);
    setApplied({
      uid: uidFilter.trim(),
      kind: kindFilter.trim(),
      since: sinceFilter.trim(),
      until: untilFilter.trim(),
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">קבצים</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        className="bg-card border border-border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      >
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground mb-1">uid</label>
          <input
            type="text"
            value={uidFilter}
            onChange={(e) => setUidFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground mb-1">kind</label>
          <input
            type="text"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            placeholder="documents"
            className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground mb-1">מאז (ISO)</label>
          <input
            type="date"
            value={sinceFilter}
            onChange={(e) => setSinceFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground mb-1">עד (ISO)</label>
          <input
            type="date"
            value={untilFilter}
            onChange={(e) => setUntilFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm"
          />
        </div>
        <button
          type="submit"
          className="py-1.5 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          סנן
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">קובץ</th>
              <th className="px-3 py-2 text-start font-medium">uid</th>
              <th className="px-3 py-2 text-start font-medium">kind</th>
              <th className="px-3 py-2 text-start font-medium">סוג</th>
              <th className="px-3 py-2 text-start font-medium">גודל</th>
              <th className="px-3 py-2 text-start font-medium">עודכן</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  טוען…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  אין קבצים
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.path} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground truncate max-w-[32ch]">{r.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate max-w-[40ch]">
                      {r.path}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${r.uid}`}
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      {r.uid.slice(0, 10)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.kind || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.contentType ?? "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatBytes(r.size)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(r.updated)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setTokens((t) => (t.length > 1 ? t.slice(0, -1) : t))}
          disabled={tokens.length <= 1 || loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-card text-sm hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
          הקודם
        </button>
        <button
          type="button"
          onClick={() => {
            if (nextPageToken) setTokens((t) => [...t, nextPageToken]);
          }}
          disabled={!nextPageToken || loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-card text-sm hover:bg-muted disabled:opacity-40"
        >
          הבא
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL");
  } catch {
    return iso;
  }
}
