"use client";

import { useMemo, useState } from "react";
import { FolderOpen, FileText, Link2, ExternalLink, Trash2 } from "lucide-react";
import type { VaultDocMeta, DocFormTarget, DocProcessStep, TaxYearDraft } from "@/types";
import { TYPE_LABELS } from "./DocUploadZone";

const FORM_LABELS: Record<DocFormTarget, string> = {
  form135: "טופס 135",
  form1301: "טופס 1301",
  form161: "טופס 161",
  form1322: "טופס 1322",
  form867: "טופס 867",
  form1214: "טופס 1214",
};

const STEP_LABELS: Record<DocProcessStep, string> = {
  onboarding: "הגדרות ראשוניות",
  income: "הכנסות",
  deductions: "ניכויים",
  "capital-gains": "רווחי הון",
  filing: "הגשה",
  other: "אחר",
};

interface GroupedVaultProps {
  docs: VaultDocMeta[];
  drafts: Record<string, TaxYearDraft>;
  currentDraftId: string;
  onRemove: (id: string) => void;
  onOpenProcess: (doc: VaultDocMeta) => void;
  onLink: (doc: VaultDocMeta) => void;
}

type Group = {
  key: string;
  label: string;
  sub?: string;
  docs: VaultDocMeta[];
};

/**
 * Vault docs grouped by draft → form target → source. Groups are sorted by
 * tax year desc; unlinked docs fall into a dedicated bucket with a "link to…"
 * CTA so the user can attach them to a process.
 */
export function VaultGroupedView({ docs, drafts, currentDraftId, onRemove, onOpenProcess, onLink }: GroupedVaultProps) {
  const groups = useMemo(() => buildGroups(docs, drafts, currentDraftId), [docs, drafts, currentDraftId]);
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.key ?? null);

  if (docs.length === 0) {
    return (
      <div
        style={{
          border: "1px dashed var(--kc-rule)",
          borderRadius: 16,
          padding: 32,
          textAlign: "center",
          color: "var(--kc-ink-dim)",
          fontSize: 13,
        }}
      >
        עדיין לא הועלו מסמכים. התחל מהשאלון — נאסוף מסמכים לפי מקור ההכנסה.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map((g) => {
        const open = openGroup === g.key;
        return (
          <div
            key={g.key}
            style={{
              border: "1px solid var(--kc-rule)",
              borderRadius: 18,
              background: "var(--kc-card, #fff)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setOpenGroup(open ? null : g.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "14px 16px",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                textAlign: "start" as const,
              }}
            >
              <FolderOpen style={{ width: 18, height: 18, color: "var(--kc-ink-dim)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--kc-ink)" }}>{g.label}</div>
                {g.sub && (
                  <div style={{ fontSize: 12, color: "var(--kc-ink-dim)", marginTop: 2 }}>{g.sub}</div>
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--kc-bg-soft, #f1f1ee)",
                  color: "var(--kc-ink)",
                  padding: "3px 9px",
                  borderRadius: 99,
                }}
              >
                {g.docs.length}
              </div>
            </button>

            {open && (
              <div style={{ borderTop: "1px solid var(--kc-rule)", padding: "8px 8px 10px" }}>
                {g.docs.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    onRemove={onRemove}
                    onOpenProcess={onOpenProcess}
                    onLink={onLink}
                    showLinkCta={g.key === "__unlinked__"}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocRow({
  doc,
  onRemove,
  onOpenProcess,
  onLink,
  showLinkCta,
}: {
  doc: VaultDocMeta;
  onRemove: (id: string) => void;
  onOpenProcess: (d: VaultDocMeta) => void;
  onLink: (d: VaultDocMeta) => void;
  showLinkCta: boolean;
}) {
  const ctx = doc.processContext;
  const sub = ctx
    ? [ctx.sourceLabel, ctx.formTarget ? `→ ${FORM_LABELS[ctx.formTarget]}` : null, STEP_LABELS[ctx.step]]
        .filter(Boolean)
        .join(" · ")
    : TYPE_LABELS[doc.type] ?? "מסמך";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
      }}
    >
      <FileText style={{ width: 16, height: 16, color: "var(--kc-ink-dim)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--kc-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {doc.name}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--kc-ink-dim)", marginTop: 1 }}>{sub}</div>
      </div>
      {showLinkCta && (
        <button
          onClick={() => onLink(doc)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--kc-ink)",
            background: "var(--kc-lime, #c7f266)",
            border: 0,
            borderRadius: 99,
            padding: "5px 10px",
            cursor: "pointer",
          }}
        >
          <Link2 style={{ width: 13, height: 13 }} />
          קשר לתהליך
        </button>
      )}
      {!showLinkCta && ctx && (
        <button
          onClick={() => onOpenProcess(doc)}
          title="פתח את השלב בתהליך שבו המסמך הועלה"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--kc-ink-dim)",
            background: "transparent",
            border: "1px solid var(--kc-rule)",
            borderRadius: 99,
            padding: "5px 10px",
            cursor: "pointer",
          }}
        >
          <ExternalLink style={{ width: 13, height: 13 }} />
          פתח בתהליך
        </button>
      )}
      <button
        onClick={() => onRemove(doc.id)}
        aria-label="מחק מסמך"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--kc-ink-dim)",
          background: "transparent",
          border: 0,
          padding: 6,
          cursor: "pointer",
        }}
      >
        <Trash2 style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}

function buildGroups(docs: VaultDocMeta[], drafts: Record<string, TaxYearDraft>, currentDraftId: string): Group[] {
  const byDraft = new Map<string, VaultDocMeta[]>();
  const unlinked: VaultDocMeta[] = [];

  for (const d of docs) {
    if (!d.draftId) {
      unlinked.push(d);
      continue;
    }
    const arr = byDraft.get(d.draftId) ?? [];
    arr.push(d);
    byDraft.set(d.draftId, arr);
  }

  const groups: Group[] = [];
  const draftEntries = Array.from(byDraft.entries()).sort((a, b) => {
    const ya = drafts[a[0]]?.taxYear ?? 0;
    const yb = drafts[b[0]]?.taxYear ?? 0;
    return yb - ya;
  });

  for (const [draftId, draftDocs] of draftEntries) {
    const d = drafts[draftId];
    const year = d?.taxYear ?? "?";
    const isCurrent = draftId === currentDraftId;
    // Sub-group by formTarget for visual clarity in the label
    const forms = new Set<DocFormTarget>();
    for (const doc of draftDocs) {
      if (doc.processContext?.formTarget) forms.add(doc.processContext.formTarget);
    }
    const formLabels = Array.from(forms).map((f) => FORM_LABELS[f]).join(" · ");
    groups.push({
      key: `draft-${draftId}`,
      label: `שנת מס ${year}${isCurrent ? " · נוכחי" : ""}`,
      sub: formLabels || "מסמכים ללא שיוך טופס",
      docs: draftDocs,
    });
  }

  if (unlinked.length) {
    groups.push({
      key: "__unlinked__",
      label: "מסמכים לא מקושרים",
      sub: "קשר כל מסמך לתהליך או לשנת מס כדי לשלב אותו בהגשה",
      docs: unlinked,
    });
  }

  return groups;
}
