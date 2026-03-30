"use client";

import { useEffect, useState } from "react";

interface CryptoStats {
  name: string;
  market_cap_rank: number | null;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  price_change_24h: number | null;
  price_change_7d: number | null;
  price_change_30d: number | null;
}

interface CryptoFundamentalsProps {
  slug: string;
}

function formatCompact(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatSupply(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPrice(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  if (n >= 1) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 0.01) return "$" + n.toFixed(4);
  return "$" + n.toFixed(8);
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function formatPercent(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(2) + "%";
}

function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "red";
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`text-sm font-medium ${
          highlight === "green"
            ? "text-green-600 dark:text-green-400"
            : highlight === "red"
            ? "text-red-600 dark:text-red-400"
            : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ChangeTag({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-gray-400">{"\u2014"}</span>;
  }
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center text-sm font-medium px-2 py-0.5 rounded ${
        isPositive
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
      }`}
    >
      {isPositive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export default function CryptoFundamentals({ slug }: CryptoFundamentalsProps) {
  const [data, setData] = useState<CryptoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/crypto-stats?slug=${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  const supplyPercent =
    data.circulating_supply && data.max_supply
      ? ((data.circulating_supply / data.max_supply) * 100).toFixed(1)
      : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 space-y-4">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {"Показатели"} {data.name}
      </h3>

      {/* Price Changes */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400">24h</span>
          <ChangeTag value={data.price_change_24h} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400">7d</span>
          <ChangeTag value={data.price_change_7d} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-gray-400">30d</span>
          <ChangeTag value={data.price_change_30d} />
        </div>
      </div>

      {/* Market Stats */}
      <div className="border-t dark:border-gray-700 pt-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Рыночные данные
        </h4>
        <StatRow
          label="Рейтинг по капитализации"
          value={data.market_cap_rank !== null ? `#${data.market_cap_rank}` : "\u2014"}
        />
        <StatRow label="Капитализация" value={`$${formatCompact(data.market_cap)}`} />
        <StatRow
          label="Полностью разводн. оценка"
          value={`$${formatCompact(data.fully_diluted_valuation)}`}
        />
        <StatRow label="Объём торгов (24ч)" value={`$${formatCompact(data.total_volume)}`} />
      </div>

      {/* Supply */}
      <div className="border-t dark:border-gray-700 pt-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Эмиссия
        </h4>
        <StatRow
          label="В обращении"
          value={
            formatSupply(data.circulating_supply) +
            (supplyPercent ? ` (${supplyPercent}%)` : "")
          }
        />
        <StatRow label="Общая эмиссия" value={formatSupply(data.total_supply)} />
        <StatRow label="Макс. эмиссия" value={formatSupply(data.max_supply)} />
      </div>

      {/* ATH / ATL */}
      <div className="border-t dark:border-gray-700 pt-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Исторические экстремумы
        </h4>
        <StatRow
          label="ATH (макс.)"
          value={`${formatPrice(data.ath)} \u2022 ${formatDate(data.ath_date)}`}
          highlight="green"
        />
        <StatRow
          label="ATL (мин.)"
          value={`${formatPrice(data.atl)} \u2022 ${formatDate(data.atl_date)}`}
          highlight="red"
        />
      </div>
    </div>
  );
}
