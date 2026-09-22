"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FuturesInstrument, FuturesSpec } from "@/lib/moex-futures-spec";

const RISK_PRESETS = [0.5, 1, 1.5, 2];

const RUB = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
function fmtRub(n: number): string {
  return `${RUB.format(Math.round(n))} ₽`;
}

function AssetPicker({
  instruments,
  selected,
  onSelect,
}: {
  instruments: FuturesInstrument[];
  selected: FuturesInstrument | null;
  onSelect: (i: FuturesInstrument) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = instruments.filter((i) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return i.name.toLowerCase().includes(q) || i.ticker.toLowerCase().includes(q);
  });

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 border dark:border-gray-700 rounded-lg dark:bg-gray-800 text-left hover:border-green-500 transition"
      >
        {selected ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.icon} alt="" className="w-6 h-6 shrink-0" />
            <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-gray-100">
              {selected.name} <span className="text-gray-400 font-mono text-sm">{selected.ticker}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-gray-400">Выберите фьючерс…</span>
        )}
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b dark:border-gray-800">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию или тикеру…"
              className="w-full px-2.5 py-1.5 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Ничего не найдено</div>
            ) : (
              filtered.map((i) => (
                <button
                  key={i.ticker}
                  type="button"
                  onClick={() => {
                    onSelect(i);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
                    selected?.ticker === i.ticker ? "bg-green-50 dark:bg-green-900/20" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.icon} alt="" className="w-5 h-5 shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-gray-100">{i.name}</span>
                  <span className="ml-auto text-xs text-gray-400 font-mono">{i.ticker}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
      />
    </div>
  );
}

export default function CalculatorPage() {
  const [instruments, setInstruments] = useState<FuturesInstrument[]>([]);
  const [selected, setSelected] = useState<FuturesInstrument | null>(null);
  const [spec, setSpec] = useState<FuturesSpec | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);

  const [deposit, setDeposit] = useState("");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [take, setTake] = useState("");
  const [riskPercent, setRiskPercent] = useState(1);

  useEffect(() => {
    fetch("/api/futures/spec")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setInstruments(data))
      .catch(() => {});
  }, []);

  async function loadSpec(ticker: string) {
    setSpecLoading(true);
    setSpecError(null);
    try {
      const res = await fetch(`/api/futures/spec?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setSpecError(data.error || "Не удалось получить данные биржи");
        setSpec(null);
        return;
      }
      setSpec(data);
      setEntry((prev) => (prev.trim() ? prev : String(data.last ?? data.offer ?? data.bid ?? "")));
    } catch {
      setSpecError("Не удалось получить данные биржи");
      setSpec(null);
    } finally {
      setSpecLoading(false);
    }
  }

  function handleSelect(i: FuturesInstrument) {
    setSelected(i);
    setSpec(null);
    loadSpec(i.ticker);
  }

  interface CalcResult {
    error: string | null;
    contracts: number;
    actualRisk: number;
    riskBudget: number;
    riskPerContract: number;
    requiredMargin: number;
    marginShort: boolean;
    potentialProfit: number | null;
    rr: number | null;
  }

  const calc: CalcResult | null = useMemo(() => {
    if (!spec) return null;
    const blank = (error: string): CalcResult => ({
      error,
      contracts: 0,
      actualRisk: 0,
      riskBudget: 0,
      riskPerContract: 0,
      requiredMargin: 0,
      marginShort: false,
      potentialProfit: null,
      rr: null,
    });

    const dep = parseFloat(deposit);
    const en = parseFloat(entry);
    const st = parseFloat(stop);
    const tk = parseFloat(take);

    if (!dep || dep <= 0) return blank("Укажите размер депозита");
    if (!en || !st) return blank("Укажите цену входа и цену стопа");
    const priceRisk = Math.abs(en - st);
    if (priceRisk === 0) return blank("Стоп должен отличаться от цены входа");
    if (!spec.minStep || !spec.stepPrice) return blank("У биржи нет данных о шаге цены по этому контракту");

    const tickValue = spec.stepPrice / spec.minStep;
    const riskBudget = dep * (riskPercent / 100);
    const riskPerContract = priceRisk * tickValue;
    const contracts = Math.floor(riskBudget / riskPerContract);
    const actualRisk = contracts * riskPerContract;
    const requiredMargin = contracts * spec.initialMargin;
    const marginShort = contracts > 0 && requiredMargin > dep;

    let potentialProfit: number | null = null;
    let rr: number | null = null;
    if (tk && !isNaN(tk)) {
      const priceReward = Math.abs(tk - en);
      potentialProfit = contracts * priceReward * tickValue;
      rr = priceReward / priceRisk;
    }

    return { error: null, contracts, actualRisk, riskBudget, riskPerContract, requiredMargin, marginShort, potentialProfit, rr };
  }, [spec, deposit, entry, stop, take, riskPercent]);

  return (
    <div className="max-w-2xl w-full mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">🧮 Калькулятор риска</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Сколько фьючерсных контрактов открыть, чтобы не превысить свой риск на сделку. Актив всегда резолвится в текущий торгуемый контракт, шаг цены, стоимость шага и ГО — с MOEX.
      </p>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 space-y-5">
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Актив</label>
          <AssetPicker instruments={instruments} selected={selected} onSelect={handleSelect} />

          {specLoading && <p className="text-xs text-gray-400 mt-1.5">Получаем данные с биржи…</p>}
          {specError && <p className="text-xs text-red-500 mt-1.5">{specError}</p>}
          {spec && !specLoading && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono">{spec.secid}</span>
              <span>·</span>
              <span>экспирация {new Date(spec.expiry).toLocaleDateString("ru-RU")}</span>
              {spec.last != null && (
                <>
                  <span>·</span>
                  <span>последняя цена {spec.last}</span>
                </>
              )}
              <button
                type="button"
                onClick={() => selected && loadSpec(selected.ticker)}
                className="text-green-600 hover:underline"
              >
                обновить
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField label="Размер депозита, ₽" value={deposit} onChange={setDeposit} placeholder="Например, 100000" />
          <NumberField label="Цена входа" value={entry} onChange={setEntry} />
          <NumberField label="Стоп" value={stop} onChange={setStop} />
          <NumberField label="Тейк (необязательно)" value={take} onChange={setTake} />
        </div>

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">Риск на сделку</label>
          <div className="flex gap-2">
            {RISK_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRiskPercent(p)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
                  riskPercent === p
                    ? "bg-green-600 border-green-600 text-white"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-green-500"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        {/* Result */}
        <div className="pt-2 border-t dark:border-gray-800">
          {!selected ? (
            <p className="text-sm text-gray-400 py-2">Выберите актив, чтобы рассчитать позицию.</p>
          ) : calc && calc.error ? (
            <p className="text-sm text-amber-600 dark:text-amber-400 py-2">{calc.error}</p>
          ) : calc ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Контрактов на сделку:</span>
                <span className="text-3xl font-bold text-green-600 dark:text-green-400">{calc.contracts}</span>
              </div>

              {calc.contracts === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Риск на 1 контракт ≈ {fmtRub(calc.riskPerContract)}, это больше вашего лимита {fmtRub(calc.riskBudget)}. Увеличьте депозит или риск %, либо сузьте стоп.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Риск по факту</span>
                  <span className="text-gray-900 dark:text-gray-100 text-right">{fmtRub(calc.actualRisk)}</span>

                  <span className="text-gray-500 dark:text-gray-400">Лимит риска ({riskPercent}%)</span>
                  <span className="text-gray-900 dark:text-gray-100 text-right">{fmtRub(calc.riskBudget)}</span>

                  <span className="text-gray-500 dark:text-gray-400">Требуемое ГО</span>
                  <span className={`text-right ${calc.marginShort ? "text-red-500 font-medium" : "text-gray-900 dark:text-gray-100"}`}>
                    {fmtRub(calc.requiredMargin)}
                  </span>

                  {calc.potentialProfit != null && (
                    <>
                      <span className="text-gray-500 dark:text-gray-400">Потенциальная прибыль</span>
                      <span className="text-green-600 dark:text-green-400 text-right">{fmtRub(calc.potentialProfit)}</span>
                      <span className="text-gray-500 dark:text-gray-400">Соотношение риск/прибыль</span>
                      <span className="text-gray-900 dark:text-gray-100 text-right">1 : {calc.rr!.toFixed(2)}</span>
                    </>
                  )}
                </div>
              )}

              {calc.marginShort && (
                <p className="text-sm text-red-500">
                  Депозита не хватит на такое ГО — реально доступный объём меньше. Уменьшите риск % или размер депозита в расчёте.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Данные по контракту (шаг цены, стоимость шага, ГО, цена) — с публичного ISS Мосбиржи в реальном времени; у публичного доступа возможна задержка в несколько минут. Это не индивидуальная инвестиционная рекомендация.
      </p>
    </div>
  );
}
