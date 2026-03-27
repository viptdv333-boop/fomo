"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface Category {
  id: string;
  name: string;
}

interface Exchange {
  id: string;
  name: string;
  shortName: string;
}

interface Instrument {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  categoryId: string | null;
  category: Category | null;
  exchangeId: string | null;
  exchange: Exchange | null;
  instrumentType: string | null;
  description: string | null;
  externalUrl: string | null;
  tradingViewSymbol: string | null;
  dataSource: string | null;
  dataTicker: string | null;
  createdAt: string;
}

interface RelatedInstrument {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: Exchange | null;
}

const INSTRUMENT_TYPES = [
  { value: "", label: "Не выбрано" },
  { value: "stock", label: "Акция (stock)" },
  { value: "futures", label: "Фьючерс (futures)" },
  { value: "spot", label: "Спот (spot)" },
  { value: "currency", label: "Валюта (currency)" },
  { value: "crypto", label: "Криптовалюта (crypto)" },
];

const DATA_SOURCES = [
  { value: "", label: "Не выбрано" },
  { value: "moex", label: "MOEX" },
  { value: "bybit", label: "Bybit" },
];

function generateSlug(ticker: string) {
  return ticker
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function AdminInstrumentsPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    ticker: "",
    categoryId: "",
    exchangeId: "",
    instrumentType: "",
    description: "",
    externalUrl: "",
    tradingViewSymbol: "",
    dataSource: "",
    dataTicker: "",
  });

  // Related instruments state
  const [relatedInstruments, setRelatedInstruments] = useState<RelatedInstrument[]>([]);
  const [relatedSearch, setRelatedSearch] = useState("");
  const [relatedResults, setRelatedResults] = useState<Instrument[]>([]);
  const [showRelatedDropdown, setShowRelatedDropdown] = useState(false);
  const relatedSearchRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = useCallback(() => {
    setEditSlug(null);
    setForm({
      name: "",
      slug: "",
      ticker: "",
      categoryId: "",
      exchangeId: "",
      instrumentType: "",
      description: "",
      externalUrl: "",
      tradingViewSymbol: "",
      dataSource: "",
      dataTicker: "",
    });
    setRelatedInstruments([]);
    setRelatedSearch("");
    setRelatedResults([]);
  }, []);

  async function loadInstruments() {
    setLoading(true);
    const res = await fetch("/api/instruments");
    setInstruments(await res.json());
    setLoading(false);
  }

  async function loadCategories() {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }

  async function loadExchanges() {
    const res = await fetch("/api/exchanges");
    setExchanges(await res.json());
  }

  async function loadRelated(slug: string) {
    const res = await fetch(`/api/instruments/${slug}/related`);
    if (res.ok) {
      setRelatedInstruments(await res.json());
    }
  }

  useEffect(() => {
    loadInstruments();
    loadCategories();
    loadExchanges();
  }, []);

  // Close related dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (relatedSearchRef.current && !relatedSearchRef.current.contains(e.target as Node)) {
        setShowRelatedDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function updateForm(field: string, value: string) {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      // Auto-generate slug from ticker
      if (field === "ticker" && !editSlug) {
        updated.slug = generateSlug(value);
      }
      return updated;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name,
      slug: form.slug,
      ticker: form.ticker,
      categoryId: form.categoryId || null,
      exchangeId: form.exchangeId || null,
      instrumentType: form.instrumentType || null,
      description: form.description || null,
      externalUrl: form.externalUrl || null,
      tradingViewSymbol: form.tradingViewSymbol || null,
      dataSource: form.dataSource || null,
      dataTicker: form.dataTicker || null,
    };

    if (editSlug) {
      await fetch(`/api/instruments/${editSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/instruments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    const savedSlug = form.slug;
    resetForm();
    await loadInstruments();

    // If editing, stay in edit mode to manage related
    if (editSlug) {
      const updated = instruments.find((i) => i.slug === savedSlug);
      if (updated) startEdit(updated);
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm("Удалить инструмент? Связанный чат-рум тоже будет удалён.")) return;
    await fetch(`/api/instruments/${slug}`, { method: "DELETE" });
    if (editSlug === slug) resetForm();
    loadInstruments();
  }

  function startEdit(instrument: Instrument) {
    setEditSlug(instrument.slug);
    setForm({
      name: instrument.name,
      slug: instrument.slug,
      ticker: instrument.ticker || "",
      categoryId: instrument.categoryId || "",
      exchangeId: instrument.exchangeId || "",
      instrumentType: instrument.instrumentType || "",
      description: instrument.description || "",
      externalUrl: instrument.externalUrl || "",
      tradingViewSymbol: instrument.tradingViewSymbol || "",
      dataSource: instrument.dataSource || "",
      dataTicker: instrument.dataTicker || "",
    });
    loadRelated(instrument.slug);
  }

  async function searchRelated(query: string) {
    setRelatedSearch(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (query.length < 2) {
      setRelatedResults([]);
      setShowRelatedDropdown(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      const res = await fetch(`/api/instruments?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const results: Instrument[] = await res.json();
        // Filter out current instrument and already related
        const relatedIds = new Set(relatedInstruments.map((r) => r.id));
        const filtered = results.filter(
          (r) => r.slug !== editSlug && !relatedIds.has(r.id)
        );
        setRelatedResults(filtered);
        setShowRelatedDropdown(filtered.length > 0);
      }
    }, 300);
  }

  async function addRelated(instrument: Instrument) {
    if (!editSlug) return;
    await fetch(`/api/instruments/${editSlug}/related`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relatedId: instrument.id }),
    });
    setRelatedSearch("");
    setRelatedResults([]);
    setShowRelatedDropdown(false);
    loadRelated(editSlug);
  }

  async function removeRelated(relatedId: string) {
    if (!editSlug) return;
    await fetch(`/api/instruments/${editSlug}/related`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relatedId }),
    });
    loadRelated(editSlug);
  }

  const inputClass =
    "w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Инструменты</h1>

      {/* Create / Edit Form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">
          {editSlug ? "Редактировать" : "Добавить"} инструмент
        </h2>

        {/* Row 1: Ticker, Slug, Name */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelClass}>
              Тикер <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => updateForm("ticker", e.target.value)}
              required
              className={inputClass}
              placeholder="BR, CL, SBER"
            />
          </div>
          <div>
            <label className={labelClass}>
              Slug (URL) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => updateForm("slug", e.target.value)}
              required
              className={inputClass}
              placeholder="br"
            />
            <p className="text-xs text-gray-400 mt-1">Авто из тикера</p>
          </div>
          <div>
            <label className={labelClass}>
              Название <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              required
              className={inputClass}
              placeholder="Нефть Brent фьючерс"
            />
          </div>
        </div>

        {/* Row 2: Category, Exchange, Type */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelClass}>Категория</label>
            <select
              value={form.categoryId}
              onChange={(e) => updateForm("categoryId", e.target.value)}
              className={inputClass}
            >
              <option value="">Без категории</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Биржа</label>
            <select
              value={form.exchangeId}
              onChange={(e) => updateForm("exchangeId", e.target.value)}
              className={inputClass}
            >
              <option value="">Не выбрана</option>
              {exchanges.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.shortName} — {ex.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Тип инструмента</label>
            <select
              value={form.instrumentType}
              onChange={(e) => updateForm("instrumentType", e.target.value)}
              className={inputClass}
            >
              {INSTRUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: TradingView, DataSource, DataTicker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelClass}>TradingView символ</label>
            <input
              type="text"
              value={form.tradingViewSymbol}
              onChange={(e) => updateForm("tradingViewSymbol", e.target.value)}
              className={inputClass}
              placeholder="MOEX:BR1!"
            />
          </div>
          <div>
            <label className={labelClass}>Источник данных</label>
            <select
              value={form.dataSource}
              onChange={(e) => updateForm("dataSource", e.target.value)}
              className={inputClass}
            >
              {DATA_SOURCES.map((ds) => (
                <option key={ds.value} value={ds.value}>
                  {ds.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Тикер для данных (dataTicker)</label>
            <input
              type="text"
              value={form.dataTicker}
              onChange={(e) => updateForm("dataTicker", e.target.value)}
              className={inputClass}
              placeholder="BR-6.25"
            />
          </div>
        </div>

        {/* Row 4: External URL */}
        <div className="mb-4">
          <label className={labelClass}>Внешняя ссылка (externalUrl)</label>
          <input
            type="url"
            value={form.externalUrl}
            onChange={(e) => updateForm("externalUrl", e.target.value)}
            className={inputClass}
            placeholder="https://www.moex.com/ru/contract.aspx?code=BR-6.25"
          />
        </div>

        {/* Row 5: Description */}
        <div className="mb-4">
          <label className={labelClass}>Описание</label>
          <textarea
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            className={inputClass + " min-h-[80px]"}
            rows={3}
            placeholder="Краткое описание инструмента..."
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition"
          >
            {editSlug ? "Сохранить" : "Добавить"}
          </button>
          {editSlug && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition"
            >
              Отмена
            </button>
          )}
        </div>
      </form>

      {/* Related Instruments Section */}
      {editSlug && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">
            Связанные инструменты
          </h2>

          {/* Related chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {relatedInstruments.length === 0 && (
              <span className="text-sm text-gray-400 dark:text-gray-500">
                Нет связанных инструментов
              </span>
            )}
            {relatedInstruments.map((rel) => (
              <span
                key={rel.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-sm rounded-full text-gray-800 dark:text-gray-200"
              >
                <span className="font-semibold">{rel.ticker || rel.slug}</span>
                {rel.exchange && (
                  <span className="text-gray-500 dark:text-gray-400">
                    ({rel.exchange.shortName})
                  </span>
                )}
                <button
                  onClick={() => removeRelated(rel.id)}
                  className="ml-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition"
                  title="Удалить связь"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>

          {/* Search to add related */}
          <div className="relative" ref={relatedSearchRef}>
            <label className={labelClass}>Добавить связанный инструмент</label>
            <input
              type="text"
              value={relatedSearch}
              onChange={(e) => searchRelated(e.target.value)}
              onFocus={() => relatedResults.length > 0 && setShowRelatedDropdown(true)}
              className={inputClass}
              placeholder="Поиск по тикеру или названию..."
            />
            {showRelatedDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {relatedResults.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => addRelated(inst)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm dark:text-gray-200 flex items-center gap-2"
                  >
                    <span className="font-semibold">{inst.ticker || inst.slug}</span>
                    <span className="text-gray-500 dark:text-gray-400">{inst.name}</span>
                    {inst.exchange && (
                      <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                        {inst.exchange.shortName}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instrument List */}
      {loading ? (
        <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm dark:text-gray-300">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                  Тикер
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                  Название
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                  Биржа
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                  Тип
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                  Категория
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {instruments.map((inst) => (
                <tr key={inst.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {inst.ticker || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 dark:text-gray-200">{inst.name}</td>
                  <td className="px-4 py-3">
                    {inst.exchange ? (
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                        {inst.exchange.shortName}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {inst.instrumentType ? (
                      <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs">
                        {inst.instrumentType}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {inst.category ? (
                      <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs">
                        {inst.category.name}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => startEdit(inst)}
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-xs font-medium"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(inst.slug)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {instruments.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Нет инструментов
            </div>
          )}
        </div>
      )}
    </div>
  );
}
