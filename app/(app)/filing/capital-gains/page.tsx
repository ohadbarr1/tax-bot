"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { AuthGate } from "@/components/auth/AuthGate";
import { CapitalGainsDetail } from "@/components/CapitalGainsDetail";
import { useApp } from "@/lib/appContext";

/**
 * /filing/capital-gains (R8) — the broker-tax page. Lists every realized trade
 * from the IBKR statement and shows how the capital-gains tax is built up
 * trade-by-trade: proceeds − basis = realized P/L (in the statement currency),
 * converted to ILS at the per-trade Bank-of-Israel rate (סעיף 91(ג)), then
 * aggregated and run through the rate / loss-offset / §204 foreign-credit
 * engine (rendered by <CapitalGainsDetail/> below the trade list).
 */

const CUR_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

const ils = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  return (v < 0 ? "−₪" : "₪") + Math.round(Math.abs(v)).toLocaleString("he-IL");
};

export default function CapitalGainsPage() {
  return (
    <AuthGate>
      <CapitalGainsInner />
    </AuthGate>
  );
}

function CapitalGainsInner() {
  const { state } = useApp();
  const ibkr = state.financials.ibkrData;
  const trades = ibkr?.trades ?? [];
  const cur = ibkr?.baseCurrency ?? "USD";
  const sym = CUR_SYMBOL[cur] ?? "$";

  const fmtCur = (n: number) =>
    (n < 0 ? "−" : "") + sym + Math.abs(n).toLocaleString("he-IL", { maximumFractionDigits: 2 });

  const totals = useMemo(() => {
    let profitIls = 0, lossIls = 0;
    for (const t of trades) {
      if (t.realizedPLILS > 0) profitIls += t.realizedPLILS;
      else lossIls += Math.abs(t.realizedPLILS);
    }
    return { profitIls, lossIls, netIls: profitIls - lossIls };
  }, [trades]);

  return (
    <div className="kc-rise px-5 md:px-10 pt-6 pb-20 max-w-4xl mx-auto">
      <Link
        href="/filing"
        className="inline-flex items-center gap-1.5 text-sm text-kc-ink-dim hover:text-kc-ink transition-colors mb-4"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה להגשה
      </Link>

      <div className="mb-2 text-[13px] font-medium" style={{ color: "var(--kc-ink-dim)" }}>
        רווחי הון · פירוט לפי עסקה
      </div>
      <h1
        style={{
          fontFamily: "var(--font-figtree)",
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "var(--kc-ink)",
          lineHeight: 1.05,
        }}
      >
        איך נבנה מס רווחי ההון
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
        כל עסקה שמומשה בדוח הברוקר ({cur}), עם רווח/הפסד ההון שלה והמרה לשקלים לפי
        שער בנק ישראל ביום העסקה (סעיף 91(ג)). למטה — איך הסכומים האלה הופכים למס,
        כולל קיזוז הפסדים וזיכוי המס הזר.
      </p>

      {trades.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">אין עדיין נתוני עסקאות</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            כדי לראות פירוט לפי עסקה, העלו דוח פעילות (Activity Statement) מ-IBKR
            במסך המסמכים. דוחות מסכמים ללא פירוט עסקאות יציגו רק את הסיכום המצרפי.
          </p>
          <Link
            href="/documents"
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-kc-ink text-white text-sm font-semibold hover:bg-slate-800 transition-all"
          >
            למסך המסמכים ←
          </Link>
        </div>
      ) : (
        <>
          {/* ── Per-trade table ── */}
          <div className="mt-6 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">
                {trades.length} עסקאות שמומשו
              </h2>
              <span className="text-xs text-muted-foreground">תמורה · עלות · רווח/הפסד</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="text-[11px] text-muted-foreground border-b border-border">
                    <th className="text-start font-medium px-4 py-2">נייר</th>
                    <th className="text-start font-medium px-3 py-2">תאריך</th>
                    <th className="text-end font-medium px-3 py-2">כמות</th>
                    <th className="text-end font-medium px-3 py-2">תמורה ({sym})</th>
                    <th className="text-end font-medium px-3 py-2">עלות ({sym})</th>
                    <th className="text-end font-medium px-3 py-2">רווח/הפסד ({sym})</th>
                    <th className="text-end font-medium px-3 py-2">שער</th>
                    <th className="text-end font-medium px-4 py-2">רווח/הפסד (₪)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trades.map((t, i) => {
                    const loss = t.realizedPL < 0;
                    return (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-semibold text-foreground">{t.symbol || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{t.date ?? "—"}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-muted-foreground">
                          {t.quantity.toLocaleString("he-IL")}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-muted-foreground">
                          {fmtCur(Math.abs(t.proceeds))}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-muted-foreground">
                          {fmtCur(Math.abs(t.basis))}
                        </td>
                        <td className={"px-3 py-2.5 text-end tabular-nums font-medium " + (loss ? "text-red-600" : "text-emerald-700")}>
                          {loss ? `(${fmtCur(Math.abs(t.realizedPL))})` : fmtCur(t.realizedPL)}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-muted-foreground">{t.fxRate.toFixed(3)}</td>
                        <td className={"px-4 py-2.5 text-end tabular-nums font-semibold " + (loss ? "text-red-600" : "text-foreground")}>
                          {loss ? `(${ils(Math.abs(t.realizedPLILS))})` : ils(t.realizedPLILS)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 text-sm font-bold">
                    <td className="px-4 py-3 text-foreground" colSpan={5}>סך הכל (₪)</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-4 py-3 text-end tabular-nums text-foreground">
                      {ils(totals.netIls)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
              רווחים: <span className="text-emerald-700 font-semibold">{ils(totals.profitIls)}</span>
              {"  ·  "}
              הפסדים: <span className="text-red-600 font-semibold">({ils(totals.lossIls)})</span>
              {"  ·  "}
              ההפסדים מקזזים את הרווחים באותה שנה (סעיף 92(א)), והיתרה היא הבסיס למס.
            </div>
          </div>

          {/* ── Aggregate tax build (rate / loss-offset / §204 credit) ── */}
          <div className="mt-6">
            <CapitalGainsDetail />
          </div>
        </>
      )}
    </div>
  );
}
