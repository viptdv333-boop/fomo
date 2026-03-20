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
  numTrades: number | null;
  bid: number | null;
  offer: number | null;
  spread: number | null;
  waprice: number | null;
  openInterest: number | null;
  prevClose: number | null;
  marketCap: number | null;
  low52w: number | null;
  high52w: number | null;
  lotSize: number | null;
  faceValue: number | null;
  couponValue: number | null;
  couponPercent: number | null;
  nextCouponDate: string | null;
  matDate: string | null;
  duration: number | null;
  yieldToMaturity: number | null;
  secType: "stock" | "bond" | "futures" | "currency" | "unknown";
}

interface MoexStatsProps {
  slug: string;
}

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatVolume(n: number | null): string {
  if (n === null || n === undefined) return "\u2014";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + " млрд";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " млн";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " тыс";
  return n.toLocaleString("ru-RU");
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

function StatItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "red";
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div
        className={`text-sm font-medium ${
          highlight === "green"
            ? "text-green-600 dark:text-green-400"
            : highlight === "red"
            ? "text-red-600 dark:text-red-400"
            : "dark:text-gray-300"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function MoexStats({ slug }: MoexStatsProps) {
  const [data, setData] = useState<MoexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    function loadData() {
      fetch(`/api/instruments/${slug}/moex`)
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then(setData)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }

    loadData();
    // Auto-refresh every 10 seconds for live data
    timer = setInterval(loadData, 10_000);

    return () => clearInterval(timer);
  }, [slug]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  const isPositive = (data.change ?? 0) >= 0;
  const isBond = data.secType === "bond";
  const isFutures = data.secType === "futures";

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 space-y-4">
      {/* Header + Price */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Данные MOEX
        </h3>
        {data.updateTime && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Обновлено: {data.updateTime}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3">
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

      {/* Main stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatItem label="Открытие" value={formatNumber(data.open)} />
        <StatItem label="Максимум" value={formatNumber(data.high)} highlight="green" />
        <StatItem label="Минимум" value={formatNumber(data.low)} highlight="red" />
        {data.prevClose !== null && (
          <StatItem label="Пред. закрытие" value={formatNumber(data.prevClose)} />
        )}
      </div>

      {/* Trading stats */}
      <div className="border-t dark:border-gray-700 pt-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Торговая активность
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatItem label="Объём (шт)" value={formatVolume(data.volume)} />
          {data.value !== null && (
            <StatItem label="Оборот" value={formatVolume(data.value) + " \u20BD"} />
          )}
          {data.numTrades !== null && (
            <StatItem label="Кол-во сделок" value={formatVolume(data.numTrades)} />
          )}
          {data.waprice !== null && (
            <StatItem label="Средневзвеш. цена" value={formatNumber(data.waprice)} />
          )}
        </div>
      </div>

      {/* Bid/Ask + Spread */}
      {(data.bid !== null || data.offer !== null) && (
        <div className="border-t dark:border-gray-700 pt-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Стакан
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {data.bid !== null && (
              <StatItem label="Лучший Bid" value={formatNumber(data.bid)} highlight="green" />
            )}
            {data.offer !== null && (
              <StatItem label="Лучший Ask" value={formatNumber(data.offer)} highlight="red" />
            )}
            {data.spread !== null && (
              <StatItem label="Спред" value={formatNumber(data.spread)} />
            )}
          </div>
        </div>
      )}

      {/* Open Interest (Futures) */}
      {isFutures && data.openInterest !== null && (
        <div className="border-t dark:border-gray-700 pt-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Деривативы
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatItem label="Открытый интерес" value={formatVolume(data.openInterest)} />
          </div>
        </div>
      )}

      {/* 52-week range */}
      {(data.low52w !== null || data.high52w !== null) && (
        <div className="border-t dark:border-gray-700 pt-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Диапазон 52 недели
          </h4>
          <div className="flex items-center gap-3">
            <span className="text-xs text-red-500 font-medium whitespace-nowrap">
              {formatNumber(data.low52w)}
            </span>
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
              {data.low52w !== null && data.high52w !== null && data.last !== null && data.high52w > data.low52w && (
                <div
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full"
                  style={{ width: "100%" }}
                />
              )}
              {data.low52w !== null && data.high52w !== null && data.last !== null && data.high52w > data.low52w && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-green-600 rounded-full border-2 border-white dark:border-gray-900 shadow"
                  style={{
                    left: `${Math.min(100, Math.max(0, ((data.last - data.low52w) / (data.high52w - data.low52w)) * 100))}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              )}
            </div>
            <span className="text-xs text-green-500 font-medium whitespace-nowrap">
              {formatNumber(data.high52w)}
            </span>
          </div>
        </div>
      )}

      {/* Bond-specific data */}
      {isBond && (
        <div className="border-t dark:border-gray-700 pt-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Параметры облигации
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {data.faceValue !== null && (
              <StatItem label="Номинал" value={formatNumber(data.faceValue) + " \u20BD"} />
            )}
            {data.couponValue !== null && (
              <StatItem label="Купон" value={formatNumber(data.couponValue) + " \u20BD"} />
            )}
            {data.couponPercent !== null && (
              <StatItem label="Ставка купона" value={data.couponPercent.toFixed(2) + "%"} />
            )}
            {data.yieldToMaturity !== null && (
              <StatItem
                label="Доходность к погашению"
                value={data.yieldToMaturity.toFixed(2) + "%"}
                highlight="green"
              />
            )}
            {data.nextCouponDate && (
              <StatItem label="Ближ. купон" value={formatDate(data.nextCouponDate)} />
            )}
            {data.matDate && (
              <StatItem label="Погашение" value={formatDate(data.matDate)} />
            )}
            {data.duration !== null && (
              <StatItem label="Дюрация (дней)" value={formatNumber(data.duration)} />
            )}
          </div>
        </div>
      )}

      {/* Additional info */}
      <div className="border-t dark:border-gray-700 pt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
        {data.lotSize !== null && (
          <span>Лот: <strong className="text-gray-600 dark:text-gray-300">{data.lotSize} шт</strong></span>
        )}
        {data.marketCap !== null && (
          <span>Капитализация: <strong className="text-gray-600 dark:text-gray-300">{formatVolume(data.marketCap)} \u20BD</strong></span>
        )}
      </div>
    </div>
  );
}
