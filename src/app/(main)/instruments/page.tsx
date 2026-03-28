"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface Exchange {
  id: string;
  name: string;
  slug: string;
  shortName: string;
  country: string;
  _count: { instruments: number };
}

interface Instrument {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
  instrumentType: string | null;
  description: string | null;
  externalUrl: string | null;
  category: { id: string; name: string; slug: string } | null;
  exchangeRel: { id: string; shortName: string; slug: string; country: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  stock: "Акции",
  futures: "Фьючерсы",
  spot: "Спот",
  currency: "Валюты",
  crypto: "Крипто",
};

const COUNTRY_FLAGS: Record<string, string> = {
  RU: "🇷🇺",
  US: "🇺🇸",
  CN: "🇨🇳",
  GB: "🇬🇧",
  SPOT: "🌐",
};

export default function InstrumentsCatalogPage() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeExchange, setActiveExchange] = useState<string>("all");
  const [activeType, setActiveType] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/exchanges").then(r => r.json()),
      fetch("/api/instruments").then(r => r.json()),
    ]).then(([ex, instr]) => {
      setExchanges(Array.isArray(ex) ? ex : []);
      setInstruments(Array.isArray(instr) ? instr : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const types = useMemo(() => {
    const set = new Set<string>();
    instruments.forEach(i => { if (i.instrumentType) set.add(i.instrumentType); });
    return [...set].sort();
  }, [instruments]);

  const filtered = useMemo(() => {
    return instruments.filter(i => {
      if (activeExchange !== "all" && i.exchangeRel?.slug !== activeExchange) return false;
      if (activeType !== "all" && i.instrumentType !== activeType) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = i.name.toLowerCase().includes(q);
        const matchTicker = i.ticker?.toLowerCase().includes(q);
        const matchDesc = i.description?.toLowerCase().includes(q);
        if (!matchName && !matchTicker && !matchDesc) return false;
      }
      return true;
    });
  }, [instruments, activeExchange, activeType, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; instruments: Instrument[] }>();
    filtered.forEach(i => {
      const key = i.category?.slug || "uncategorized";
      const name = i.category?.name || "Без категории";
      if (!map.has(key)) map.set(key, { name, instruments: [] });
      map.get(key)!.instruments.push(i);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const pillClass = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
      active
        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold dark:text-gray-100">Каталог инструментов</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {instruments.length} инструментов на {exchanges.length} биржах
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {/* Exchange filter */}
        <button onClick={() => setActiveExchange("all")} className={pillClass(activeExchange === "all")}>
          Все биржи
        </button>
        {exchanges.map(ex => (
          <button
            key={ex.slug}
            onClick={() => setActiveExchange(ex.slug)}
            className={pillClass(activeExchange === ex.slug)}
          >
            {COUNTRY_FLAGS[ex.country] || ""} {ex.shortName}
            <span className="ml-1 text-xs opacity-60">{ex._count.instruments}</span>
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        {/* Type filter */}
        <button onClick={() => setActiveType("all")} className={pillClass(activeType === "all")}>
          Все типы
        </button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={pillClass(activeType === t)}
          >
            {TYPE_LABELS[t] || t}
          </button>
        ))}

        {/* Search */}
        <div className="ml-auto relative shrink-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Поиск..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 focus:ring-1 focus:ring-green-500 w-48"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Инструменты не найдены</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Попробуйте изменить фильтры</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.name}>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                {group.name}
                <span className="ml-2 text-xs font-normal">{group.instruments.length}</span>
              </h3>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
                {/* Table header */}
                <div className="hidden sm:grid grid-cols-[1fr_80px_80px_100px_1fr_80px] gap-2 px-4 py-2 text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium border-b border-gray-100 dark:border-gray-800/30">
                  <span>Инструмент</span>
                  <span>Тикер</span>
                  <span>Биржа</span>
                  <span>Тип</span>
                  <span>Описание</span>
                  <span></span>
                </div>
                {group.instruments.map(inst => (
                  <Link
                    key={inst.id}
                    href={`/instruments/${inst.slug}`}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_80px_80px_100px_1fr_80px] gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition items-center border-b border-gray-50 dark:border-gray-800/20 last:border-b-0"
                  >
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                      {inst.name}
                    </span>
                    <span className="text-xs font-mono font-bold text-green-600 dark:text-green-400">
                      {inst.ticker || "—"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {inst.exchangeRel ? `${COUNTRY_FLAGS[inst.exchangeRel.country] || ""} ${inst.exchangeRel.shortName}` : "—"}
                    </span>
                    <span className="text-xs">
                      {inst.instrumentType && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          {TYPE_LABELS[inst.instrumentType] || inst.instrumentType}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate hidden sm:block">
                      {inst.description || ""}
                    </span>
                    <span className="text-xs text-green-600 dark:text-green-400 text-right">
                      Открыть →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
