"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { FuturesInstrument, FuturesSpec } from "@/lib/moex-futures-spec";
import { useT } from "@/lib/i18n/client";
import { useAppUi } from "@/components/app/useAppUi";
import { isNativeUi } from "@/lib/native-app";
import { RISK_PRESETS, calcPosition, fmtRub, intlLocale, type CalcResult } from "@/lib/futures-calc";
import { useMacSkin } from "@/lib/chart/mac-skin";
import CalcGlyph, { CalcTile, type CalcGlyphName } from "@/components/calculator/CalcGlyph";
import "@/components/calculator/calculator-mac.css";

// the app UI (Android / Windows app, ?appui=1) draws its own calculator screen; it is loaded only there (the browser's page below never pays for it).
// The math is the same function (src/lib/futures-calc.ts calcPosition) in both.
const AppCalculator = dynamic(() => import("@/components/app/calculator/AppCalculator"), { ssr: false });

function AssetPicker({
  instruments,
  selected,
  onSelect,
}: {
  instruments: FuturesInstrument[];
  selected: FuturesInstrument | null;
  onSelect: (i: FuturesInstrument) => void;
}) {
  const { t } = useT();
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
        className="calc-pick w-full flex items-center gap-2 px-3 py-2.5 border dark:border-gray-700 rounded-lg dark:bg-gray-800 text-left hover:border-green-500 transition"
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
          <span className="flex-1 text-gray-400">{t("calc.selectFutures")}</span>
        )}
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="calc-pop absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b dark:border-gray-800">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("calc.searchPlaceholder")}
              className="calc-search w-full px-2.5 py-1.5 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">{t("calc.nothingFound")}</div>
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
                  className={`calc-opt w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
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
    <div className="calc-f">
      <label className="calc-lbl block text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="calc-in w-full px-3 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
      />
    </div>
  );
}

export default function CalculatorPage() {
  const appUi = useAppUi();
  return appUi ? <AppCalculator /> : <SiteCalculator />;
}

/** one number of the result in the new look: a duotone glyph, the caption and the value */
function Stat({ g, label, value, tone }: { g: CalcGlyphName; label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="calc-stat" data-tone={tone}>
      <CalcTile name={g} size={38} />
      <span className="calc-stat-t">
        <small>{label}</small>
        <b>{value}</b>
      </span>
    </div>
  );
}

function SiteCalculator() {
  const { t, locale } = useT();
  // the optional "macOS" look (the same per-device switch as the terminal's; only a wide fine-pointer window): wallpaper, glass card, Golos Text
  const skin = useMacSkin(true);
  const mac = skin.on;
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
    if (isNativeUi()) return; // the first frame of the app is the site page until the app UI flag is read: no request for a screen that is replaced at once
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
        // specError holds either a server-provided message or an i18n key; rendered via t()
        setSpecError(data.error || "calc.specError");
        setSpec(null);
        return;
      }
      setSpec(data);
      setEntry((prev) => (prev.trim() ? prev : String(data.last ?? data.offer ?? data.bid ?? "")));
    } catch {
      setSpecError("calc.specError");
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

  const calc: CalcResult | null = useMemo(
    () => (spec ? calcPosition(spec, { deposit, entry, stop, take, riskPercent }) : null),
    [spec, deposit, entry, stop, take, riskPercent],
  );

  const title = mac ? t("calc.title").replace(/^\p{Extended_Pictographic}️?\s*/u, "") : t("calc.title");
  const header = mac ? (
    <div className="calc-hero">
      <CalcTile name="calc" size={52} />
      <div className="calc-hero-t">
        <h1>{title}</h1>
        <p>{t("calc.subtitle")}</p>
      </div>
    </div>
  ) : (
    <>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">{title}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t("calc.subtitle")}
      </p>
    </>
  );

  return (
    <div className={`max-w-2xl w-full mx-auto${mac ? " calc-mac" : ""}`}>
      {!mac && header}

      <div className="calc-card bg-white dark:bg-gray-900 rounded-xl shadow p-6 space-y-5">
        {mac && header}
        <div>
          <label className="calc-lbl block text-sm text-gray-600 dark:text-gray-400 mb-1">{t("calc.asset")}</label>
          <AssetPicker instruments={instruments} selected={selected} onSelect={handleSelect} />

          {specLoading && <p className="text-xs text-gray-400 mt-1.5">{t("calc.loadingSpec")}</p>}
          {specError && <p className="text-xs text-red-500 mt-1.5">{t(specError)}</p>}
          {spec && !specLoading && (
            <div className="calc-spec mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono">{spec.secid}</span>
              <span>·</span>
              <span>{t("calc.expiry", { date: new Date(spec.expiry).toLocaleDateString(intlLocale(locale)) })}</span>
              {spec.last != null && (
                <>
                  <span>·</span>
                  <span>{t("calc.lastPrice", { price: spec.last })}</span>
                </>
              )}
              <button
                type="button"
                onClick={() => selected && loadSpec(selected.ticker)}
                className="calc-refresh text-green-600 hover:underline"
              >
                {t("calc.refresh")}
              </button>
            </div>
          )}
        </div>

        {mac && <div className="calc-cap">{t("appcalc.trade")}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField label={t("calc.deposit")} value={deposit} onChange={setDeposit} placeholder={t("calc.depositPlaceholder")} />
          <NumberField label={t("calc.entry")} value={entry} onChange={setEntry} />
          <NumberField label={t("calc.stop")} value={stop} onChange={setStop} />
          <NumberField label={t("calc.take")} value={take} onChange={setTake} />
        </div>

        <div>
          <label className={`${mac ? "calc-cap" : "block text-sm text-gray-600 dark:text-gray-400 mb-1.5"} block`}>{t("calc.riskPerTrade")}</label>
          <div className="calc-seg flex gap-2" role="group" aria-label={t("calc.riskPerTrade")}>
            {RISK_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRiskPercent(p)}
                data-on={riskPercent === p ? "1" : undefined}
                aria-pressed={riskPercent === p}
                className={`calc-seg-b px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
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
        <div className="calc-res pt-2 border-t dark:border-gray-800">
          {!selected ? (
            <p className="calc-hint text-sm text-gray-400 py-2">{t("calc.selectAssetHint")}</p>
          ) : calc && calc.error ? (
            <p className="calc-hint text-sm text-amber-600 dark:text-amber-400 py-2">{t(calc.error)}</p>
          ) : calc ? (
            mac ? (
              <div className="calc-out">
                <div className="calc-big" data-zero={calc.contracts === 0 ? "1" : undefined}>
                  <span className="calc-big-k">{t("calc.contracts").replace(/[:：]\s*$/, "")}</span>
                  <span className="calc-big-n">{calc.contracts}</span>
                </div>
                {calc.contracts === 0 ? (
                  <p className="calc-warn">{t("calc.tooRisky", { perContract: fmtRub(calc.riskPerContract, locale), budget: fmtRub(calc.riskBudget, locale) })}</p>
                ) : (
                  <div className="calc-stats">
                    <Stat g="shield" label={t("calc.actualRisk")} value={fmtRub(calc.actualRisk, locale)} />
                    <Stat g="gauge" label={t("calc.riskLimit", { pct: riskPercent })} value={fmtRub(calc.riskBudget, locale)} />
                    <Stat g="wallet" label={t("calc.requiredMargin")} value={fmtRub(calc.requiredMargin, locale)} tone={calc.marginShort ? "bad" : undefined} />
                    {calc.potentialProfit != null && (
                      <>
                        <Stat g="profit" label={t("calc.potentialProfit")} value={fmtRub(calc.potentialProfit, locale)} tone="good" />
                        <Stat g="scale" label={t("calc.rr")} value={`1 : ${calc.rr!.toFixed(2)}`} />
                      </>
                    )}
                  </div>
                )}
                {calc.marginShort && <p className="calc-warn" data-bad="1">{t("calc.marginShort")}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{t("calc.contracts")}</span>
                  <span className="text-3xl font-bold text-green-600 dark:text-green-400">{calc.contracts}</span>
                </div>

                {calc.contracts === 0 ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {t("calc.tooRisky", { perContract: fmtRub(calc.riskPerContract, locale), budget: fmtRub(calc.riskBudget, locale) })}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t("calc.actualRisk")}</span>
                    <span className="text-gray-900 dark:text-gray-100 text-right">{fmtRub(calc.actualRisk, locale)}</span>

                    <span className="text-gray-500 dark:text-gray-400">{t("calc.riskLimit", { pct: riskPercent })}</span>
                    <span className="text-gray-900 dark:text-gray-100 text-right">{fmtRub(calc.riskBudget, locale)}</span>

                    <span className="text-gray-500 dark:text-gray-400">{t("calc.requiredMargin")}</span>
                    <span className={`text-right ${calc.marginShort ? "text-red-500 font-medium" : "text-gray-900 dark:text-gray-100"}`}>
                      {fmtRub(calc.requiredMargin, locale)}
                    </span>

                    {calc.potentialProfit != null && (
                      <>
                        <span className="text-gray-500 dark:text-gray-400">{t("calc.potentialProfit")}</span>
                        <span className="text-green-600 dark:text-green-400 text-right">{fmtRub(calc.potentialProfit, locale)}</span>
                        <span className="text-gray-500 dark:text-gray-400">{t("calc.rr")}</span>
                        <span className="text-gray-900 dark:text-gray-100 text-right">1 : {calc.rr!.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                )}

                {calc.marginShort && (
                  <p className="text-sm text-red-500">
                    {t("calc.marginShort")}
                  </p>
                )}
              </div>
            )
          ) : null}
        </div>
      </div>

      <p className="calc-disc text-xs text-gray-400 mt-3">
        {t("calc.disclaimer")}
      </p>

      {/* the way in / out of the new look, like the terminal's: a quiet button under the card */}
      {(mac || skin.canOffer) && (
        <button type="button" className="calc-skin" onClick={() => skin.set(!mac)} title={t(mac ? "mac.classicTip" : "mac.tryTip")} data-mac-try={mac ? undefined : ""}>
          {mac ? t("mac.classic") : t("mac.try")}
        </button>
      )}
    </div>
  );
}
