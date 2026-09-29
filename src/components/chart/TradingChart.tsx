"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChartEngine } from "@/lib/chart/engine";
import { DARK_THEME, LIGHT_THEME, type Candle, type ChartType } from "@/lib/chart/types";
import { intervalToMs } from "@/lib/chart/format";
import { useT } from "@/lib/i18n/client";
import { IndicatorsController } from "@/lib/chart/indicators/controller";
import { DrawingsController } from "@/lib/chart/drawings/controller";
import IndicatorsDialog from "@/components/chart/IndicatorsDialog";
import DrawingToolbar from "@/components/chart/DrawingToolbar";
import DrawingStyleBar from "@/components/chart/DrawingStyleBar";
import TopToolbar, { INTERVALS, type ToggleKey } from "@/components/chart/TopToolbar";
import BottomBar, { type RangeId } from "@/components/chart/BottomBar";
import RightPanel, { type PanelTab } from "@/components/chart/RightPanel";
import SymbolSearch from "@/components/chart/SymbolSearch";
import ReplayControls, { useReplay } from "@/components/chart/ReplayControls";
import { adHocInstrument, findInstrument, type TerminalInstrument } from "@/lib/terminal-data";

export type { ChartSource } from "@/lib/terminal-data";
import type { ChartSource } from "@/lib/terminal-data";

interface Props {
  ticker: string;
  source: ChartSource;
  name?: string;
  onSelectSymbol?: (inst: TerminalInstrument) => void;
}

interface Prefs {
  interval: string;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  showWatermark: boolean;
  logScale: boolean;
  panelOpen: boolean;
  panelTab: PanelTab;
}

const DEFAULT_PREFS: Prefs = {
  interval: "D",
  chartType: "candles",
  showVolume: true,
  showGrid: true,
  showWatermark: true,
  logScale: false,
  panelOpen: true,
  panelTab: "watchlist",
};

const PREFS_KEY = "fomo-chart-prefs-v1";
const INDICATORS_KEY = "fomo-chart-indicators";
const drawingsKey = (source: string, ticker: string) => `fomo-chart-drawings:${source}:${ticker}`;
const LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", cn: "zh-CN" };
const MSK_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
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

const RANGE_DAYS: Partial<Record<RangeId, number>> = { "1d": 1, "5d": 5, "1m": 30, "3m": 91, "6m": 182, "1y": 365, "5y": 1826 };

