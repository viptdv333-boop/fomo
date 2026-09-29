"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChartEngine } from "@/lib/chart/engine";
import { DARK_THEME, LIGHT_THEME, type Candle, type ChartType } from "@/lib/chart/types";
import { intervalToMs } from "@/lib/chart/format";
import { useT } from "@/lib/i18n/client";

export type ChartSource = "moex" | "fmp" | "bybit" | "none";

interface Props {
  ticker: string;
  source: ChartSource;
  name?: string;
}

interface Prefs {
  interval: string;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  showWatermark: boolean;
  logScale: boolean;
}

const DEFAULT_PREFS: Prefs = {
  interval: "D",
  chartType: "candles",
  showVolume: true,
  showGrid: true,
  showWatermark: true,
  logScale: false,
};

const PREFS_KEY = "fomo-chart-prefs-v1";
const INTERVALS: { id: string; key: string }[] = [
  { id: "1", key: "inst.period.1m" },
  { id: "5", key: "inst.period.5m" },
  { id: "15", key: "inst.period.15m" },
  { id: "60", key: "inst.period.1h" },
  { id: "240", key: "inst.period.4h" },
  { id: "D", key: "inst.period.D" },
  { id: "W", key: "inst.period.W" },
  { id: "M", key: "inst.period.M" },
];
const CHART_TYPES: { id: ChartType; key: string }[] = [
  { id: "candles", key: "chart.type.candles" },
  { id: "hollow", key: "chart.type.hollow" },
  { id: "bars", key: "chart.type.bars" },
  { id: "line", key: "chart.type.line" },
  { id: "area", key: "chart.type.area" },
  { id: "heikin", key: "chart.type.heikin" },
];
const LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", cn: "zh-CN" };
const MSK_MS = 3 * 3_600_000;

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

async function fetchCandles(source: string, ticker: string, interval: string, limit: number, to?: number) {
  let url = `/api/klines?source=${source}&ticker=${encodeURIComponent(ticker)}&interval=${interval}&limit=${limit}`;
  if (to) url += `&to=${to}`;
  const res = await fetch(url);
  if (!res.ok) return { candles: [] as Candle[], tzMin: 0 };
  const j = await res.json();
  const rows: any[] = Array.isArray(j) ? j : j.candles ?? [];
  const candles: Candle[] = rows
    .filter((d) => d && isFinite(d.open) && isFinite(d.close))
    .map((d) => ({ t: d.timestamp, o: d.open, h: d.high, l: d.low, c: d.close, v: d.volume || 0 }));
  return { candles, tzMin: typeof j.serverTzOffsetMin === "number" ? j.serverTzOffsetMin : 0 };
}

