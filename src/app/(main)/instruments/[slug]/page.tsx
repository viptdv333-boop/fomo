"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import MoexStats from "@/components/instruments/MoexStats";
import IdeaCard from "@/components/ideas/IdeaCard";
import type { DataSource } from "@/components/instruments/ChartWidget";

const ChartWidget = dynamic(
  () => import("@/components/instruments/ChartWidget"),
  { ssr: false, loading: () => <div className="h-[500px] bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" /> }
);

interface RelatedInstrument {
  id: string;
  name: string;
  ticker: string | null;
  slug: string;
  exchangeRel?: { shortName: string } | null;
}

interface InstrumentData {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
  exchangeUrl: string | null;
  tradingViewSymbol: string | null;
  dataSource: string | null;
  dataTicker: string | null;
  externalUrl: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string } | null;
  exchangeRel: { id: string; name: string; slug: string; shortName: string } | null;
  chatRoom: { id: string; name: string } | null;
  relatedInstruments?: RelatedInstrument[];
}

export default function InstrumentPage() {
  const params = useParams();
  const { data: session } = useSession();
  const slug = params.slug as string;

  const [instrument, setInstrument] = useState<InstrumentData | null>(null);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadInstrument() {
    const res = await fetch(`/api/instruments/${slug}`);
    if (res.ok) setInstrument(await res.json());
    setLoading(false);
  }

  async function loadIdeas() {
    if (!instrument) return;
    const res = await fetch(`/api/ideas?instrumentId=${instrument.id}`);
    const data = await res.json();
    setIdeas(data.data || data.ideas || (Array.isArray(data) ? data : []));
  }

  async function loadContracts() {
    const res = await fetch(`/api/instruments/${slug}/contracts`);
    if (res.ok) {
      const data = await res.json();
      if (data.contracts) setContracts(data.contracts);
    }
  }

  useEffect(() => { loadInstrument(); }, [slug]);
  useEffect(() => { if (instrument) { loadIdeas(); loadContracts(); } }, [instrument?.id]);

  if (loading) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Загрузка...</div>;
  if (!instrument) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Инструмент не найден</div>;

  const chartTicker = instrument.dataTicker || instrument.ticker || "";
  const chartSource = (instrument.dataSource || "none") as DataSource;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold dark:text-gray-100">{instrument.name}</h1>
              {instrument.ticker && (
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg text-sm font-mono font-medium">
                  {instrument.ticker}
                </span>
              )}
              {instrument.exchangeRel && (
                <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded text-xs font-medium">
                  {instrument.exchangeRel.shortName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
              {instrument.category && (
                <span>{instrument.category.name}</span>
              )}
              {instrument.exchange && (
                <>
                  <span>·</span>
                  <span>{instrument.exchange}</span>
                </>
              )}
            </div>
            {instrument.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-3">{instrument.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(instrument.externalUrl || instrument.exchangeUrl) && (
              <a
                href={instrument.externalUrl || instrument.exchangeUrl || ""}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition inline-flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" /></svg>
                На бирже
              </a>
            )}
            {instrument.chatRoom && (
              <Link
                href={`/chat/${instrument.chatRoom.id}`}
                className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition inline-flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                Обсудить в чате
              </Link>
            )}
            <Link
              href={`/ideas/new?instrumentId=${instrument.id}`}
              className="px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition inline-flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 5v14m-7-7h14" /></svg>
              Поделиться идеей
            </Link>
          </div>
        </div>
      </div>

      {/* Chart: KlineChart for MOEX, TradingView embed for others */}
      {chartSource !== "none" && chartTicker ? (
        <ChartWidget
          ticker={chartTicker}
          source={chartSource}
          name={instrument.name}
          height={550}
        />
      ) : instrument.tradingViewSymbol ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
          <div id="tv-chart-container" className="h-[550px]" ref={(el) => {
            if (!el || el.querySelector("iframe")) return;
            const script = document.createElement("script");
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
            script.async = true;
            script.innerHTML = JSON.stringify({
              autosize: true,
              symbol: instrument.tradingViewSymbol,
              interval: "D",
              timezone: "Etc/UTC",
              theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
              style: "1",
              locale: "ru",
              allow_symbol_change: false,
              hide_top_toolbar: false,
              hide_legend: false,
              save_image: true,
              calendar: false,
              support_host: "https://www.tradingview.com",
            });
            el.appendChild(script);
          }} />
        </div>
      ) : null}

      {/* MOEX Stats */}
      {(instrument.exchange === "MOEX" || instrument.dataSource === "moex") && <MoexStats slug={slug} />}

      {/* TradingView Technical Analysis + Timeline for non-MOEX */}
      {!instrument.dataSource && instrument.tradingViewSymbol && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Technical Analysis */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
            <div className="h-[420px]" ref={(el) => {
              if (!el || el.querySelector("iframe")) return;
              const script = document.createElement("script");
              script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
              script.async = true;
              script.innerHTML = JSON.stringify({
                interval: "1D",
                width: "100%",
                isTransparent: true,
                height: "100%",
                symbol: instrument.tradingViewSymbol,
                showIntervalTabs: true,
                displayMode: "single",
                locale: "ru",
                colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
              });
              el.appendChild(script);
            }} />
          </div>
          {/* Timeline / News */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
            <div className="h-[420px]" ref={(el) => {
              if (!el || el.querySelector("iframe")) return;
              const script = document.createElement("script");
              script.src = "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js";
              script.async = true;
              script.innerHTML = JSON.stringify({
                feedMode: "symbol",
                symbol: instrument.tradingViewSymbol,
                isTransparent: true,
                displayMode: "regular",
                width: "100%",
                height: "100%",
                colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
                locale: "ru",
              });
              el.appendChild(script);
            }} />
          </div>
        </div>
      )}

      {/* Active Contracts Table */}
      {contracts.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold dark:text-gray-100 mb-4">Активные контракты</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-2 pr-4">Контракт</th>
                  <th className="text-right py-2 px-2">Цена</th>
                  <th className="text-right py-2 px-2">Изм.</th>
                  <th className="text-right py-2 px-2">Изм. %</th>
                  <th className="text-right py-2 px-2">Макс.</th>
                  <th className="text-right py-2 px-2">Мин.</th>
                  <th className="text-right py-2 px-2">Объём</th>
                  <th className="text-right py-2 px-2">Откр. инт.</th>
                  <th className="text-right py-2 pl-2">Сделки</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.secid} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition">
                    <td className="py-2.5 pr-4">
                      <div className="font-mono font-bold text-gray-900 dark:text-gray-100">{c.secid}</div>
                      <div className="text-[10px] text-gray-400">{c.shortname}{c.lastTradeDate ? ` · до ${c.lastTradeDate}` : ""}</div>
                    </td>
                    <td className="text-right py-2.5 px-2 font-semibold dark:text-gray-100">
                      {c.last != null ? c.last.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className={`text-right py-2.5 px-2 font-medium ${
                      c.change > 0 ? "text-green-600" : c.change < 0 ? "text-red-500" : "text-gray-400"
                    }`}>
                      {c.change != null ? (c.change > 0 ? "+" : "") + c.change : "—"}
                    </td>
                    <td className={`text-right py-2.5 px-2 font-medium ${
                      c.changePct > 0 ? "text-green-600" : c.changePct < 0 ? "text-red-500" : "text-gray-400"
                    }`}>
                      {c.changePct != null ? (c.changePct > 0 ? "+" : "") + c.changePct.toFixed(2) + "%" : "—"}
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-600 dark:text-gray-400">
                      {c.high != null ? c.high.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-600 dark:text-gray-400">
                      {c.low != null ? c.low.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-600 dark:text-gray-400">
                      {c.volume != null ? c.volume.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-600 dark:text-gray-400">
                      {c.openInterest != null ? c.openInterest.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="text-right py-2.5 pl-2 text-gray-600 dark:text-gray-400">
                      {c.numTrades != null ? c.numTrades.toLocaleString("ru-RU") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-3 text-right">Данные MOEX ISS</p>
        </div>
      )}

      {/* Related Instruments */}
      {instrument.relatedInstruments && instrument.relatedInstruments.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold dark:text-gray-100 mb-4">Связанные тикеры</h2>
          <div className="flex flex-wrap gap-2">
            {instrument.relatedInstruments.map((rel) => (
              <Link
                key={rel.id}
                href={`/instruments/${rel.slug}`}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition"
              >
                <span className="font-mono font-bold text-sm text-green-600 dark:text-green-400">
                  #{rel.ticker || rel.slug}
                </span>
                {rel.exchangeRel?.shortName && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                    {rel.exchangeRel.shortName}
                  </span>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                  {rel.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Ideas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-100">
            Идеи по {instrument.name}
          </h2>
        </div>

        {ideas.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-8 bg-white dark:bg-gray-900 rounded-xl shadow">
            Нет идей по этому инструменту
          </div>
        ) : (
          <div className="space-y-4">
            {ideas.map((idea: any) => (
              <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