export default function TradingChart({ ticker, source, name, onSelectSymbol }: Props) {
  const { t, locale } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const shiftRef = useRef({ tzMs: 0, displayShiftMs: 0 });
  const genRef = useRef(0);
  const loadingHistory = useRef(false);

  const [drawings] = useState(() => new DrawingsController());
  const [indicators] = useState(() => new IndicatorsController());

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);
  const [indCount, setIndCount] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [hasSelection, setHasSelection] = useState(false);
  const [rangeBusy, setRangeBusy] = useState(false);

  const instrument: TerminalInstrument = findInstrument(source, ticker) ?? adHocInstrument(source, ticker);

  /* saved preferences */
  useEffect(() => {
    setPrefs(loadPrefs());
    setPrefsLoaded(true);
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      lsSet(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /* indicators must be recomputed after every change of the candles */
  const refreshInd = useCallback(() => {
    try {
      indicators.refresh();
    } catch {}
  }, [indicators]);

  const getEngine = useCallback(() => engineRef.current, []);
  const replay = useReplay(getEngine, refreshInd);
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const replayActive = replay.mode !== "off";

  /* engine lifetime */
  useEffect(() => {
    if (!hostRef.current) return;
    const dark = document.documentElement.classList.contains("dark");
    const engine = new ChartEngine(hostRef.current, { theme: dark ? DARK_THEME : LIGHT_THEME });
    engine.onAutoScaleChange = setAutoScale;
    engineRef.current = engine;
    drawings.attach(engine);
    indicators.attach(engine);

    const savedInd = lsGet(INDICATORS_KEY);
    if (savedInd) indicators.restore(savedInd);
    setIndCount(indicators.list().length);
    let indTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubInd = indicators.subscribe(() => {
      setIndCount(indicators.list().length);
      clearTimeout(indTimer);
      indTimer = setTimeout(() => lsSet(INDICATORS_KEY, indicators.serialize()), 200);
    });
    const unsubDraw = drawings.subscribe(() => setHasSelection(!!drawings.getSelection()));

    const mo = new MutationObserver(() => {
      engine.setOptions({ theme: document.documentElement.classList.contains("dark") ? DARK_THEME : LIGHT_THEME });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mo.disconnect();
      clearTimeout(indTimer);
      unsubInd();
      unsubDraw();
      drawings.detach();
      indicators.detach();
      engine.destroy();
      engineRef.current = null;
    };
  }, [drawings, indicators]);

  /* drawings are saved per symbol */
  useEffect(() => {
    const key = drawingsKey(source, ticker);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let armed = false;
    const flush = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      lsSet(key, drawings.serialize());
    };
    drawings.restore(lsGet(key));
    const unsub = drawings.subscribe(() => {
      if (!armed) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        lsSet(key, drawings.serialize());
      }, 250);
    });
    armed = true;
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
      unsub();
    };
  }, [source, ticker, drawings]);

  /* options that do not need a reload */
  useEffect(() => {
    engineRef.current?.setOptions({
      chartType: prefs.chartType,
      showVolume: prefs.showVolume,
      showGrid: prefs.showGrid,
      showWatermark: prefs.showWatermark,
      logScale: prefs.logScale,
    });
  }, [prefs.chartType, prefs.showVolume, prefs.showGrid, prefs.showWatermark, prefs.logScale]);

  /* data for the current symbol and timeframe */
  useEffect(() => {
    if (!prefsLoaded) return;
    const engine = engineRef.current;
    if (!engine || source === "none") return;
    let cancelled = false;
    const gen = ++genRef.current;
    replayRef.current.exit(false);
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
      refreshInd();
      setEmpty(candles.length === 0);
      setLoading(false);
    })();

    engine.onNeedHistory = async () => {
      if (loadingHistory.current || cancelled || replayRef.current.mode !== "off") return;
      const first = engine.getCandles()[0];
      if (!first) return;
      loadingHistory.current = true;
      try {
        const { candles } = await fetchCandles(source, ticker, iv, 500, first.t - 1);
        if (!cancelled && gen === genRef.current) {
          engine.prependCandles(candles);
          refreshInd();
        }
      } finally {
        loadingHistory.current = false;
      }
    };

    return () => {
      cancelled = true;
      engine.onNeedHistory = null;
    };
  }, [prefsLoaded, source, ticker, name, prefs.interval, locale, t, refreshInd]);

  /* live price: quotes for the forming bar, real bars from the API now and then */
  useEffect(() => {
    if (!prefsLoaded || source === "none" || replayActive) return;
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
        refreshInd();
      } catch {}
    };

    const refreshBars = async () => {
      const engine = engineRef.current;
      if (stopped || !engine || document.hidden) return;
      try {
        const { candles } = await fetchCandles(source, ticker, iv, 3);
        if (stopped) return;
        for (const c of candles) engine.upsertCandle(c);
        refreshInd();
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
  }, [prefsLoaded, source, ticker, prefs.interval, replayActive, refreshInd]);

  /* fullscreen */
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

  /* visible range buttons: load enough history if needed, then zoom to the last N bars */
  const applyRange = async (r: RangeId) => {
    const engine = engineRef.current;
    if (!engine || rangeBusy || replay.mode !== "off") return;
    let candles = engine.getCandles();
    if (candles.length === 0) return;
    const gen = genRef.current;
    const iv = prefs.interval;
    const lastT = candles[candles.length - 1].t;
    let target: number;
    if (r === "all") target = -Infinity;
    else if (r === "ytd") target = Date.UTC(new Date(lastT).getUTCFullYear(), 0, 1);
    else target = lastT - (RANGE_DAYS[r] ?? 30) * DAY_MS;

    setRangeBusy(true);
    try {
      const maxRounds = r === "all" ? 40 : 25;
      for (let round = 0; round < maxRounds; round++) {
        if (gen !== genRef.current) return;
        const first = engine.getCandles()[0];
        if (!first || first.t <= target || !engine.hasMoreHistory) break;
        let waited = 0;
        while (loadingHistory.current && waited < 3000) {
          await new Promise((res) => setTimeout(res, 100));
          waited += 100;
        }
        if (gen !== genRef.current) return;
        loadingHistory.current = true;
        try {
          const { candles: older } = await fetchCandles(source, ticker, iv, 500, first.t - 1);
          if (gen !== genRef.current) return;
          engine.prependCandles(older);
          refreshInd();
          if (older.length === 0) break;
        } finally {
          loadingHistory.current = false;
        }
      }
      candles = engine.getCandles();
      const n = candles.length;
      let bars = n;
      if (r !== "all") {
        let idx = n - 1;
        while (idx > 0 && candles[idx - 1].t >= target) idx--;
        bars = n - idx;
      }
      engine.showLastBars(Math.max(10, bars));
    } finally {
      setRangeBusy(false);
    }
  };

  const handleSelect = (inst: TerminalInstrument) => {
    onSelectSymbol?.(inst);
    if (!isDesktop) setMobilePanel(false);
  };

  const onTab = (tab: PanelTab) => {
    if (!isDesktop) {
      update({ panelTab: tab });
      setMobilePanel(true);
    } else if (prefs.panelOpen && prefs.panelTab === tab) update({ panelOpen: false });
    else update({ panelOpen: true, panelTab: tab });
  };

  const panelVisible = isDesktop ? prefs.panelOpen : mobilePanel;

  return (
    <div ref={wrapRef} className="flex flex-col w-full h-full min-h-0 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 select-none">
      <TopToolbar
        instrument={instrument}
        interval={prefs.interval}
        onInterval={(id) => update({ interval: id })}
        chartType={prefs.chartType}
        onChartType={(c) => update({ chartType: c })}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenIndicators={() => setIndOpen(true)}
        indicatorCount={indCount}
        replay={replay}
        drawings={drawings}
        toggles={{ showVolume: prefs.showVolume, showGrid: prefs.showGrid, showWatermark: prefs.showWatermark }}
        onToggle={(k: ToggleKey, v: boolean) => update({ [k]: v } as Partial<Prefs>)}
        onResetView={() => engineRef.current?.resetView()}
        onScreenshot={screenshot}
        onFullscreen={toggleFullscreen}
        fullscreen={fullscreen}
        onToggleTools={() => setToolsOpen((v) => !v)}
        toolsOpen={toolsOpen}
        onTogglePanel={() => setMobilePanel((v) => !v)}
        panelOpen={mobilePanel}
      />

      <div className="relative flex flex-1 min-h-0">
        {/* drawing tools */}
        <div
          className={`${toolsOpen ? "flex" : "hidden"} md:flex absolute md:static left-0 top-0 bottom-0 z-30 md:z-auto shrink-0 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        >
          <DrawingToolbar controller={drawings} />
        </div>

        {/* chart + bottom bar */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
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
            {hasSelection && <DrawingStyleBar controller={drawings} />}
            <ReplayControls api={replay} hostRef={hostRef} getEngine={getEngine} />
          </div>
          <BottomBar
            source={source}
            autoScale={autoScale}
            logScale={prefs.logScale}
            onAuto={() => engineRef.current?.setAutoScale(!autoScale)}
            onLog={() => update({ logScale: !prefs.logScale })}
            onRange={applyRange}
            rangeBusy={rangeBusy || replayActive}
          />
        </div>

        <RightPanel
          open={prefs.panelOpen}
          mobileOpen={mobilePanel}
          visible={panelVisible}
          tab={prefs.panelTab}
          onTab={onTab}
          onCollapse={() => update({ panelOpen: false })}
          onCloseMobile={() => setMobilePanel(false)}
          selected={instrument}
          onSelect={handleSelect}
        />
      </div>

      <SymbolSearch open={searchOpen} onClose={() => setSearchOpen(false)} onPick={handleSelect} current={{ source, ticker }} />
      <IndicatorsDialog controller={indicators} open={indOpen} onClose={() => setIndOpen(false)} />
    </div>
  );
}
