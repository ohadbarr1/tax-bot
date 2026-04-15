"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/admin/adminFetch";
import { FilePreview } from "./FilePreview";
import { ConfirmDangerModal } from "./ConfirmDangerModal";

interface AdminUserDetail {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    providers: string[];
    disabled: boolean;
    createdAt: string | null;
    lastSignInAt: string | null;
  };
  state: Record<string, unknown> | null;
  files: Array<{
    path: string;
    kind: string;
    name: string;
    size: number;
    contentType: string | null;
    updated: string | null;
  }>;
}

export function UserDetailPanel({ uid }: { uid: string }) {
  const router = useRouter();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${encodeURIComponent(uid)}`, { method: "GET" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as AdminUserDetail;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function toggleDisabled() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await authedFetch(`/api/admin/users/${encodeURIComponent(uid)}/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !data.user.disabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "update failed");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון נכשל");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setDeleteError(null);
    try {
      const res = await authedFetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: uid }),
      });
      if (!res.ok && res.status !== 207) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "delete failed");
      }
      router.push("/admin/users");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "מחיקה נכשלה");
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">טוען…</div>;
  }
  if (error || !data) {
    return (
      <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
        {error ?? "אין נתונים"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-foreground">
              {data.user.displayName || data.user.email || data.user.uid}
            </div>
            <div className="text-xs text-muted-foreground font-mono">{data.user.uid}</div>
            {data.user.email && (
              <div className="text-sm text-muted-foreground mt-1">{data.user.email}</div>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              ספקים: {data.user.providers.length > 0 ? data.user.providers.join(", ") : "anon"}
            </div>
            <div className="text-xs text-muted-foreground">
              נוצר: {formatDate(data.user.createdAt)} · כניסה אחרונה: {formatDate(data.user.lastSignInAt)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleDisabled}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-background text-sm hover:bg-muted disabled:opacity-60"
            >
              {data.user.disabled ? (
                <>
                  <Check className="w-4 h-4" />
                  הפעל מחדש
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  השבת
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 text-sm hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              מחק
            </button>
          </div>
        </div>
      </div>

      <CollapsibleJson title="AppState" data={data.state} />

      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-foreground">קבצים ({data.files.length})</h3>
        {data.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין קבצים</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.files.map((f) => (
              <FilePreview key={f.path} path={f.path} name={f.name} contentType={f.contentType} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDangerModal
        open={deleteOpen}
        title="מחיקת משתמש"
        description={
          <>
            פעולה זו תמחק לצמיתות את Firestore, Storage, וחשבון Auth של המשתמש. לא ניתן לבטל.
          </>
        }
        expected={uid}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        pending={busy}
        error={deleteError}
      />
    </div>
  );
}

function CollapsibleJson({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-3 flex items-center justify-between text-start font-semibold text-foreground hover:bg-muted/50"
      >
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">{open ? "▼" : "◀"}</span>
      </button>
      {open && (
        <pre className="px-5 pb-5 pt-0 text-xs overflow-x-auto max-h-[32rem] overflow-y-auto font-mono text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("he-IL");
  } catch {
    return iso;
  }
}