/** Start of the bar containing `nowWall` (ms on the exchange's wall clock, read with UTC getters). */
function bucketStartWall(nowWall: number, interval: string): number {
  if (interval === "W") {
    const d = new Date(nowWall);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return d.getTime();
  }
  if (interval === "M") {
    const d = new Date(nowWall);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  const ms = intervalToMs(interval);
  return Math.floor(nowWall / ms) * ms;
}

export default function TradingChart({ ticker, source, name }: Props) {
  const { t, locale } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const shiftRef = useRef({ tzMs: 0, displayShiftMs: 0 });
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const loadingHistory = useRef(false);

  // saved preferences
  useEffect(() => {
    setPrefs(loadPrefs());
    setPrefsLoaded(true);
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // engine lifetime
  useEffect(() => {
    if (!hostRef.current) return;
    const dark = document.documentElement.classList.contains("dark");
    const engine = new ChartEngine(hostRef.current, { theme: dark ? DARK_THEME : LIGHT_THEME });
    engine.onAutoScaleChange = setAutoScale;
    engineRef.current = engine;
    const mo = new MutationObserver(() => {
      engine.setOptions({ theme: document.documentElement.classList.contains("dark") ? DARK_THEME : LIGHT_THEME });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mo.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // options that do not need a reload
  useEffect(() => {
    engineRef.current?.setOptions({
      chartType: prefs.chartType,
      showVolume: prefs.showVolume,
      showGrid: prefs.showGrid,
      showWatermark: prefs.showWatermark,
      logScale: prefs.logScale,
    });
  }, [prefs.chartType, prefs.showVolume, prefs.showGrid, prefs.showWatermark, prefs.logScale]);

  // data for the current symbol and timeframe
  useEffect(() => {
    if (!prefsLoaded) return;
    const engine = engineRef.current;
    if (!engine || source === "none") return;
    let cancelled = false;
    setLoading(true);
    setEmpty(false);
    const iv = prefs.interval;
    const label = t(INTERVALS.find((i) => i.id === iv)?.key ?? "inst.period.D");

    (async () => {
      const { candles, tzMin } = await fetchCandles(source, ticker, iv, 600);
      if (cancelled) return;
      const tzMs = source === "moex" ? tzMin * 60_000 : 0;
      // labels show the exchange's wall clock: MOEX as parsed on the server, others in the viewer's zone
      const displayShiftMs = source === "moex" ? tzMs : -new Date().getTimezoneOffset() * 60_000;
      shiftRef.current = { tzMs, displayShiftMs };
      engine.setOptions({
        symbolLabel: name || ticker,
        intervalLabel: label,
        intervalMs: intervalToMs(iv),
        timeShiftMs: displayShiftMs,
        locale: LOCALES[locale] ?? "ru-RU",
      });
      engine.setData(candles);
      setEmpty(candles.length === 0);
      setLoading(false);
    })();

    engine.onNeedHistory = async () => {
      if (loadingHistory.current || cancelled) return;
      const first = engine.getCandles()[0];
      if (!first) return;
      loadingHistory.current = true;
      try {
        const { candles } = await fetchCandles(source, ticker, iv, 500, first.t - 1);
        if (!cancelled) engine.prependCandles(candles);
      } finally {
        loadingHistory.current = false;
      }
    };

    return () => {
      cancelled = true;
      engine.onNeedHistory = null;
    };
  }, [prefsLoaded, source, ticker, name, prefs.interval, locale, t]);

  // live price: quotes for the forming bar, real bars from the API now and then
  useEffect(() => {
    if (!prefsLoaded || source === "none") return;
    const iv = prefs.interval;
    const intraday = iv !== "D" && iv !== "W" && iv !== "M";
    let stopped = false;

    const pollQuote = async () => {
      const engine = engineRef.current;
      if (stopped || !engine || document.hidden) return;
      const candles = engine.getCandles();
      const last = candles[candles.length - 1];
      if (!last) return;
      try {
        const r = await fetch(`/api/quote?source=${source}&ticker=${encodeURIComponent(ticker)}&_t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const q = await r.json();
        if (!q.price || stopped) return;
        const { tzMs } = shiftRef.current;
        const nowWall = Date.now() + (source === "moex" ? MSK_MS : 0);
        const bucketT = bucketStartWall(nowWall, iv) - tzMs;
        if (bucketT > last.t) {
          engine.upsertCandle({ t: bucketT, o: q.price, h: q.price, l: q.price, c: q.price, v: 0 });
        } else {
          engine.upsertCandle({ ...last, c: q.price, h: Math.max(last.h, q.price), l: Math.min(last.l, q.price) });
        }
      } catch {}
    };

    const refreshBars = async () => {
      const engine = engineRef.current;
      if (stopped || !engine || document.hidden) return;
      try {
        const { candles } = await fetchCandles(source, ticker, iv, 3);
        if (stopped) return;
        for (const c of candles) engine.upsertCandle(c);
      } catch {}
    };

    const q = setInterval(pollQuote, intraday ? 4000 : 12000);
    const b = setInterval(refreshBars, 60_000);
    const first = setTimeout(pollQuote, 1500);
    return () => {
      stopped = true;
      clearInterval(q);
      clearInterval(b);
      clearTimeout(first);
    };
  }, [prefsLoaded, source, ticker, prefs.interval]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.();
  };

  const screenshot = () => {
    const url = engineRef.current?.screenshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker}-${prefs.interval}.png`;
    a.click();
  };

  const btn =
    "px-2 py-1 rounded text-xs font-medium transition text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
  const btnOn = "bg-green-600/10 text-green-700 dark:text-green-400";

  return (
    <div ref={wrapRef} className="flex flex-col w-full h-full min-h-[320px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
      {/* top toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 dark:border-gray-800 shrink-0 flex-wrap">
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((i) => (
            <button key={i.id} onClick={() => update({ interval: i.id })} className={`${btn} ${prefs.interval === i.id ? btnOn : ""}`}>
              {t(i.key)}
            </button>
          ))}
        </div>
        <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <div className="relative">
          <button onClick={() => { setTypeOpen((v) => !v); setSettingsOpen(false); }} className={btn}>
            {t(CHART_TYPES.find((c) => c.id === prefs.chartType)?.key ?? "chart.type.candles")} ▾
          </button>
          {typeOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setTypeOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-40 w-44 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg py-1">
                {CHART_TYPES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { update({ chartType: c.id }); setTypeOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${prefs.chartType === c.id ? "text-green-600 font-medium" : "dark:text-gray-200"}`}
                  >
                    {t(c.key)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={() => engineRef.current?.setAutoScale(true)} title={t("chart.auto")} className={`${btn} ${autoScale ? btnOn : ""}`}>
            {t("chart.auto")}
          </button>
          <button onClick={() => update({ logScale: !prefs.logScale })} title={t("chart.log")} className={`${btn} ${prefs.logScale ? btnOn : ""}`}>
            {t("chart.logShort")}
          </button>
          <button onClick={() => engineRef.current?.resetView()} title={t("chart.reset")} className={btn}>⟲</button>
          <div className="relative">
            <button onClick={() => { setSettingsOpen((v) => !v); setTypeOpen(false); }} title={t("chart.settings")} className={btn}>⚙</button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSettingsOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-2 text-sm dark:text-gray-200">
                  {([
                    ["showVolume", "chart.volume"],
                    ["showGrid", "chart.grid"],
                    ["showWatermark", "chart.watermark"],
                    ["logScale", "chart.log"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-green-600" checked={prefs[k]} onChange={(e) => update({ [k]: e.target.checked } as Partial<Prefs>)} />
                      {t(label)}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={screenshot} title={t("chart.screenshot")} className={btn}>📷</button>
          <button onClick={toggleFullscreen} title={t("chart.fullscreen")} className={`${btn} ${fullscreen ? btnOn : ""}`}>⛶</button>
        </div>
      </div>

      {/* canvas host */}
      <div className="relative flex-1 min-h-0">
        <div ref={hostRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="inline-block w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin" />
          </div>
        )}
        {!loading && empty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">{t("chart.noData")}</div>
        )}
      </div>
    </div>
  );
}
