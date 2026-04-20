"use client";

import type { TaxPayer, FinancialData } from "@/types";

function formatILS(n: number) {
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

interface Props {
  taxpayer: TaxPayer;
  financials: FinancialData;
}

export function IncomeBreakdown({ taxpayer, financials }: Props) {
  const employerItems = taxpayer.employers
    .filter((e) => (e.grossSalary ?? 0) > 0)
    .map((e) => ({
      label: `${e.isMainEmployer ? "משכורת ראשית · " : "משכורת נוספת · "}${e.name || "מעסיק"}`,
      amount: e.grossSalary ?? 0,
    }));

  const capital = taxpayer.capitalGains?.totalRealizedProfit ?? 0;
  const extra: { label: string; amount: number }[] = [];
  if (capital > 0) extra.push({ label: "רווחי הון · שוק ההון", amount: capital });
  if (financials.hasForeignBroker && financials.ibkrData?.dividendsILS) {
    extra.push({ label: "דיבידנדים", amount: financials.ibkrData.dividendsILS });
  }

  const items = [...employerItems, ...extra];
  const total = items.reduce((a, b) => a + b.amount, 0);
  const colors = ["var(--kc-lime)", "var(--kc-grape)", "var(--kc-coral)", "var(--kc-peach)", "var(--kc-sky)"];

  if (total === 0) {
    return (
      <div>
        <div
          className="font-extrabold tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-figtree)", fontSize: 22, color: "var(--kc-ink)" }}
        >
          ההכנסות שלך השנה
        </div>
        <div className="text-[13px] mt-2" style={{ color: "var(--kc-ink-dim)" }}>
          העלה טופס 106 כדי לראות את ההכנסות שלך.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="font-extrabold tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-figtree)", fontSize: 22, color: "var(--kc-ink)" }}
      >
        ההכנסות שלך השנה
      </div>
      <div className="text-[13px] mt-1" style={{ color: "var(--kc-ink-dim)" }}>
        סך הכנסות ברוטו:{" "}
        <strong style={{ color: "var(--kc-ink)" }}>{formatILS(total)}</strong>
      </div>

      <div
        className="mt-5 h-[22px] rounded-full overflow-hidden flex"
        style={{ background: "var(--kc-bg-soft)" }}
      >
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              width: `${(it.amount / total) * 100}%`,
              background: colors[i % colors.length],
              height: "100%",
            }}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {items.map((it, i) => {
          const share = it.amount / total;
          return (
            <div key={i} className="flex items-center gap-3.5">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: colors[i % colors.length] }}
              />
              <div className="text-[14px] flex-1 font-medium" style={{ color: "var(--kc-ink)" }}>
                {it.label}
              </div>
              <div
                className="text-[14px] font-bold tabular-nums"
                style={{ color: "var(--kc-ink)" }}
              >
                {formatILS(it.amount)}
              </div>
              <div
                className="text-[11.5px] tabular-nums w-11 text-end"
                style={{ color: "var(--kc-ink-dim)" }}
              >
                {Math.round(share * 100)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
