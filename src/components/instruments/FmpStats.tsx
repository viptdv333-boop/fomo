"use client";

import { useEffect, useState } from "react";

interface Props {
  ticker: string;
}

interface StockProfile {
  companyName: string;
  industry: string;
  sector: string;
  mktCap: number;
  price: number;
  beta: number;
  volAvg: number;
  lastDiv: number;
  range: string;
  ceo: string;
  fullTimeEmployees: string;
  country: string;
  exchange: string;
}

interface KeyMetrics {
  peRatioTTM: number;
  pegRatioTTM: number;
  priceToSalesRatioTTM: number;
  priceToBookRatioTTM: number;
  dividendYieldTTM: number;
  earningsYieldTTM: number;
  enterpriseValueOverEBITDATTM: number;
  debtToEquityTTM: number;
  currentRatioTTM: number;
  returnOnEquityTTM: number;
  returnOnAssetsTTM: number;
  revenuePerShareTTM: number;
  netIncomePerShareTTM: number;
  freeCashFlowPerShareTTM: number;
}

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

function pct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return (n * 100).toFixed(2) + "%";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-800/30 last:border-b-0">
      <span className="text-gray-500 dark:text-gray-400 text-xs">{label}</span>
      <span className="font-medium text-xs text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

export default function FmpStats({ ticker }: Props) {
  const [profile, setProfile] = useState<StockProfile | null>(null);
  const [metrics, setMetrics] = useState<KeyMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/fmp-stats?ticker=${ticker}&type=profile`).then(r => r.ok ? r.json() : null),
      fetch(`/api/fmp-stats?ticker=${ticker}&type=metrics`).then(r => r.ok ? r.json() : null),
    ]).then(([p, m]) => {
      setProfile(p);
      setMetrics(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 animate-pulse h-[300px]" />;
  }

  if (!profile && !metrics) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Company info */}
      {profile && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wide">Профиль компании</h3>
          <div className="space-y-0">
            <Row label="Сектор" value={profile.sector || "—"} />
            <Row label="Отрасль" value={profile.industry || "—"} />
            <Row label="Страна" value={profile.country || "—"} />
            <Row label="CEO" value={profile.ceo || "—"} />
            <Row label="Сотрудники" value={profile.fullTimeEmployees || "—"} />
            <Row label="Капитализация" value={`$${fmt(profile.mktCap)}`} />
            <Row label="Ср. объём" value={fmt(profile.volAvg)} />
            <Row label="Дивиденд" value={profile.lastDiv ? `$${profile.lastDiv.toFixed(2)}` : "—"} />
            <Row label="Beta" value={profile.beta?.toFixed(2) || "—"} />
            <Row label="Диапазон 52 нед." value={profile.range || "—"} />
          </div>
        </div>
      )}

      {/* Key metrics */}
      {metrics && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wide">Ключевые показатели</h3>
          <div className="space-y-0">
            <Row label="P/E (TTM)" value={metrics.peRatioTTM?.toFixed(2) || "—"} />
            <Row label="PEG" value={metrics.pegRatioTTM?.toFixed(2) || "—"} />
            <Row label="P/S" value={metrics.priceToSalesRatioTTM?.toFixed(2) || "—"} />
            <Row label="P/B" value={metrics.priceToBookRatioTTM?.toFixed(2) || "—"} />
            <Row label="EV/EBITDA" value={metrics.enterpriseValueOverEBITDATTM?.toFixed(2) || "—"} />
            <Row label="Дивидендная доходность" value={pct(metrics.dividendYieldTTM)} />
            <Row label="ROE" value={pct(metrics.returnOnEquityTTM)} />
            <Row label="ROA" value={pct(metrics.returnOnAssetsTTM)} />
            <Row label="Долг/Капитал" value={metrics.debtToEquityTTM?.toFixed(2) || "—"} />
            <Row label="Текущая ликвидность" value={metrics.currentRatioTTM?.toFixed(2) || "—"} />
            <Row label="EPS" value={`$${metrics.netIncomePerShareTTM?.toFixed(2) || "—"}`} />
            <Row label="FCF/акция" value={`$${metrics.freeCashFlowPerShareTTM?.toFixed(2) || "—"}`} />
          </div>
        </div>
      )}
    </div>
  );
}
