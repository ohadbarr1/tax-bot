"use client";

import { motion } from "framer-motion";
import { Briefcase, HandCoins } from "lucide-react";
import type { TaxPayer, FinancialData } from "@/types";
import { FilingKit } from "@/components/FilingKit";

function formatILS(n: number) {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
}

interface InsightsListProps {
  taxpayer: TaxPayer;
  financials: FinancialData;
  hasOverlap: boolean;
}

export function InsightsList({ taxpayer, financials, hasOverlap }: InsightsListProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.07 } },
      }}
      className="space-y-5"
    >
      {/* Employer Overview Strip */}
      {taxpayer.employers.length > 1 && (
        <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-orange-500" />
              מפת מעסיקים — {financials.taxYears[0] ?? "2024"}
            </h2>
            {hasOverlap && (
              <span className="text-xs font-medium text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-full">
                חפיפה זוהתה — נדרש תיאום מס
              </span>
            )}
          </div>
          <div className="space-y-3">
            {taxpayer.employers.map((emp) => {
              const widthPct = Math.round((emp.monthsWorked / 12) * 100);
              return (
                <div key={emp.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{emp.name}</span>
                      {emp.isMainEmployer && (
                        <span className="bg-[#0F172A] text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                          ראשי
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 tabular-nums">
                      {emp.monthsWorked} חודשים
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <motion.div
                      className={`h-2.5 rounded-full ${
                        emp.isMainEmployer ? "bg-[#0F172A]" : "bg-orange-400"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {hasOverlap && (
            <p className="mt-3 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100">
              זוהתה חפיפה בין מעסיקים — עבודה מקבילה ללא תיאום מס. המס המרבי (47%) נגבה על ידי המעסיק המשני.
            </p>
          )}
        </div>
      )}

      {/* Taxpayer Profile Card */}
      <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          פרופיל הנישום
        </h2>

        {/* Top identity */}
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-[#0F172A] flex items-center justify-center">
            <span className="text-white text-sm font-bold">אב</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {taxpayer.fullName.split(" - ")[1]}
            </p>
            <p className="text-xs text-slate-500">{taxpayer.profession}</p>
          </div>
        </div>

        {/* Rows */}
        {(
          [
            {
              label: "מצב משפחתי",
              value:
                taxpayer.maritalStatus === "married"
                  ? "נשוי/אה"
                  : taxpayer.maritalStatus === "divorced"
                  ? "גרוש/ה"
                  : "רווק/ה",
            },
            { label: "ילדים", value: `${taxpayer.children.length}` },
            {
              label: "תואר",
              value: taxpayer.degrees[0]
                ? `${taxpayer.degrees[0].type} — ${taxpayer.degrees[0].completionYear}`
                : "—",
            },
            {
              label: "מעסיקים",
              value: `${taxpayer.employers.length} (${
                hasOverlap ? "חפיפה" : "ללא חפיפה"
              })`,
            },
            {
              label: "ניכויים",
              value: `${taxpayer.personalDeductions.length} סעיפים`,
            },
            {
              label: "ברוקר",
              value: financials.hasForeignBroker
                ? financials.brokerName || "זר"
                : "ללא",
            },
            {
              label: "פיצויים",
              value: taxpayer.lifeEvents?.pulledSeverancePay
                ? "חייבים — נדרשת פריסה"
                : "—",
              alert: taxpayer.lifeEvents?.pulledSeverancePay,
            },
          ] as { label: string; value: string; alert?: boolean }[]
        ).map((row) => (
          <div key={row.label} className="flex justify-between items-center text-xs">
            <span className="text-slate-500">{row.label}</span>
            <span
              className={`font-medium ${
                row.alert ? "text-rose-500" : "text-foreground"
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Deductions Summary */}
      {taxpayer.personalDeductions.length > 0 && (
        <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-violet-500" />
            ניכויים שהוזנו
          </h2>
          {taxpayer.personalDeductions.map((ded) => {
            const rate =
              ded.type === "life_insurance_sec45a"
                ? 0.25
                : ded.type === "donation_sec46"
                ? 0.35
                : 0.35;
            const credit = Math.round(ded.amount * rate);
            const typeLabel =
              ded.type === "donation_sec46"
                ? "תרומה — סעיף 46"
                : ded.type === "life_insurance_sec45a"
                ? "ביטוח חיים — סעיף 45א"
                : "פנסיה עצמאית — סעיף 47";
            return (
              <div
                key={ded.id}
                className="flex justify-between items-start text-xs border-t border-border pt-3 first:border-0 first:pt-0"
              >
                <div>
                  <p className="font-medium text-foreground">{ded.providerName}</p>
                  <p className="text-slate-500">{typeLabel}</p>
                  <p className="text-slate-400 tabular-nums">
                    {formatILS(ded.amount)}
                  </p>
                </div>
                <span className="text-emerald-600 font-bold tabular-nums">
                  {formatILS(credit)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Filing Kit (Phase 3) */}
      <FilingKit />
    </motion.div>
  );
}
