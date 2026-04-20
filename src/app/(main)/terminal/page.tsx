"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { DataSource } from "@/components/instruments/ChartWidget";
import { useT } from "@/lib/i18n/client";

const CATEGORY_I18N: Record<string, string> = {
  "Акции ММВБ": "terminal.stocksRu",
  "Сырьё": "terminal.commodities",
  "Металлы": "terminal.metals",
  "Валюта": "terminal.currencies",
  "Индексы": "terminal.indices",
  "Криптовалюты": "terminal.crypto",
};

const ChartWidget = dynamic(
  () => import("@/components/instruments/ChartWidget"),
  { ssr: false, loading: () => <div className="flex-1 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl" /> }
);

/* ── Terminal instrument list (hardcoded, not from DB) ── */
interface TerminalInstrument {
  ticker: string;
  name: string;
  source: DataSource;
  dataTicker: string;
  emoji: string;
}

interface TerminalCategory {
  name: string;
  emoji: string;
  color: string;
  instruments: TerminalInstrument[];
}

const CATEGORY_ICONS: Record<string, string> = {
  "Акции ММВБ": "/icons/categories/stocks-ru.svg",
  "Сырьё": "/icons/categories/commodities.svg",
  "Металлы": "/icons/categories/metals.svg",
  "Валюта": "/icons/categories/currencies.svg",
  "Индексы": "/icons/categories/indices.svg",
  "Криптовалюты": "/icons/categories/crypto.svg",
};

const TERMINAL_DATA: TerminalCategory[] = [
  {
    name: "Акции ММВБ", emoji: "", color: "#3b82f6",
    instruments: [
      { ticker: "SBER", name: "Сбербанк", source: "moex", dataTicker: "SBER", emoji: "/icons/instruments/sberbank.svg" },
      { ticker: "GAZP", name: "Газпром", source: "moex", dataTicker: "GAZP", emoji: "/icons/instruments/gazprom.svg" },
      { ticker: "LKOH", name: "ЛУКОЙЛ", source: "moex", dataTicker: "LKOH", emoji: "/icons/instruments/lukoil.svg" },
      { ticker: "YDEX", name: "Яндекс", source: "moex", dataTicker: "YDEX", emoji: "/icons/instruments/yandex.svg" },
      { ticker: "ROSN", name: "Роснефть", source: "moex", dataTicker: "ROSN", emoji: "/icons/instruments/rosneft.svg" },
      { ticker: "GMKN", name: "Норникель", source: "moex", dataTicker: "GMKN", emoji: "/icons/instruments/norilsk-nickel.svg" },
      { ticker: "NVTK", name: "Новатэк", source: "moex", dataTicker: "NVTK", emoji: "/icons/instruments/novatek.svg" },
      { ticker: "VTBR", name: "ВТБ", source: "moex", dataTicker: "VTBR", emoji: "/icons/instruments/vtb.svg" },
      { ticker: "TCSG", name: "Тинькофф", source: "moex", dataTicker: "TCSG", emoji: "/icons/instruments/tinkoff.svg" },
      { ticker: "MGNT", name: "Магнит", source: "moex", dataTicker: "MGNT", emoji: "/icons/instruments/magnit.svg" },
    ],
  },
  {
    name: "Сырьё", emoji: "", color: "#f59e0b",
    instruments: [
      { ticker: "BR", name: "Нефть Brent", source: "moex", dataTicker: "BR", emoji: "/icons/instruments/oil.svg" },
      { ticker: "NG", name: "Газ", source: "moex", dataTicker: "NG", emoji: "/icons/instruments/gas.svg" },
      { ticker: "COCOA", name: "Какао", source: "moex", dataTicker: "COCOA", emoji: "/icons/instruments/cocoa.svg" },
      { ticker: "SUGAR", name: "Сахар", source: "moex", dataTicker: "SUGAR", emoji: "/icons/instruments/sugar.svg" },
      { ticker: "WHEAT", name: "Пшеница", source: "moex", dataTicker: "WHEAT", emoji: "/icons/instruments/wheat.svg" },
    ],
  },
  {
    name: "Металлы", emoji: "", color: "#eab308",
    instruments: [
      { ticker: "GOLD", name: "Золото", source: "moex", dataTicker: "GOLD", emoji: "/icons/instruments/gold.svg" },
      { ticker: "SILV", name: "Серебро", source: "moex", dataTicker: "SILV", emoji: "/icons/instruments/silver.svg" },
      { ticker: "PLT", name: "Платина", source: "moex", dataTicker: "PLT", emoji: "/icons/instruments/platinum.svg" },
      { ticker: "PLD", name: "Палладий", source: "moex", dataTicker: "PLD", emoji: "/icons/instruments/palladium.svg" },
      { ticker: "CU", name: "Медь", source: "moex", dataTicker: "CU", emoji: "/icons/instruments/copper.svg" },
    ],
  },
  {
    name: "Валюта", emoji: "", color: "#10b981",
    instruments: [
      { ticker: "Si", name: "Доллар/Рубль", source: "moex", dataTicker: "Si", emoji: "/icons/instruments/usd-rub.svg" },
      { ticker: "CR", name: "Юань/Рубль", source: "moex", dataTicker: "CR", emoji: "/icons/instruments/cny-rub.svg" },
    ],
  },
  {
    name: "Индексы", emoji: "", color: "#8b5cf6",
    instruments: [
      { ticker: "MIX", name: "Фьючерс ММВБ", source: "moex", dataTicker: "MIX", emoji: "/icons/instruments/moex-index.svg" },
      { ticker: "RTS", name: "Фьючерс РТС", source: "moex", dataTicker: "RTS", emoji: "/icons/instruments/rts-index.svg" },
      { ticker: "SPYF", name: "Фьючерс S&P 500", source: "moex", dataTicker: "SPYF", emoji: "/icons/instruments/sp500.svg" },
      { ticker: "NASD", name: "Фьючерс NASDAQ", source: "moex", dataTicker: "NASD", emoji: "/icons/instruments/nasdaq100.svg" },
    ],
  },
  {
    name: "Криптовалюты", emoji: "", color: "#f97316",
    instruments: [
      { ticker: "BTCUSDT", name: "Bitcoin", source: "bybit", dataTicker: "BTCUSDT", emoji: "/icons/instruments/bitcoin.svg" },
      { ticker: "ETHUSDT", name: "Ethereum", source: "bybit", dataTicker: "ETHUSDT", emoji: "/icons/instruments/ethereum.svg" },
      { ticker: "SOLUSDT", name: "Solana", source: "bybit", dataTicker: "SOLUSDT", emoji: "/icons/instruments/solana.svg" },
      { ticker: "XRPUSDT", name: "XRP", source: "bybit", dataTicker: "XRPUSDT", emoji: "/icons/instruments/xrp.svg" },
      { ticker: "BNBUSDT", name: "BNB", source: "bybit", dataTicker: "BNBUSDT", emoji: "/icons/instruments/bnb.svg" },
      { ticker: "DOGEUSDT", name: "Dogecoin", source: "bybit", dataTicker: "DOGEUSDT", emoji: "/icons/instruments/dogecoin.svg" },
      { ticker: "ADAUSDT", name: "Cardano", source: "bybit", dataTicker: "ADAUSDT", emoji: "/icons/instruments/cardano.svg" },
      { ticker: "AVAXUSDT", name: "Avalanche", source: "bybit", dataTicker: "AVAXUSDT", emoji: "/icons/instruments/avalanche.svg" },
      { ticker: "TONUSDT", name: "Toncoin", source: "bybit", dataTicker: "TONUSDT", emoji: "/icons/instruments/toncoin.svg" },
      { ticker: "SUIUSDT", name: "Sui", source: "bybit", dataTicker: "SUIUSDT", emoji: "/icons/instruments/sui-crypto.svg" },
    ],
  },
];

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

