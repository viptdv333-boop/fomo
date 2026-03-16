"use client";

import { useEffect, useState } from "react";

interface MoexData {
  last: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  value: number | null;
  updateTime: string | null;
}

interface MoexStatsProps {
  slug: string;
}

function formatNumber(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatVolume(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + " млрд";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " млн";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " тыс";
  return n.toLocaleString("ru-RU");
}

export default function MoexStats({ slug }: MoexStatsProps) {
  const [data, setData] = useState<MoexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/instruments/${slug}/moex`)
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
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  const isPositive = (data.change ?? 0) >= 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Данные MOEX
        </h3>
        {data.updateTime && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Обновлено: {data.updateTime}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-3xl font-bold dark:text-gray-100">
          {formatNumber(data.last)}
        </span>
        {data.change !== null && (
          <span
            className={`text-lg font-semibold ${
              isPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {isPositive ? "+" : ""}
            {formatNumber(data.change)}
          </span>
        )}
        {data.changePercent !== null && (
          <span
            className={`text-sm font-medium px-2 py-0.5 rounded ${
              isPositive
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {data.changePercent?.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Открытие</div>
          <div className="text-sm font-medium dark:text-gray-300">{formatNumber(data.open)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Максимум</div>
          <div className="text-sm font-medium dark:text-gray-300">{formatNumber(data.high)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Минимум</div>
          <div className="text-sm font-medium dark:text-gray-300">{formatNumber(data.low)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Объём</div>
          <div className="text-sm font-medium dark:text-gray-300">{formatVolume(data.volume)}</div>
        </div>
      </div>

      {data.value !== null && (
        <div className="mt-3 pt-3 border-t dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          Оборот: <strong className="text-gray-700 dark:text-gray-300">{formatVolume(data.value)} ₽</strong>
        </div>
      )}
    </div>
  );
}
