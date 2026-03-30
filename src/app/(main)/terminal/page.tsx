"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { DataSource } from "@/components/instruments/ChartWidget";

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

const TERMINAL_DATA: TerminalCategory[] = [
  {
    name: "Акции ММВБ", emoji: "🇷🇺", color: "#3b82f6",
    instruments: [
      { ticker: "SBER", name: "Сбербанк", source: "moex", dataTicker: "SBER", emoji: "🏦" },
      { ticker: "GAZP", name: "Газпром", source: "moex", dataTicker: "GAZP", emoji: "🔥" },
      { ticker: "LKOH", name: "ЛУКОЙЛ", source: "moex", dataTicker: "LKOH", emoji: "🛢️" },
      { ticker: "YDEX", name: "Яндекс", source: "moex", dataTicker: "YDEX", emoji: "🔍" },
      { ticker: "ROSN", name: "Роснефть", source: "moex", dataTicker: "ROSN", emoji: "⛽" },
      { ticker: "GMKN", name: "Норникель", source: "moex", dataTicker: "GMKN", emoji: "⚙️" },
      { ticker: "NVTK", name: "Новатэк", source: "moex", dataTicker: "NVTK", emoji: "💨" },
      { ticker: "VTBR", name: "ВТБ", source: "moex", dataTicker: "VTBR", emoji: "🏛️" },
      { ticker: "TCSG", name: "Тинькофф", source: "moex", dataTicker: "TCSG", emoji: "💛" },
      { ticker: "MGNT", name: "Магнит", source: "moex", dataTicker: "MGNT", emoji: "🛒" },
    ],
  },
  {
    name: "Сырьё", emoji: "🛢️", color: "#f59e0b",
    instruments: [
      { ticker: "BR", name: "Нефть Brent", source: "moex", dataTicker: "BR", emoji: "🛢️" },
      { ticker: "NG", name: "Газ", source: "moex", dataTicker: "NG", emoji: "🔥" },
      { ticker: "CC", name: "Какао", source: "moex", dataTicker: "COCOA", emoji: "🍫" },
      { ticker: "KC", name: "Кофе", source: "moex", dataTicker: "COFFEE", emoji: "☕" },
      { ticker: "WHEAT", name: "Пшеница", source: "moex", dataTicker: "WHEAT", emoji: "🌾" },
    ],
  },
  {
    name: "Металлы", emoji: "🥇", color: "#eab308",
    instruments: [
      { ticker: "GOLD", name: "Золото", source: "moex", dataTicker: "GOLD", emoji: "🥇" },
      { ticker: "SILV", name: "Серебро", source: "moex", dataTicker: "SILV", emoji: "🥈" },
      { ticker: "PLT", name: "Платина", source: "moex", dataTicker: "PLT", emoji: "⬜" },
      { ticker: "PLD", name: "Палладий", source: "moex", dataTicker: "PLD", emoji: "🔘" },
      { ticker: "CU", name: "Медь", source: "moex", dataTicker: "CU", emoji: "🟤" },
    ],
  },
  {
    name: "Валюта", emoji: "💱", color: "#10b981",
    instruments: [
      { ticker: "Si", name: "Доллар/Рубль", source: "moex", dataTicker: "Si", emoji: "💵" },
      { ticker: "CR", name: "Юань/Рубль", source: "moex", dataTicker: "CR", emoji: "💴" },
    ],
  },
  {
    name: "Индексы", emoji: "📊", color: "#8b5cf6",
    instruments: [
      { ticker: "MIX", name: "Фьючерс ММВБ", source: "moex", dataTicker: "MIX", emoji: "🇷🇺" },
      { ticker: "RTS", name: "Фьючерс РТС", source: "moex", dataTicker: "RTS", emoji: "📈" },
      { ticker: "SPYF", name: "Фьючерс S&P 500", source: "moex", dataTicker: "SPYF", emoji: "🇺🇸" },
      { ticker: "NASD", name: "Фьючерс NASDAQ", source: "moex", dataTicker: "NASD", emoji: "💻" },
    ],
  },
  {
    name: "Криптовалюты", emoji: "₿", color: "#f97316",
    instruments: [
      { ticker: "BTCUSDT", name: "Bitcoin", source: "bybit", dataTicker: "BTCUSDT", emoji: "₿" },
      { ticker: "ETHUSDT", name: "Ethereum", source: "bybit", dataTicker: "ETHUSDT", emoji: "⟠" },
      { ticker: "SOLUSDT", name: "Solana", source: "bybit", dataTicker: "SOLUSDT", emoji: "◎" },
      { ticker: "XRPUSDT", name: "XRP", source: "bybit", dataTicker: "XRPUSDT", emoji: "✕" },
      { ticker: "BNBUSDT", name: "BNB", source: "bybit", dataTicker: "BNBUSDT", emoji: "🔶" },
      { ticker: "DOGEUSDT", name: "Dogecoin", source: "bybit", dataTicker: "DOGEUSDT", emoji: "🐕" },
      { ticker: "ADAUSDT", name: "Cardano", source: "bybit", dataTicker: "ADAUSDT", emoji: "🔵" },
      { ticker: "AVAXUSDT", name: "Avalanche", source: "bybit", dataTicker: "AVAXUSDT", emoji: "🔺" },
      { ticker: "TONUSDT", name: "Toncoin", source: "bybit", dataTicker: "TONUSDT", emoji: "💎" },
      { ticker: "SUIUSDT", name: "Sui", source: "bybit", dataTicker: "SUIUSDT", emoji: "🌊" },
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
function CategorySection({ cat, selected, onSelect, quotes }: {
  cat: TerminalCategory;
  selected: TerminalInstrument | null;
  onSelect: (inst: TerminalInstrument) => void;
  quotes: Record<string, QuoteData>;
}) {
  const hasSelected = cat.instruments.some((i) => i.dataTicker === selected?.dataTicker);
  const [open, setOpen] = useState(hasSelected);

  return (
    <div className="mb-1">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition"
        style={{ color: cat.color }}>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path d="M9 5l7 7-7 7" />
        </svg>
        <span>{cat.emoji}</span>
        <span>{cat.name}</span>
        <span className="text-[10px] text-gray-400 ml-auto font-normal">{cat.instruments.length}</span>
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
                <span className="text-lg shrink-0">{inst.emoji}</span>
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
  const [selected, setSelected] = useState<TerminalInstrument>(TERMINAL_DATA[0].instruments[0]);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [search, setSearch] = useState("");

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
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-4">
          {/* Instrument info */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{selected.emoji}</span>
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
            <div className="text-sm text-gray-400 animate-pulse">Загрузка...</div>
          )}
        </div>
      </div>

      {/* Main: sidebar + chart */}
      <div className="flex gap-2 flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 shrink-0 bg-white dark:bg-gray-900 rounded-xl shadow flex flex-col overflow-hidden">
          <div className="p-2 shrink-0">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input type="text" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-green-500" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-1">
            {filteredCategories.map((cat) => (
              <CategorySection key={cat.name} cat={cat} selected={selected} onSelect={setSelected} quotes={quotes} />
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
