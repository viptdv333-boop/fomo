"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import MoexStats from "@/components/instruments/MoexStats";
import IdeaCard from "@/components/ideas/IdeaCard";
import InstrumentLogo from "@/components/instruments/InstrumentLogo";
import RuNews from "@/components/instruments/RuNews";

const ChartWidget = dynamic(
  () => import("@/components/instruments/ChartWidget"),
  { ssr: false, loading: () => <div className="h-[500px] bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" /> }
);

interface Ticker {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
  tradingViewSymbol: string | null;
  dataSource: string | null;
  dataTicker: string | null;
  externalUrl: string | null;
  exchangeUrl: string | null;
  instrumentType: string | null;
  exchangeRel: { id: string; name: string; shortName: string; slug: string; country: string } | null;
}

interface AssetData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: { id: string; name: string; slug: string } | null;
  chatRoom: { id: string } | null;
  instruments: Ticker[];
}

const FLAGS: Record<string, string> = { RU: "🇷🇺", US: "🇺🇸", CN: "🇨🇳", GB: "🇬🇧", SPOT: "🌐", CRYPTO: "₿" };

export default function AssetPage() {
  const { slug } = useParams();
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<{ price: number; open: number; high: number; low: number; volume: number; change: number; changePercent: number } | null>(null);

  useEffect(() => {
    fetch(`/api/assets/${slug}`)
      .then(r => { if (r.ok) return r.json(); throw new Error("not found"); })
      .then(data => setAsset(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  // Load ideas for all tickers of this asset
  useEffect(() => {
    if (!asset) return;
    const ids = asset.instruments.map(t => t.id);
    if (ids.length === 0) return;
    // Fetch ideas for first ticker (main)
    Promise.all(ids.map(id => fetch(`/api/ideas?instrumentId=${id}`).then(r => r.json())))
      .then(results => {
        const all = results.flatMap((r: any) => r.data || r.ideas || (Array.isArray(r) ? r : []));
        // Deduplicate by id
        const seen = new Set<string>();
        setIdeas(all.filter((idea: any) => { if (seen.has(idea.id)) return false; seen.add(idea.id); return true; }));
      });
  }, [asset?.id]);

  // Compute main ticker (must be before hooks below)
  const catSlug = asset?.category?.slug || "";
  const instruments = asset?.instruments || [];
  const bybitTicker = instruments.find(t => t.dataSource === "bybit" && t.dataTicker);
  const fmpTicker = instruments.find(t => t.dataSource === "fmp" && t.dataTicker);
  const moexTicker = instruments.find(t => t.dataSource === "moex" && t.dataTicker);
  const spotTicker = instruments.find(t => t.instrumentType === "spot" && (t.dataSource || t.tradingViewSymbol));

  let mainTicker: typeof instruments[0] | undefined;
  if (catSlug === "crypto") {
    mainTicker = bybitTicker || fmpTicker || moexTicker;
  } else if (catSlug === "us-stocks") {
    mainTicker = fmpTicker || moexTicker;
  } else if (catSlug === "ru-stocks") {
    mainTicker = moexTicker;
  } else {
    mainTicker = spotTicker || moexTicker || fmpTicker;
  }
  if (!mainTicker) mainTicker = instruments.find(t => t.dataTicker) || instruments[0];

  // Fetch live quote for main ticker
  const mainSource = mainTicker?.dataSource || "";
  const mainDataTicker = mainTicker?.dataTicker || "";
  useEffect(() => {
    if (!mainSource || !mainDataTicker) return;
    const fetchQuote = () => {
      fetch(`/api/quote?source=${mainSource}&ticker=${mainDataTicker}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.price) setQuote(data); })
        .catch(() => {});
    };
    fetchQuote();
    const interval = setInterval(fetchQuote, 5000);
    return () => clearInterval(interval);
  }, [mainSource, mainDataTicker]);

  const formatNum = (n: number) => n >= 1000 ? n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : n.toFixed(2);
  const formatVol = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(Math.round(v));

  if (loading) return <div className="text-gray-500 py-12 text-center">Загрузка...</div>;
  if (!asset) return <div className="text-gray-500 py-12 text-center">Инструмент не найден</div>;

  const chatLink = asset.chatRoom ? `/chat?room=${asset.chatRoom.id}` : "/chat";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-gray-400 dark:text-gray-500 mb-1">
              <Link href="/instruments" className="hover:text-green-600">Каталог</Link>
              {" / "}
              {asset.category && (
                <Link href={`/instruments/category/${asset.category.slug}`} className="hover:text-green-600">{asset.category.name}</Link>
              )}
            </div>
            <div className="flex items-center gap-3">
              <InstrumentLogo slug={asset.slug} name={asset.name} size={48} />
              <h1 className="text-2xl font-bold dark:text-gray-100">{asset.name}</h1>
              {quote && (
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold dark:text-gray-100">{formatNum(quote.price)}</span>
                  <span className={`text-sm font-semibold ${quote.change >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {quote.change >= 0 ? "+" : ""}{formatNum(quote.change)} ({quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>
            {/* OHLC + Volume bar */}
            {quote && (
              <div className="flex items-center gap-5 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Откр. <span className="font-medium text-gray-700 dark:text-gray-300">{formatNum(quote.open)}</span></span>
                <span>Макс. <span className="font-medium text-green-600">{formatNum(quote.high)}</span></span>
                <span>Мин. <span className="font-medium text-red-500">{formatNum(quote.low)}</span></span>
                <span>Объём <span className="font-medium text-gray-700 dark:text-gray-300">{formatVol(quote.volume)}</span></span>
                {mainTicker?.exchangeRel && (
                  <span>Биржа <span className="font-semibold text-white bg-gray-600 dark:bg-gray-500 px-1.5 py-0.5 rounded text-[11px]">{mainTicker.exchangeRel.shortName}</span></span>
                )}
              </div>
            )}
            {asset.description && (
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">{asset.description}</p>
            )}
            {/* Ticker hashtags */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {asset.instruments.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded text-xs font-mono font-bold">
                  #{t.ticker}
                  {t.exchangeRel && (
                    <span className="text-[9px] text-gray-400 font-normal">{t.exchangeRel.shortName}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={chatLink} className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              Обсудить
            </Link>
            <Link href={`/ideas/new?instrumentId=${asset.instruments[0]?.id || ""}`} className="px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 5v14m-7-7h14" /></svg>
              Опубликовать идею
            </Link>
          </div>
        </div>
      </div>

      {/* Main chart */}
      {mainTicker && (
        <>
          {mainTicker.dataSource && mainTicker.dataTicker ? (
            <ChartWidget
              ticker={mainTicker.dataTicker}
              source={mainTicker.dataSource as any}
              name={asset.name}
              height={500}
            />
          ) : mainTicker.tradingViewSymbol ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
              <div className="h-[500px]" ref={(el) => {
                if (!el || el.querySelector("iframe")) return;
                const script = document.createElement("script");
                script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
                script.async = true;
                script.innerHTML = JSON.stringify({
                  autosize: true, symbol: mainTicker.tradingViewSymbol, interval: "D",
                  timezone: "Etc/UTC", theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
                  style: "1", locale: "ru", allow_symbol_change: false, save_image: true,
                });
                el.appendChild(script);
              }} />
            </div>
          ) : null}
        </>
      )}

      {/* MOEX Stats for MOEX tickers */}
      {moexTicker && mainTicker?.dataSource === "moex" && <MoexStats slug={moexTicker.slug} />}

      {/* TradingView Full Technical Analysis — full width */}
      {(() => {
        const tvSymbol = mainTicker?.tradingViewSymbol || instruments.find(t => t.tradingViewSymbol)?.tradingViewSymbol;
        return tvSymbol ? tvSymbol : null;
      })() && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
          <div className="h-[650px]" ref={(el) => {
            if (!el || el.querySelector("iframe")) return;
            const tvSym = mainTicker?.tradingViewSymbol || instruments.find(t => t.tradingViewSymbol)?.tradingViewSymbol;
            const script = document.createElement("script");
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
            script.async = true;
            script.innerHTML = JSON.stringify({
              interval: "1D", width: "100%", isTransparent: true, height: "100%",
              symbol: tvSym, showIntervalTabs: true, locale: "ru",
              colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
            });
            el.appendChild(script);
          }} />
        </div>
      )}

      {/* Tickers table — all exchanges */}
      {asset.instruments.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold dark:text-gray-100 mb-4">Тикеры на биржах</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-2 pr-4">Тикер</th>
                  <th className="text-left py-2 px-2">Биржа</th>
                  <th className="text-left py-2 px-2">Тип</th>
                  <th className="text-left py-2 px-2">Название</th>
                  <th className="text-right py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {asset.instruments.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 dark:border-gray-800/30 last:border-b-0">
                    <td className="py-3 pr-4">
                      <span className="font-mono font-bold text-green-600 dark:text-green-400">#{t.ticker}</span>
                    </td>
                    <td className="py-3 px-2">
                      {t.exchangeRel ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          {FLAGS[t.exchangeRel.country] || ""} {t.exchangeRel.shortName}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-2 text-xs text-gray-500">
                      {t.instrumentType === "futures" ? "Фьючерс" : t.instrumentType === "spot" ? "Спот" : t.instrumentType === "stock" ? "Акция" : t.instrumentType || "—"}
                    </td>
                    <td className="py-3 px-2 text-gray-600 dark:text-gray-400 text-xs">{t.name}</td>
                    <td className="py-3 pl-2 text-right">
                      {(t.externalUrl || t.exchangeUrl) && (
                        <a href={t.externalUrl || t.exchangeUrl || ""} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:text-green-700">
                          На бирже →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Economic Calendar + Russian News */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
          <div className="h-[500px]" ref={(el) => {
            if (!el || el.querySelector("iframe")) return;
            const script = document.createElement("script");
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
            script.async = true;
            script.innerHTML = JSON.stringify({
              width: "100%", height: "100%", locale: "ru", importanceFilter: "0,1",
              colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
              isTransparent: true,
            });
            el.appendChild(script);
          }} />
        </div>
        <RuNews
          category={
            asset.category?.slug === "crypto" ? "crypto" :
            asset.category?.slug === "stocks-ru" ? "stocks_ru" :
            asset.category?.slug === "stocks-us" ? "stocks_us" :
            ["oil", "gas", "metals", "agriculture"].includes(asset.category?.slug || "") ? "commodities" :
            "general"
          }
          slug={asset.slug}
          title={`Новости: ${asset.name}`}
        />
      </div>

      {/* Ideas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-100">Идеи по {asset.name}</h2>
          <Link
            href={`/ideas/new?instrumentId=${asset.instruments[0]?.id || ""}`}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            + Написать идею
          </Link>
        </div>
        {ideas.length > 0 ? (
          <div className="space-y-4">
            {ideas.map((idea: any) => (
              <IdeaCard key={idea.id} idea={idea} onVote={() => {}} />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 text-center">
            <p className="text-gray-400 dark:text-gray-500 mb-3">Пока нет идей по {asset.name}</p>
            <Link
              href={`/ideas/new?instrumentId=${asset.instruments[0]?.id || ""}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
            >
              Опубликовать первую идею
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
