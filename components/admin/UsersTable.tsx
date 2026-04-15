"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { authedFetch } from "@/lib/admin/adminFetch";

interface UserRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  providers: string[];
  isAnonymous: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  disabled: boolean;
  onboardingStatus: string;
  docsCount: number;
}

type SortKey = "createdAt" | "lastSignInAt" | "docsCount" | "email";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

export function UsersTable() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Page-token stack: each element = the token to fetch the page at that
  // stack index. Index 0 = no token (first page). Pushing onto the stack
  // advances forward; popping goes back.
  const [tokens, setTokens] = useState<(string | null)[]>([null]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  const currentToken = tokens[tokens.length - 1] ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = new URL("/api/admin/users", window.location.origin);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (currentToken) url.searchParams.set("pageToken", currentToken);
    authedFetch(url.toString(), { method: "GET" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { users: UserRow[]; nextPageToken: string | null };
        setRows(body.users);
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
  }, [currentToken]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? rows.filter(
          (r) =>
            r.uid.toLowerCase().includes(needle) ||
            (r.email ?? "").toLowerCase().includes(needle) ||
            (r.displayName ?? "").toLowerCase().includes(needle),
        )
      : rows;
    const sorted = [...base].sort((a, b) => {
      const aVal = valueForSort(a, sortKey);
      const bVal = valueForSort(b, sortKey);
      if (aVal === bVal) return 0;
      const cmp = aVal > bVal ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            dir="rtl"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי אימייל / שם / uid"
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <Th onClick={() => toggleSort("email")} active={sortKey === "email"} dir={sortDir}>
                משתמש
              </Th>
              <th className="px-3 py-2 text-start font-medium">ספק</th>
              <th className="px-3 py-2 text-start font-medium">סטטוס</th>
              <Th onClick={() => toggleSort("docsCount")} active={sortKey === "docsCount"} dir={sortDir}>
                מסמכים
              </Th>
              <Th onClick={() => toggleSort("createdAt")} active={sortKey === "createdAt"} dir={sortDir}>
                נוצר
              </Th>
              <Th onClick={() => toggleSort("lastSignInAt")} active={sortKey === "lastSignInAt"} dir={sortDir}>
                כניסה אחרונה
              </Th>
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
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  אין משתמשים להצגה
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((r) => (
                <tr key={r.uid} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${r.uid}`}
                      className="text-foreground hover:underline font-medium"
                    >
                      {r.displayName || r.email || r.uid.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono truncate max-w-[24ch]">
                      {r.uid}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.isAnonymous ? (
                      <span className="text-xs text-muted-foreground">anon</span>
                    ) : (
                      <span className="text-xs">{r.providers.join(", ") || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.disabled ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-200">
                        disabled
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{formatOnboarding(r.onboardingStatus)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.docsCount}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(r.lastSignInAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {filtered.length} מתוך {rows.length} בעמוד
        </span>
        <div className="flex items-center gap-2">
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
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
}) {
  return (
    <th className="px-3 py-2 text-start font-medium">
      <button
        type="button"
        onClick={onClick}
        className={
          "inline-flex items-center gap-1 " +
          (active ? "text-foreground" : "text-muted-foreground hover:text-foreground")
        }
      >
        {children}
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function valueForSort(r: UserRow, key: SortKey): string | number {
  switch (key) {
    case "createdAt":
      return r.createdAt ? Date.parse(r.createdAt) : 0;
    case "lastSignInAt":
      return r.lastSignInAt ? Date.parse(r.lastSignInAt) : 0;
    case "docsCount":
      return r.docsCount;
    case "email":
      return (r.email ?? r.uid).toLowerCase();
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", { year: "2-digit", month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
}

function formatOnboarding(status: string): string {
  switch (status) {
    case "new":
      return "חדש";
    case "sources_selected":
      return "בחר מקורות";
    case "details_confirmed":
      return "אישר פרטים";
    case "questionnaire_completed":
      return "השלים שאלון";
    case "filed":
      return "הוגש";
    default:
      return status;
  }
}
