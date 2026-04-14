"use client";

import { TrendingUp, TrendingDown, Shield } from "lucide-react";

interface IbkrSummaryCardsProps {
  totalProfitUSD: number;
  totalLossUSD: number;
  dividendsUSD: number;
  foreignTaxUSD: number;
  exchangeRate: number;
}

function formatUSD(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatILS(val: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(val);
}

export default function IbkrSummaryCards({
  totalProfitUSD,
  totalLossUSD,
  dividendsUSD,
  foreignTaxUSD,
  exchangeRate,
}: IbkrSummaryCardsProps) {
  const netGainUSD = totalProfitUSD - totalLossUSD;
  const estimatedTaxUSD = Math.max(
    0,
    netGainUSD * 0.25 + dividendsUSD * 0.25 - foreignTaxUSD
  );
  const estimatedTaxILS = Math.round(estimatedTaxUSD * exchangeRate);
  const isNetPositive = netGainUSD >= 0;

  const cards = [
    {
      title: "רווח נקי ממומש",
      subtitle: isNetPositive ? "רווח" : "הפסד",
      value: formatUSD(Math.abs(netGainUSD)),
      valueILS: formatILS(Math.round(Math.abs(netGainUSD) * exchangeRate)),
      icon: isNetPositive ? TrendingUp : TrendingDown,
      color: isNetPositive ? "emerald" : "red",
    },
    {
      title: "מס זר שנוכה במקור",
      subtitle: "Foreign Withholding Tax",
      value: formatUSD(foreignTaxUSD),
      valueILS: formatILS(Math.round(foreignTaxUSD * exchangeRate)),
      icon: Shield,
      color: "blue",
    },
    {
      title: "מס רווחי הון משוער",
      subtitle: "לפני ניצול הפסדים",
      value: formatUSD(estimatedTaxUSD),
      valueILS: estimatedTaxILS > 0 ? formatILS(estimatedTaxILS) : "פטור ממס",
      icon: TrendingDown,
      color: estimatedTaxUSD > 0 ? "orange" : "emerald",
    },
  ] as const;

  const colorMap = {
    emerald: {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      icon: "bg-emerald-100 text-emerald-600",
      value: "text-emerald-700",
      badge: "bg-emerald-100 text-emerald-700",
    },
    red: {
      bg: "bg-red-50",
      border: "border-red-200",
      icon: "bg-red-100 text-red-600",
      value: "text-red-700",
      badge: "bg-red-100 text-red-700",
    },
    blue: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      icon: "bg-blue-100 text-blue-600",
      value: "text-blue-700",
      badge: "bg-blue-100 text-blue-700",
    },
    orange: {
      bg: "bg-orange-50",
      border: "border-orange-200",
      icon: "bg-orange-100 text-orange-600",
      value: "text-orange-700",
      badge: "bg-orange-100 text-orange-700",
    },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => {
        const colors = colorMap[card.color];
        const Icon = card.icon;
        return (
          <div
            key={card.title}
            className={`rounded-2xl border p-5 flex flex-col gap-3 ${colors.bg} ${colors.border}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.icon}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">{card.title}</span>
                <span className="text-xs text-slate-400">{card.subtitle}</span>
              </div>
            </div>
            <div>
              <p className={`text-2xl font-bold tabular-nums ${colors.value}`}>{card.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{card.valueILS}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
