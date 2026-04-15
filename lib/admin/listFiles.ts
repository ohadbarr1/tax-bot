/**
 * lib/admin/listFiles.ts — list uploaded files across all users for the
 * admin files browser. Pages the Cloud Storage bucket under `users/` and
 * applies optional filters on the parsed path metadata.
 *
 * Path shape: `users/{uid}/documents/{docId}/{filename}` (see
 * `lib/firebase/storage.ts` for the client-side contract).
 */

import { getAdminStorage } from "@/lib/firebase/admin";

export interface AdminFileRow {
  path: string;
  uid: string;
  /** Derived category from path — "documents" / "exports" / … */
  kind: string;
  name: string;
  size: number;
  contentType: string | null;
  updated: string | null;
}

export interface ListFilesResult {
  files: AdminFileRow[];
  nextPageToken: string | null;
}

function parseFilePath(path: string): { uid: string; kind: string; name: string } {
  // users/{uid}/{kind}/{…/filename}
  const segs = path.split("/");
  const uid = segs[1] ?? "";
  const kind = segs[2] ?? "";
  const name = segs[segs.length - 1] ?? path;
  return { uid, kind, name };
}

export async function listAdminFiles(params: {
  uid?: string;
  kind?: string;
  since?: string;
  until?: string;
  pageSize?: number;
  pageToken?: string;
}): Promise<ListFilesResult> {
  const bucket = getAdminStorage().bucket();
  const prefix = params.uid ? `users/${params.uid}/` : "users/";
  const pageSize = Math.min(Math.max(params.pageSize ?? 100, 1), 1000);

  const res = (await bucket.getFiles({
    prefix,
    autoPaginate: false,
    maxResults: pageSize,
    pageToken: params.pageToken,
  })) as unknown as [
    Array<{
      name: string;
      metadata?: { size?: string | number; contentType?: string; updated?: string };
    }>,
    { pageToken?: string } | null | undefined,
  ];
  const [files, nextQuery] = res;

  const sinceMs = params.since ? Date.parse(params.since) : null;
  const untilMs = params.until ? Date.parse(params.until) : null;

  const rows: AdminFileRow[] = [];
  for (const f of files) {
    const { uid, kind, name } = parseFilePath(f.name);
    if (params.kind && kind !== params.kind) continue;

    const updatedStr = (f.metadata?.updated as string | undefined) ?? null;
    if (updatedStr) {
      const ms = Date.parse(updatedStr);
      if (sinceMs != null && !Number.isNaN(ms) && ms < sinceMs) continue;
      if (untilMs != null && !Number.isNaN(ms) && ms > untilMs) continue;
    }

    const rawSize = f.metadata?.size;
    const sizeN = typeof rawSize === "string" ? Number(rawSize) : (rawSize ?? 0);
    rows.push({
      path: f.name,
      uid,
      kind,
      name,
      size: Number.isFinite(sizeN) ? sizeN : 0,
      contentType: (f.metadata?.contentType as string | undefined) ?? null,
      updated: updatedStr,
    });
  }

  return {
    files: rows,
    nextPageToken: nextQuery?.pageToken ?? null,
  };
}