/* ── Collapsible category ── */
function CategorySection({ cat, selected, onSelect, quotes, tFn }: {
  cat: TerminalCategory;
  selected: TerminalInstrument | null;
  onSelect: (inst: TerminalInstrument) => void;
  quotes: Record<string, QuoteData>;
  tFn?: (key: string) => string;
}) {
  const hasSelected = cat.instruments.some((i) => i.dataTicker === selected?.dataTicker);
  const [open, setOpen] = useState(hasSelected);

  return (
    <div className="mb-1">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-3 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition text-gray-800 dark:text-gray-200">
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path d="M9 5l7 7-7 7" />
        </svg>
        {CATEGORY_ICONS[cat.name] && <img src={CATEGORY_ICONS[cat.name]} alt="" className="w-8 h-8 shrink-0 rounded-full" />}
        <span>{tFn ? tFn(CATEGORY_I18N[cat.name] || cat.name) : cat.name}</span>
        <span className="text-xs text-gray-400 ml-auto font-normal">{cat.instruments.length}</span>
      </button>
      {open && (
        <div className="ml-1">
          {cat.instruments.map((inst) => {
            const isSelected = selected?.dataTicker === inst.dataTicker;
            const q = quotes[`${inst.source}:${inst.dataTicker}`];
            return (
              <button key={inst.dataTicker} onClick={() => onSelect(inst)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition border-b border-gray-50 dark:border-gray-800/20 last:border-b-0 ${
                  isSelected ? "bg-green-50 dark:bg-green-900/15" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"
                }`}>
                <img src={inst.emoji} alt="" className="w-8 h-8 shrink-0 rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-black tracking-tight ${isSelected ? "text-green-600 dark:text-green-400" : "dark:text-gray-100"}`}>
                    {inst.ticker}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-tight">{inst.name}</div>
                </div>
                {q ? (
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold dark:text-gray-100 tabular-nums">{fmtPrice(q.price)}</div>
                    <div className={`text-[10px] font-semibold tabular-nums ${q.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)} {q.changePercent?.toFixed(2)}%
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-400 animate-pulse">...</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  if (p >= 100) return p.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

export default function TerminalPage() {
  const { t } = useT();
  const [selected, setSelected] = useState<TerminalInstrument>(TERMINAL_DATA[0].instruments[0]);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch quotes for all instruments
  const fetchQuotes = useCallback(async () => {
    const all = TERMINAL_DATA.flatMap((c) => c.instruments);
    const results: Record<string, QuoteData> = {};

    await Promise.allSettled(
      all.map(async (inst) => {
        try {
          const res = await fetch(`/api/quote?source=${inst.source}&ticker=${inst.dataTicker}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.price) {
            results[`${inst.source}:${inst.dataTicker}`] = {
              price: data.price,
              change: data.change || 0,
              changePercent: data.changePercent || 0,
              open: data.open, high: data.high, low: data.low, volume: data.volume,
            };
          }
        } catch {}
      })
    );
    setQuotes((prev) => ({ ...prev, ...results }));
  }, []);

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 15000);
    return () => clearInterval(interval);
  }, [fetchQuotes]);

  const q = quotes[`${selected.source}:${selected.dataTicker}`];

  // Search filter
  const filteredCategories = search
    ? TERMINAL_DATA.map((cat) => ({
        ...cat,
        instruments: cat.instruments.filter((i) =>
          i.ticker.toLowerCase().includes(search.toLowerCase()) ||
          i.name.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((cat) => cat.instruments.length > 0)
    : TERMINAL_DATA;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2">
      {/* Top bar: ticker info + price */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow px-3 md:px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile menu button */}
          <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-1.5 -ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          {/* Instrument info */}
          <div className="flex items-center gap-2 min-w-0">
            <img src={selected.emoji} alt="" className="w-7 h-7 md:w-8 md:h-8 rounded-full shrink-0" />
            <div>
              <div className="text-lg font-black dark:text-gray-100 leading-tight">{selected.ticker}</div>
              <div className="text-[11px] text-gray-400 leading-tight">{selected.name} · {selected.source === "moex" ? "MOEX" : "Bybit"}</div>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700/50" />

          {/* Price + change */}
          {q ? (
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xl font-bold dark:text-gray-100">{fmtPrice(q.price)}</div>
                <div className={`text-xs font-semibold ${q.change >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {q.change >= 0 ? "+" : ""}{q.change.toFixed(2)} ({q.changePercent?.toFixed(2)}%)
                </div>
              </div>
              {/* OHLV */}
              <div className="hidden md:flex items-center gap-4 text-xs">
                {q.open != null && <span><span className="text-gray-400">O</span> <span className="font-medium dark:text-gray-200">{fmtPrice(q.open)}</span></span>}
                {q.high != null && <span><span className="text-gray-400">H</span> <span className="font-medium text-green-600">{fmtPrice(q.high)}</span></span>}
                {q.low != null && <span><span className="text-gray-400">L</span> <span className="font-medium text-red-500">{fmtPrice(q.low)}</span></span>}
                {q.volume != null && <span><span className="text-gray-400">V</span> <span className="font-medium dark:text-gray-200">{fmtVol(q.volume)}</span></span>}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 animate-pulse">...</div>
          )}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800">
              <span className="font-semibold text-sm dark:text-gray-100">Инструменты</span>
              <button onClick={() => setMobileMenuOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-2 shrink-0">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input type="text" placeholder={t("terminal.search")} value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-1">
              {filteredCategories.map((cat) => (
                <CategorySection key={cat.name} cat={cat} selected={selected} onSelect={(inst) => { setSelected(inst); setMobileMenuOpen(false); }} quotes={quotes} tFn={t} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main: sidebar + chart */}
      <div className="flex gap-2 flex-1 min-h-0 overflow-hidden">
        {/* Sidebar — desktop only */}
        <div className="hidden md:flex md:flex-col w-72 shrink-0 bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
          <div className="p-2 shrink-0">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input type="text" placeholder={t("terminal.search")} value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-green-500" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-1">
            {filteredCategories.map((cat) => (
              <CategorySection key={cat.name} cat={cat} selected={selected} onSelect={setSelected} quotes={quotes} tFn={t} />
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 overflow-hidden min-w-0">
          <ChartWidget
            key={`${selected.source}-${selected.dataTicker}`}
            ticker={selected.dataTicker}
            source={selected.source}
            name={selected.name}
            height={0}
          />
        </div>
      </div>
    </div>
  );
}
