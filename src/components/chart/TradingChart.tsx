"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { ChartEngine } from "@/lib/chart/engine";
import { DARK_THEME, LIGHT_THEME, type Candle, type ChartType } from "@/lib/chart/types";
import { formatPrice, intervalToMs } from "@/lib/chart/format";
import { useT } from "@/lib/i18n/client";
import { IndicatorsController } from "@/lib/chart/indicators/controller";
import { DrawingsController } from "@/lib/chart/drawings/controller";
import { AlertsLayer } from "@/lib/chart/alerts-layer";
import { EventsLayer } from "@/lib/chart/events-layer";
import { useCalPrefs } from "@/lib/calendar/prefs";
import CalendarRemindersHost from "@/components/chart/calendar/CalendarRemindersHost";
import { OrderFlowClient } from "@/lib/chart/orderflow/client";
import { AlgoClient } from "@/lib/chart/algopack/client";
import type { AlgoNeed } from "@/lib/chart/algopack/store";
import { delayedNow } from "@/lib/chart/algopack/delayed";
import { fxMarketOpen } from "@/lib/forex-meta";
import { getIndicatorDef } from "@/lib/chart/indicators/registry";
import { AnchoredVwapLayer } from "@/lib/chart/orderflow/avwap-layer";
import { VpLayer } from "@/lib/chart/orderflow/vpro-layer";
import { FLOW_DRAWING_TOOLS, FLOW_INDICATOR_IDS } from "@/lib/chart/orderflow/types";
import IndicatorsDialog from "@/components/chart/IndicatorsDialog";
import IndicatorLegend from "@/components/chart/IndicatorLegend";
import AlertsDialog, { type AlertDraft } from "@/components/chart/AlertsDialog";
import { useAlerts } from "@/components/chart/useAlerts";
import DrawingToolbar from "@/components/chart/DrawingToolbar";
import DrawingStyleBar from "@/components/chart/DrawingStyleBar";
import DrawingSettingsDialog from "@/components/chart/DrawingSettingsDialog";
import TopToolbar, { CHART_TYPES, type ToggleKey } from "@/components/chart/TopToolbar";
import BottomBar, { type RangeId } from "@/components/chart/BottomBar";
import RightPanel, { type PanelTab } from "@/components/chart/RightPanel";
import type { AppChartHandle, AppChartState } from "@/components/chart/app-bridge";
import InstrumentSearchDialog from "@/components/chart/InstrumentSearchDialog";
import ReplayControls, { useReplay } from "@/components/chart/ReplayControls";
import ChartContextMenu, { type ChartMenuState } from "@/components/chart/ChartContextMenu";
import ChartSettingsDialog, { type SettingsTab } from "@/components/chart/ChartSettingsDialog";
import PriceScaleMenu from "@/components/chart/PriceScaleMenu";
import ShortcutsDialog from "@/components/chart/ShortcutsDialog";
import CompareLegend, { type CompareItem } from "@/components/chart/CompareLegend";
import { useChartSettings } from "@/components/chart/useChartSettings";
import { DESIGN_PATHS, DrawIcon, panelTabIcon, ui } from "@/components/chart/icons";
import { CS_ICONS } from "@/components/chart/icons-cs";
import { aggregateCandles, formatInterval, intervalPlan, isValidInterval } from "@/lib/chart/intervals";
import { openChannel, type Channel } from "@/lib/chart/account-sync";
import { KIND_DRAWINGS, KIND_INDICATORS, KIND_PREFS, drawingsKey as drawingsAccountKey, fitDrawings, isEmptyDrawings, isEmptyIndicators, paneKey } from "@/lib/chart/sync-logic";
import { cleanCandles } from "@/lib/chart/candles";
import { composeTheme, normalizeSettings, resolveZone, settingsToEngine } from "@/lib/chart/settings";
import type { ChartLayoutData, ChartTemplateData } from "@/lib/chart/templates";
import { isTransformedType, type ScaleMode } from "@/lib/chart/types";
import type { ChartSyncHub } from "@/lib/chart/sync";
import { adHocInstrument, findInstrument, type TerminalInstrument } from "@/lib/terminal-data";
import "@/components/chart/terminal-v3.css";

export type { ChartSource } from "@/lib/terminal-data";
import type { ChartSource } from "@/lib/terminal-data";

interface Props {
  ticker: string;
  source: ChartSource;
  name?: string;
  onSelectSymbol?: (inst: TerminalInstrument) => void;
  /* multi-chart layouts: a pane of a grid has no side panel and keeps its own preferences */
  embedded?: boolean;
  /** Hide the side panel only (the main pane of a multi-chart grid). */
  compact?: boolean;
  storageId?: string;
  /** false while another pane of the grid is the active one: hotkeys ignore this chart. */
  active?: boolean;
  /** Extra toolbar content (the layout picker). */
  toolbarExtra?: ReactNode;
  hub?: ChartSyncHub;
  /** Interval forced by the layout while intervals are synced. */
  syncInterval?: string | null;
  onIntervalChange?: (id: string) => void;
  /** App-only terminal page: the page draws the top bar, the timeframe chips, the range row and the tool row itself, so the chart hides its own toolbar / bottom bar / phone nav. */
  appPage?: boolean;
  /** App-only terminal page: filled with the chart's actions (open indicators / alerts / settings ...). */
  appHandle?: MutableRefObject<AppChartHandle | null>;
  /** App-only terminal page: told about the interval, the data delay and the badge counts. */
  onAppState?: (s: AppChartState) => void;
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

function loadPrefs(key: string = PREFS_KEY, fallbackKey?: string): Prefs {
  try {
    const raw = localStorage.getItem(key) ?? (fallbackKey ? localStorage.getItem(fallbackKey) : null);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

const PANEL_TABS: PanelTab[] = ["watchlist", "info", "ideas", "news", "calendar", "objects", "alerts", "orderbook", "algo"];

/** Preferences from the account copy: every field checked, anything unknown falls back to the default (an old / foreign copy never breaks the chart). */
function sanitizePrefs(raw: unknown): Prefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const D = DEFAULT_PREFS;
  return {
    interval: typeof o.interval === "string" && isValidInterval(o.interval) ? o.interval : D.interval,
    chartType: CHART_TYPES.some((c) => c.id === o.chartType) ? (o.chartType as ChartType) : D.chartType,
    showVolume: bool(o.showVolume, D.showVolume),
    showGrid: bool(o.showGrid, D.showGrid),
    showWatermark: bool(o.showWatermark, D.showWatermark),
    logScale: bool(o.logScale, D.logScale),
    panelOpen: bool(o.panelOpen, D.panelOpen),
    panelTab: PANEL_TABS.includes(o.panelTab as PanelTab) ? (o.panelTab as PanelTab) : D.panelTab,
  };
}

/** Drawings of a symbol that are saved without a chart showing it (a layout applied to another symbol). */
function saveDrawingsFor(source: string, ticker: string, json: string) {
  const key = drawingsKey(source, ticker);
  const ch = openChannel({ kind: KIND_DRAWINGS, key: drawingsAccountKey(source, ticker), lsKey: key, current: () => "", apply: () => {}, isEmpty: isEmptyDrawings, emptyJson: "", fit: fitDrawings });
  ch.changed(json);
  ch.dispose();
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

/** Why the klines API could not serve a symbol (FMP): shown instead of «Нет данных». */
type ProviderError = "limit" | "plan" | "network";

/** Spot FX facts of a /api/klines answer: who served the bars, what the volume is, a proxy instrument (metals). */
interface FxInfo {
  provider: string;
  volumeKind: string;
  proxy?: string;
}

async function fetchCandles(source: string, ticker: string, interval: string, limit: number, to?: number) {
  let url = `/api/klines?source=${source}&ticker=${encodeURIComponent(ticker)}&interval=${interval}&limit=${limit}`;
  if (to) url += `&to=${to}`;
  const res = await fetch(url);
  if (!res.ok) return { candles: [] as Candle[], tzMin: 0, delayed: undefined as boolean | undefined, fx: undefined as FxInfo | undefined, err: undefined as ProviderError | undefined };
  const j = await res.json();
  const rows: any[] = Array.isArray(j) ? j : j.candles ?? [];
  // isFinite(null) is true and null reads as 0: a bar with a null open used to get through and was drawn as a solid body
  // from its close down to the bottom of the pane (the scale only follows high / low). Repair or drop such bars here.
  const candles = cleanCandles(
    rows
      .filter((d) => d && typeof d === "object")
      .map((d) => ({ t: d.timestamp, o: d.open, h: d.high, l: d.low, c: d.close, v: d.volume }) as Candle),
  );
  // `delayed`: the newest bars are the 15-minute delayed ISS ones (no real-time tail was added); absent for scroll-back pages
  const fx: FxInfo | undefined = typeof j.provider === "string" ? { provider: j.provider, volumeKind: String(j.volumeKind ?? "none"), proxy: typeof j.proxy === "string" ? j.proxy : undefined } : undefined;
  // FMP says why a chart is empty: the request limit is used up, the instrument is not in the plan, the provider does not answer
  const err: ProviderError | undefined = j.error === "limit" || j.error === "plan" || j.error === "network" ? j.error : undefined;
  return { candles, tzMin: typeof j.serverTzOffsetMin === "number" ? j.serverTzOffsetMin : 0, delayed: typeof j.delayed === "boolean" ? j.delayed : undefined, fx, err };
}

/** Bars of any interval: finer candles are fetched and merged on the client when the API has no such interval. */
async function fetchBars(source: string, ticker: string, interval: string, limit: number, to?: number) {
  const plan = intervalPlan(interval, source);
  if (plan.ratio === 1) return fetchCandles(source, ticker, plan.base, limit, to);
  const r = await fetchCandles(source, ticker, plan.base, Math.min(limit * plan.ratio, 3000), to);
  return { candles: aggregateCandles(r.candles, plan.ms), tzMin: r.tzMin, delayed: r.delayed, fx: r.fx, err: r.err };
}

const COMPARE_COLORS = ["#f5a623", "#e91e63", "#9c27b0", "#00bcd4", "#8bc34a", "#ff5722"];

interface CompareState {
  id: string;
  source: string;
  ticker: string;
  label: string;
  color: string;
  mode: "percent" | "own";
  visible: boolean;
  loading?: boolean;
  failed?: boolean;
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
  if (interval === "Y") {
    const d = new Date(nowWall);
    d.setUTCMonth(0, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  const ms = intervalToMs(interval);
  return Math.floor(nowWall / ms) * ms;
}

const RANGE_DAYS: Partial<Record<RangeId, number>> = { "1d": 1, "5d": 5, "1m": 30, "3m": 91, "6m": 182, "1y": 365, "5y": 1826 };

export default function TradingChart({ ticker, source, name, onSelectSymbol, embedded, compact, storageId, active, toolbarExtra, hub, syncInterval, onIntervalChange, appPage, appHandle, onAppState }: Props) {
  const { t, locale } = useT();
  const prefsKey = storageId ? `${PREFS_KEY}:${storageId}` : PREFS_KEY;
  const indKey = storageId ? `${INDICATORS_KEY}:${storageId}` : INDICATORS_KEY;
  const activeRef = useRef(active !== false);
  activeRef.current = active !== false;
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const shiftRef = useRef({ tzMs: 0, displayShiftMs: 0, offsetMs: 0 });
  const genRef = useRef(0);
  /** "source|ticker|interval" of the bars that are on the chart now ("" until the first load): the live updates wait for it. */
  const dataKeyRef = useRef("");
  const loadingHistory = useRef(false);

  const [drawings] = useState(() => new DrawingsController());
  const [indicators] = useState(() => new IndicatorsController());
  const [alertsLayer] = useState(() => new AlertsLayer());
  const [eventsLayer] = useState(() => new EventsLayer());
  const [calPrefs, updateCalPrefs] = useCalPrefs();
  const [avwapLayer] = useState(() => new AnchoredVwapLayer(indicators));
  const [vpLayer] = useState(() => new VpLayer(indicators));
  const alertsApi = useAlerts();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  /** why an FMP chart is empty (limit / plan / network), null: no reason given */
  const [emptyWhy, setEmptyWhy] = useState<ProviderError | null>(null);
  /** bumped to reload the bars of an FMP chart that was empty because of a limit / outage (the server keeps its own cooldown: a retry is free) */
  const [reloadTick, setReloadTick] = useState(0);
  /** MOEX bars up to the 15-minute delay of the public ISS (no online feed for this requester) */
  const [candlesDelayed, setCandlesDelayed] = useState(false);
  /** spot FX: provider / volume kind of the bars on the chart (drives the "no exchange volume" badge) */
  const [fxInfo, setFxInfo] = useState<FxInfo | null>(null);
  const [autoScale, setAutoScale] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertDraft, setAlertDraft] = useState<AlertDraft | null>(null);
  const [indCount, setIndCount] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [hasSelection, setHasSelection] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [menu, setMenu] = useState<ChartMenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  /* chart settings (gear dialog), price scale menu, compare, shortcuts */
  const csApi = useChartSettings();
  const cs = csApi.settings;
  const [siteDark, setSiteDark] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [csOpen, setCsOpen] = useState(false);
  const [csTab, setCsTab] = useState<SettingsTab>("symbol");
  const [scaleMenu, setScaleMenu] = useState<{ x: number; y: number } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [gotoSignal, setGotoSignal] = useState(0);
  const [offsetMs, setOffsetMs] = useState(0);
  const [transformBox, setTransformBox] = useState(0);
  const [compares, setCompares] = useState<CompareState[]>([]);
  const [comparePick, setComparePick] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const compareData = useRef(new Map<string, Candle[]>());
  const compareShift = useRef(new Map<string, number>());
  const compareList = useRef<CompareState[]>([]);
  const compareExtending = useRef(new Set<string>());
  const extendComparesRef = useRef<() => void>(() => {});
  const csRef = useRef(csApi);
  csRef.current = csApi;
  const logMigrated = useRef(false);

  const instrument: TerminalInstrument = findInstrument(source, ticker) ?? adHocInstrument(source, ticker);

  /* saved preferences */
  useEffect(() => {
    setPrefs(loadPrefs(prefsKey, storageId ? PREFS_KEY : undefined));
    setPrefsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = useCallback(
    (patch: Partial<Prefs>) => {
      setPrefs((p) => {
        const next = { ...p, ...patch };
        lsSet(prefsKey, JSON.stringify(next));
        return next;
      });
    },
    [prefsKey]
  );

  /* the preferences follow the account: local copy first, then the newer of the two wins (see lib/chart/account-sync.ts) */
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const prefsChan = useRef<Channel | null>(null);
  useEffect(() => {
    if (!prefsLoaded) return;
    const ch = openChannel({
      kind: KIND_PREFS,
      key: paneKey(storageId),
      lsKey: prefsKey,
      current: () => JSON.stringify(prefsRef.current),
      apply: (json) => {
        try {
          const next = sanitizePrefs(JSON.parse(json));
          prefsRef.current = next;
          setPrefs(next);
        } catch {}
      },
      isEmpty: () => false,
      emptyJson: JSON.stringify(DEFAULT_PREFS),
    });
    prefsChan.current = ch;
    void ch.start();
    return () => {
      prefsChan.current = null;
      ch.dispose();
    };
  }, [prefsLoaded, prefsKey, storageId]);
  useEffect(() => {
    if (prefsLoaded) prefsChan.current?.changed(JSON.stringify(prefs));
  }, [prefs, prefsLoaded]);

  /* the layout forces one interval on all charts while intervals are synced */
  useEffect(() => {
    if (prefsLoaded && syncInterval && syncInterval !== prefs.interval) update({ interval: syncInterval });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncInterval, prefsLoaded]);

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
    alertsLayer.attach(engine);
    eventsLayer.attach(engine);
    indicators.attach(engine);
    avwapLayer.attach(engine);
    vpLayer.attach(engine);

    const savedInd = lsGet(indKey);
    if (savedInd) indicators.restore(savedInd);
    setIndCount(indicators.list().length);
    // the indicator list follows the account (an indicator of a script this device does not have yet stays in the list and just shows "script not found")
    const indChan = openChannel({
      kind: KIND_INDICATORS,
      key: paneKey(storageId),
      lsKey: indKey,
      current: () => indicators.serialize(),
      apply: (json) => indicators.restore(json),
      isEmpty: isEmptyIndicators,
      emptyJson: "[]",
    });
    void indChan.start();
    let indTimer: ReturnType<typeof setTimeout> | undefined;
    const flushInd = (closing: boolean) => {
      if (indTimer === undefined) return;
      clearTimeout(indTimer);
      indTimer = undefined;
      indChan.changed(indicators.serialize(), closing);
    };
    const onHide = () => flushInd(true);
    window.addEventListener("pagehide", onHide);
    const unsubInd = indicators.subscribe(() => {
      setIndCount(indicators.list().length);
      clearTimeout(indTimer);
      indTimer = setTimeout(() => {
        indTimer = undefined;
        indChan.changed(indicators.serialize());
      }, 200);
    });
    const unsubDraw = drawings.subscribe(() => setHasSelection(!!drawings.getSelection()));

    setSiteDark(dark);
    engine.onBaselineChange = (pct) => csRef.current.update((x) => ({ ...x, baselinePercent: Math.round(pct) }));
    engine.onPriceAxisMenu = ({ clientX, clientY }) => setScaleMenu({ x: clientX, y: clientY });
    setEngineReady(true);

    const mo = new MutationObserver(() => {
      setSiteDark(document.documentElement.classList.contains("dark"));
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mo.disconnect();
      window.removeEventListener("pagehide", onHide);
      flushInd(false);
      indChan.dispose();
      unsubInd();
      unsubDraw();
      drawings.detach();
      alertsLayer.detach();
      eventsLayer.detach();
      avwapLayer.detach();
      vpLayer.detach();
      indicators.detach();
      engine.destroy();
      engineRef.current = null;
      setEngineReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, indicators, alertsLayer, eventsLayer, avwapLayer, vpLayer, indKey]);

  useEffect(() => {
    avwapLayer.hint = t("of.avwap.pick");
    vpLayer.hint = t("vp.pick");
  }, [avwapLayer, vpLayer, t]);

  /* drawings are saved per symbol */
  useEffect(() => {
    const key = drawingsKey(source, ticker);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let armed = false;
    // the drawings of this symbol follow the account (the newest 200 symbols are kept there)
    const chan = openChannel({
      kind: KIND_DRAWINGS,
      key: drawingsAccountKey(source, ticker),
      lsKey: key,
      current: () => drawings.serialize(),
      apply: (json) => drawings.restore(json),
      isEmpty: isEmptyDrawings,
      emptyJson: "",
      fit: fitDrawings,
    });
    const flush = (closing: boolean) => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      chan.changed(drawings.serialize(), closing);
    };
    const onHide = () => flush(true);
    drawings.restore(lsGet(key));
    void chan.start();
    const unsub = drawings.subscribe(() => {
      if (!armed) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        chan.changed(drawings.serialize());
      }, 250);
    });
    armed = true;
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush(false);
      chan.dispose();
      unsub();
    };
  }, [source, ticker, drawings]);

  /* options that do not need a reload */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOptions({
      chartType: prefs.chartType,
      showVolume: prefs.showVolume,
      showGrid: prefs.showGrid,
      showWatermark: prefs.showWatermark,
    });
    setTransformBox(engine.getTransformBox());
  }, [engineReady, prefs.chartType, prefs.showVolume, prefs.showGrid, prefs.showWatermark]);

  /* chart settings: theme, candles, scales, labels ... */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const opts = settingsToEngine(cs, siteDark);
    // app terminal page: the design's chart sits on the page background; a canvas colour the user chose themselves is kept
    if (appPage && opts.theme && cs.preset === "classic" && cs.bgType === "solid" && !cs.colors.bg) opts.theme = { ...opts.theme, bg: siteDark ? "#0a0a0a" : "#f4f4f5" };
    engine.setOptions(opts);
    setTransformBox(engine.getTransformBox());
  }, [engineReady, cs, siteDark, appPage]);

  /* time zone of the axis and crosshair */
  useEffect(() => {
    engineRef.current?.setOptions({ timeZone: resolveZone(cs.tz, source), clockOffsetMs: offsetMs });
  }, [engineReady, cs.tz, source, offsetMs]);

  /* the old "log" preference lives in the scale mode now */
  useEffect(() => {
    if (!prefsLoaded || !csApi.ready || logMigrated.current) return;
    logMigrated.current = true;
    if (prefs.logScale) {
      if (cs.scale.mode === "regular") csApi.update((x) => ({ ...x, scale: { ...x.scale, mode: "log" } }));
      update({ logScale: false });
    }
  }, [prefsLoaded, csApi, cs.scale.mode, prefs.logScale, update]);

  /* an FMP chart emptied by the request limit or an outage tries again by itself */
  useEffect(() => {
    if (emptyWhy !== "limit" && emptyWhy !== "network") return;
    const id = setTimeout(() => setReloadTick((x) => x + 1), 45_000);
    return () => clearTimeout(id);
  }, [emptyWhy, reloadTick]);

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
    setEmptyWhy(null);
    const iv = prefs.interval;
    const label = formatInterval(iv, t);

    (async () => {
      const { candles, tzMin, delayed, fx, err } = await fetchBars(source, ticker, iv, 600);
      if (cancelled) return;
      const tzMs = source === "moex" ? tzMin * 60_000 : 0;
      // labels show the exchange's wall clock: MOEX as parsed on the server, others in the viewer's zone
      const displayShiftMs = source === "moex" ? tzMs : -new Date().getTimezoneOffset() * 60_000;
      // chart time = real UTC ms + offsetMs (MOEX candles carry Moscow wall time minus the server's zone)
      const offsetMs = (source === "moex" ? MSK_MS : 0) - tzMs;
      shiftRef.current = { tzMs, displayShiftMs, offsetMs };
      setCandlesDelayed(delayedNow(source, delayed, candles[candles.length - 1]?.t, offsetMs, iv));
      setFxInfo(source === "forex" ? fx ?? null : null);
      // sessions / days of the order flow indicators follow the exchange clock
      engine.flow.wallShiftMs = source === "moex" ? tzMs : 0;
      engine.flow.sourceName = source;
      engine.algo.setTz(tzMs);
      alertsLayer.setTimeOffset(offsetMs);
      setOffsetMs(offsetMs);
      engine.setOptions({
        symbolLabel: name || ticker,
        intervalLabel: label,
        intervalMs: intervalToMs(iv),
        timeShiftMs: displayShiftMs,
        timeZone: resolveZone(csRef.current.settings.tz, source),
        clockOffsetMs: offsetMs,
        locale: LOCALES[locale] ?? "ru-RU",
      });
      engine.setData(candles);
      dataKeyRef.current = `${source}|${ticker}|${iv}`;
      refreshInd();
      setEmpty(candles.length === 0);
      setEmptyWhy(candles.length === 0 && source === "fmp" ? err ?? null : null);
      setLoading(false);
      setTransformBox(engine.getTransformBox());
      setDataVersion((v) => v + 1);
    })();

    engine.onNeedHistory = async () => {
      if (loadingHistory.current || cancelled || replayRef.current.mode !== "off") return;
      const first = engine.getCandles()[0];
      if (!first) return;
      loadingHistory.current = true;
      try {
        const { candles } = await fetchBars(source, ticker, iv, 500, first.t - 1);
        if (!cancelled && gen === genRef.current) {
          engine.prependCandles(candles);
          refreshInd();
          extendComparesRef.current();
        }
      } finally {
        loadingHistory.current = false;
      }
    };

    return () => {
      cancelled = true;
      engine.onNeedHistory = null;
    };
  }, [prefsLoaded, source, ticker, name, prefs.interval, locale, t, refreshInd, alertsLayer, reloadTick]);

  const badQuoteRef = useRef(0);
  /* live price: quotes for the forming bar, real bars from the API now and then */
  useEffect(() => {
    if (!prefsLoaded || source === "none" || replayActive) return;
    const iv = prefs.interval;
    const intraday = iv !== "D" && iv !== "W" && iv !== "M" && iv !== "Y";
    const dataKey = `${source}|${ticker}|${iv}`;
    let stopped = false;
    let quoteBusy = false;
    let barsBusy = false;

    const pollQuote = async () => {
      const engine = engineRef.current;
      // the chart still shows the previous symbol / interval until its bars have been loaded: its bars must not get this one's price
      if (stopped || quoteBusy || !engine || document.hidden || dataKeyRef.current !== dataKey) return;
      // spot FX is closed on the weekend: a quote then would only draw flat bars; during the Sunday evening open the daily / weekly
      // bar is the Monday one (the data layer merges the short Sunday bar into Monday)
      if (source === "forex" && !fxMarketOpen(new Date())) return;
      quoteBusy = true;
      try {
        const r = await fetch(`/api/quote?source=${source}&ticker=${encodeURIComponent(ticker)}&_t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const q = await r.json();
        const price: unknown = q?.price;
        if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || stopped || dataKeyRef.current !== dataKey) return;
        q.price = price;
        // the newest bar as it is NOW: the bar refresh or the previous quote may have replaced it while this request was on its way
        const candles = engine.getCandles();
        const last = candles[candles.length - 1];
        if (!last) return;
        // A single bad print (a quote far from the previous close) must not stretch the forming bar with a huge wick:
        // a jump of more than 3% is only accepted when the next quote confirms it.
        const jump = Math.abs(q.price - last.c) / (last.c || q.price);
        if (jump > 0.03) {
          if (!(badQuoteRef.current && Math.abs(q.price - badQuoteRef.current) / badQuoteRef.current < 0.01)) {
            badQuoteRef.current = q.price;
            return;
          }
        }
        badQuoteRef.current = 0;
        const { tzMs, offsetMs: off } = shiftRef.current;
        const nowWall = Date.now() + (source === "moex" ? MSK_MS : 0) + (source === "forex" && !intraday && new Date().getUTCDay() === 0 ? DAY_MS : 0);
        const plan = intervalPlan(iv, source);
        let bucketT: number;
        if (plan.ratio > 1) {
          // aggregated bars are anchored to each day's first candle: continue from the last bar, and let the bar refresh fetch real ones after gaps
          const nowChart = Date.now() + off;
          bucketT = last.t + Math.floor((nowChart - last.t) / plan.ms) * plan.ms;
          if (bucketT - last.t > plan.ms * 2) bucketT = last.t;
        } else bucketT = bucketStartWall(nowWall, iv) - tzMs;
        if (bucketT > last.t) {
          engine.upsertCandle({ t: bucketT, o: q.price, h: q.price, l: q.price, c: q.price, v: 0 });
        } else {
          engine.upsertCandle({ ...last, c: q.price, h: Math.max(last.h, q.price), l: Math.min(last.l, q.price) });
        }
        refreshInd();
      } catch {
      } finally {
        quoteBusy = false;
      }
    };

    const refreshBars = async () => {
      const engine = engineRef.current;
      if (stopped || barsBusy || !engine || document.hidden || dataKeyRef.current !== dataKey) return;
      barsBusy = true;
      try {
        const { candles, delayed } = await fetchBars(source, ticker, iv, 3);
        if (stopped || dataKeyRef.current !== dataKey) return;
        if (delayed !== undefined) setCandlesDelayed(delayedNow(source, delayed, engine.getCandles().at(-1)?.t, shiftRef.current.offsetMs, iv));
        // the last few bars: the newest one is replaced, the one that closed a moment ago gets its final numbers
        for (const c of candles) engine.upsertCandle(c);
        refreshInd();
      } catch {
      } finally {
        barsBusy = false;
      }
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

  /* order flow (footprint, volume profile, VWAP / CVD from trades): fetches the trades of what the chart shows */
  const flowClientRef = useRef<OrderFlowClient | null>(null);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady || !prefsLoaded || source === "none") return;
    const client = new OrderFlowClient({
      engine,
      source,
      ticker,
      getOffsetMs: () => shiftRef.current.offsetMs,
      getFootprint: () => csRef.current.settings.footprint,
    });
    flowClientRef.current = client;
    client.start();
    // the indicators' legend values follow the trades too
    const offFlow = engine.flow.subscribe(refreshInd);
    return () => {
      offFlow();
      client.stop();
      flowClientRef.current = null;
    };
  }, [engineReady, prefsLoaded, source, ticker, prefs.interval, refreshInd]);

  /* who needs trade data: the footprint chart type, order flow indicators, volume profile / VWAP drawings */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady) return;
    const sync = () => {
      const needs = engine.flow.needs;
      const set = (k: string, on: boolean) => {
        if (on) needs.add(k);
        else needs.delete(k);
      };
      set("footprint", prefs.chartType === "footprint");
      set("ind", indicators.list().some((i) => i.visible && FLOW_INDICATOR_IDS.includes(i.id)));
      set("draw", drawings.listAll().some((d) => FLOW_DRAWING_TOOLS.includes(d.tool)));
      set("big", indicators.list().some((i) => i.visible && i.id === "bigtrades"));
      flowClientRef.current?.kick(120);
    };
    sync();
    const u1 = indicators.subscribe(sync);
    const u2 = drawings.subscribe(sync);
    return () => {
      u1();
      u2();
    };
  }, [engineReady, prefs.chartType, indicators, drawings, source, ticker, prefs.interval]);

  useEffect(() => {
    flowClientRef.current?.kick(200);
  }, [cs.footprint.stepTicks]);

  /* MOEX ALGOPACK (Promo datasets for the FUTOI / SuperCandles / Mega Alerts / HI2 indicators): the server serves them to entitled requesters only */
  const algoClientRef = useRef<AlgoClient | null>(null);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady || !prefsLoaded || source === "none") return;
    const client = new AlgoClient({ engine, source, ticker, getTzMs: () => shiftRef.current.tzMs });
    algoClientRef.current = client;
    client.start();
    const off = engine.algo.subscribe(refreshInd);
    return () => {
      off();
      client.stop();
      algoClientRef.current = null;
    };
  }, [engineReady, prefsLoaded, source, ticker, prefs.interval, refreshInd]);

  /* which ALGOPACK datasets the indicators on the chart need */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady) return;
    const sync = () => {
      const want = new Set<AlgoNeed>();
      for (const i of indicators.list()) if (i.visible) for (const n of getIndicatorDef(i.id)?.algo ?? []) want.add(n);
      const needs = engine.algo.needs;
      let changed = false;
      for (const n of Array.from(needs)) if (!want.has(n)) (needs.delete(n), (changed = true));
      for (const n of want) if (!needs.has(n)) (needs.add(n), (changed = true));
      if (changed) algoClientRef.current?.kick(150);
    };
    sync();
    return indicators.subscribe(sync);
  }, [engineReady, indicators, source, ticker, prefs.interval]);

  /* the footprint needs wide bars: zoom in once when it is picked */
  useEffect(() => {
    if (prefs.chartType === "footprint") engineRef.current?.ensureMinSpacing(64);
  }, [engineReady, prefs.chartType]);

  /* alerts: paint the active ones of this symbol on the chart */
  const { alerts: allAlerts } = alertsApi;
  useEffect(() => {
    alertsLayer.setMarks(
      allAlerts
        .filter((a) => a.status === "active" && a.source === source && a.dataTicker === ticker)
        .map((a) => ({ id: a.id, kind: a.kind, price: a.price, line: a.line }))
    );
  }, [allAlerts, source, ticker, alertsLayer]);

  /* economic calendar events on the time axis (chart time = real UTC + offsetMs; the layer fetches the visible range lazily) */
  useEffect(() => {
    eventsLayer.setLabels({ act: t("ec.act"), fcst: t("ec.fcst"), prev: t("ec.prev"), more: t("ec.ov.more", { n: "{n}" }) });
  }, [eventsLayer, t]);
  useEffect(() => {
    eventsLayer.setTimeOffset(offsetMs);
  }, [eventsLayer, offsetMs]);
  useEffect(() => {
    eventsLayer.setZone(resolveZone(cs.tz, source), LOCALES[locale] ?? "ru-RU");
  }, [eventsLayer, cs.tz, source, locale]);
  useEffect(() => {
    eventsLayer.setFilter(calPrefs.chart.impacts, calPrefs.countries, calPrefs.moex, calPrefs.commodities, calPrefs.russia);
    eventsLayer.setEnabled(calPrefs.chart.on);
  }, [eventsLayer, calPrefs.chart.on, calPrefs.chart.impacts, calPrefs.countries, calPrefs.moex, calPrefs.commodities, calPrefs.russia]);

  const openAlerts = useCallback((draft: AlertDraft | null) => {
    setAlertDraft(draft);
    setAlertsOpen(true);
  }, []);

  /** Alert at a price: the one under the pointer when it is over the chart, else the last close. */
  const openAlertAtCursor = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const candles = engine.getCandles();
    const raw = alertsLayer.getPointerPrice() ?? candles[candles.length - 1]?.c;
    if (raw === undefined || !Number.isFinite(raw)) {
      openAlerts(null);
      return;
    }
    openAlerts({ price: Number(raw.toFixed(engine.getPrecision())) });
  }, [alertsLayer, openAlerts]);

  /** Alert that follows the selected line; anchors go from chart time back to real UTC ms. */
  const openAlertFromDrawing = useCallback(() => {
    const g = drawings.getSelectedGeometry();
    if (!g || g.points.length === 0) return;
    const { offsetMs } = shiftRef.current;
    const pts = g.points.map((pt) => ({ t: Math.round(pt.t - offsetMs), p: pt.p }));
    const p1 = pts[0];
    openAlerts({ price: p1.p, line: { tool: g.tool, p1, p2: pts[1] ?? p1 } });
  }, [drawings, openAlerts]);

  // Alt+A: alert at the cursor price
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.code !== "KeyA" || ev.defaultPrevented || !activeRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      ev.preventDefault();
      openAlertAtCursor();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openAlertAtCursor]);

  /* context menu: right click, or a long press on a drawing (touch); the browser menu never shows over the chart */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let lastOpen = 0;
    const open = (clientX: number, clientY: number, forcedId?: string | null, pointerType = "mouse") => {
      const engine = engineRef.current;
      if (!engine) return;
      const r = host.getBoundingClientRect();
      const x = clientX - r.left - engine.getPlotOffsetX();
      const y = clientY - r.top;
      const inMain = engine.getPaneAtY(y) === "main" && x >= 0 && x <= engine.getPlotSize().width && y <= engine.getPlotSize().height;
      let id: string | null = null;
      if (forcedId !== undefined) id = forcedId;
      else if (inMain) id = drawings.selectAtPoint(x, y, pointerType);
      const price = inMain ? engine.yToPrice("main", y) : NaN;
      const time = inMain ? engine.xToTime(x) : NaN;
      const okPrice = Number.isFinite(price) && Number.isFinite(time);
      lastOpen = Date.now();
      setMenu({
        clientX,
        clientY,
        local: inMain ? { x, y } : null,
        drawingId: id,
        price: okPrice ? price : null,
        priceText: okPrice ? formatPrice(price, engine.getPrecision(), engine.opts.locale) : "",
        time: okPrice ? time : null,
      });
    };
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      // a touch long press fires both the controller callback and this event: keep the first
      if (Date.now() - lastOpen < 900) return;
      open(e.clientX, e.clientY, undefined, (e as PointerEvent).pointerType || "mouse");
    };
    host.addEventListener("contextmenu", onCtx);
    drawings.setContextMenuHandler(({ x, y, id }) => {
      const r = host.getBoundingClientRect();
      open(r.left + (engineRef.current?.getPlotOffsetX() ?? 0) + x, r.top + y, id);
    });
    return () => {
      host.removeEventListener("contextmenu", onCtx);
      drawings.setContextMenuHandler(null);
    };
  }, [drawings]);

  /* drawing properties dialog: the style bar gear, a double click and the context menu ask the controller for it */
  useEffect(() => {
    drawings.setSettingsHandler((id) => setSettingsId(id));
    return () => drawings.setSettingsHandler(null);
  }, [drawings]);
  useEffect(() => {
    drawings.setLabels({ qty: t("draw.lbl.qty"), risk: t("draw.lbl.risk"), reward: t("draw.lbl.reward") });
  }, [drawings, t]);

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

  /** Candles on the chart as a CSV file: time is exchange time for MOEX (Moscow) and UTC for crypto. */
  const exportCandlesCsv = () => {
    const candles = engineRef.current?.getCandles() ?? [];
    if (!candles.length) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = (ms: number) => {
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    };
    const head = source === "moex" ? "time_msk" : "time_utc";
    const rows = candles.map((c) => `${stamp(c.t)},${c.o},${c.h},${c.l},${c.c},${c.v}`);
    const blob = new Blob([`${head},open,high,low,close,volume\n${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${instrument.ticker}_${prefs.interval}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const screenshot = () => {
    const url = engineRef.current?.screenshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker}-${prefs.interval}.png`;
    a.click();
  };

  const copyScreenshot = async () => {
    const url = engineRef.current?.screenshot();
    if (!url) return;
    try {
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch {
      screenshot();
    }
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
          const { candles: older } = await fetchBars(source, ticker, iv, 500, first.t - 1);
          if (gen !== genRef.current) return;
          engine.prependCandles(older);
          refreshInd();
          extendComparesRef.current();
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

  /* go to a date: load older bars when needed, then centre on it */
  const goToDate = async (iso: string) => {
    const engine = engineRef.current;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!engine || !m || rangeBusy || replay.mode !== "off") return;
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const target = wall - engine.getTimeShiftAt(wall);
    const gen = genRef.current;
    const iv = prefs.interval;
    setRangeBusy(true);
    try {
      for (let round = 0; round < 40; round++) {
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
          const { candles: older } = await fetchBars(source, ticker, iv, 500, first.t - 1);
          if (gen !== genRef.current) return;
          engine.prependCandles(older);
          refreshInd();
          extendComparesRef.current();
          if (older.length === 0) break;
        } finally {
          loadingHistory.current = false;
        }
      }
      const cs2 = engine.getCandles();
      if (cs2.length && target >= cs2[cs2.length - 1].t) engine.scrollToLatest();
      else engine.centerOn(target);
    } finally {
      setRangeBusy(false);
    }
  };

  /* compare / overlay symbols */
  const loadCompare = useCallback(
    async (c: CompareState, iv: string, token: { cancelled: boolean }) => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        const { candles, tzMin } = await fetchBars(c.source, c.ticker, iv, 600);
        if (token.cancelled) return;
        // bring the other exchange's clock onto the main chart's clock
        const cmpTz = c.source === "moex" ? tzMin * 60_000 : 0;
        const cmpOffset = (c.source === "moex" ? MSK_MS : 0) - cmpTz;
        const shift = shiftRef.current.offsetMs - cmpOffset;
        const mapped = shift === 0 ? candles : candles.map((k) => ({ ...k, t: k.t + shift }));
        compareData.current.set(c.id, mapped);
        compareShift.current.set(c.id, shift);
        engine.setCompareData(c.id, mapped);
        setCompares((list) => list.map((x) => (x.id === c.id ? { ...x, loading: false, failed: mapped.length === 0 } : x)));
      } catch {
        if (!token.cancelled) setCompares((list) => list.map((x) => (x.id === c.id ? { ...x, loading: false, failed: true } : x)));
      }
    },
    []
  );

  const addCompare = (inst: TerminalInstrument) => {
    const engine = engineRef.current;
    if (!engine || inst.source === "none") return;
    const id = `${inst.source}:${inst.dataTicker}`;
    if (compares.some((c) => c.id === id) || (inst.source === source && inst.dataTicker === ticker)) return;
    const color = COMPARE_COLORS[compares.length % COMPARE_COLORS.length];
    const state: CompareState = { id, source: inst.source, ticker: inst.dataTicker, label: inst.ticker, color, mode: "percent", visible: true, loading: true };
    setCompares((l) => [...l, state]);
    engine.addCompare({ id, label: inst.ticker, color, mode: "percent", candles: [] });
    // same scale as percent, like TradingView
    if (cs.scale.mode === "regular") csApi.update((x) => ({ ...x, scale: { ...x.scale, mode: "percent" } }));
    void loadCompare(state, prefs.interval, { cancelled: false });
  };

  // older history of the main symbol was loaded: compared symbols reach back as far
  extendComparesRef.current = async () => {
    const engine = engineRef.current;
    const mainFirst = engine?.getCandles()[0]?.t;
    if (!engine || mainFirst === undefined) return;
    const iv = prefs.interval;
    for (const c of compareList.current) {
      const cur = compareData.current.get(c.id);
      if (!cur || cur.length === 0 || cur[0].t <= mainFirst || compareExtending.current.has(c.id)) continue;
      compareExtending.current.add(c.id);
      try {
        const shift = compareShift.current.get(c.id) ?? 0;
        const { candles } = await fetchBars(c.source, c.ticker, iv, 500, cur[0].t - shift - 1);
        const fresh = candles.map((k) => ({ ...k, t: k.t + shift })).filter((k) => k.t < cur[0].t);
        const now = compareData.current.get(c.id);
        if (fresh.length && now && now[0].t === cur[0].t) {
          const next = fresh.concat(now);
          compareData.current.set(c.id, next);
          engine.setCompareData(c.id, next);
        }
      } catch {
      } finally {
        compareExtending.current.delete(c.id);
      }
    }
  };
  compareList.current = compares;

  const removeCompare = (id: string) => {
    engineRef.current?.removeCompare(id);
    compareData.current.delete(id);
    setCompares((l) => l.filter((c) => c.id !== id));
  };

  // the interval or the main symbol changed: compared symbols follow
  useEffect(() => {
    if (dataVersion === 0 || compares.length === 0) return;
    const token = { cancelled: false };
    for (const c of compares) void loadCompare({ ...c, loading: false }, prefs.interval, token);
    return () => {
      token.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // compared symbols get their newest bars now and then
  useEffect(() => {
    if (compares.length === 0 || replayActive) return;
    const iv = prefs.interval;
    const id = setInterval(async () => {
      if (document.hidden) return;
      const engine = engineRef.current;
      if (!engine) return;
      for (const c of compares) {
        const cur = compareData.current.get(c.id);
        if (!cur || cur.length === 0) continue;
        try {
          const { candles, tzMin } = await fetchBars(c.source, c.ticker, iv, 3);
          const cmpTz = c.source === "moex" ? tzMin * 60_000 : 0;
          const shift = shiftRef.current.offsetMs - ((c.source === "moex" ? MSK_MS : 0) - cmpTz);
          const next = cur.slice();
          for (const k of candles) {
            const kk = { ...k, t: k.t + shift };
            const last = next[next.length - 1];
            if (kk.t === last.t) next[next.length - 1] = kk;
            else if (kk.t > last.t) next.push(kk);
          }
          compareData.current.set(c.id, next);
          engine.setCompareData(c.id, next);
        } catch {}
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [compares, prefs.interval, replayActive]);

  const compareItems: CompareItem[] = compares.map((c) => ({ id: c.id, label: c.label, color: c.color, mode: c.mode, visible: c.visible, loading: c.loading, failed: c.failed }));

  /* layouts and templates */
  const getTemplate = (withDrawings: boolean): ChartTemplateData => ({
    v: 1,
    settings: cs,
    chartType: prefs.chartType,
    showVolume: prefs.showVolume,
    showGrid: prefs.showGrid,
    showWatermark: prefs.showWatermark,
    indicators: indicators.serialize(),
    drawings: withDrawings ? drawings.serialize() : undefined,
  });
  const applyTemplate = (d: ChartTemplateData) => {
    // the interval favourites belong to the user, not to a template
    csApi.replace({ ...normalizeSettings(d.settings), ui: csApi.settings.ui });
    update({ chartType: d.chartType, showVolume: d.showVolume, showGrid: d.showGrid, showWatermark: d.showWatermark });
    if (d.indicators) indicators.restore(d.indicators);
    if (d.drawings) drawings.restore(d.drawings);
  };
  const getLayout = (): ChartLayoutData => ({ v: 1, source, ticker, name: instrument.name, interval: prefs.interval, template: getTemplate(true) });
  const applyLayout = (l: ChartLayoutData) => {
    const same = l.source === source && l.ticker === ticker;
    if (l.template.drawings && !same) saveDrawingsFor(l.source, l.ticker, l.template.drawings);
    applyTemplate(l.template);
    update({ interval: l.interval });
    if (!same) handleSelectRef.current(findInstrument(l.source, l.ticker) ?? adHocInstrument(l.source as ChartSource, l.ticker));
  };

  const openSettings = useCallback((tab?: SettingsTab) => {
    if (tab) setCsTab(tab);
    setCsOpen(true);
  }, []);

  /* linked charts: crosshair and visible time range travel through the layout's hub */
  useEffect(() => {
    const engine = engineRef.current;
    if (!hub || !engine || !engineReady) return;
    const id = storageId ?? "main";
    let lastKey = "";
    let quiet = 0;
    engine.onCrosshairMove = (t) => hub.emitCrosshair(id, t);
    engine.onViewChange = () => {
      if (!hub.range || Date.now() < quiet) return;
      const r = engine.getVisibleTimeRange();
      const key = `${Math.round(r.from / 1000)}:${Math.round(r.to / 1000)}`;
      if (key === lastKey) return;
      lastKey = key;
      hub.emitRange(id, r);
    };
    const u1 = hub.onCrosshair((from, tm) => {
      if (from !== id) engine.setExternalCrosshair(hub.crosshair ? tm : null);
    });
    const u2 = hub.onRange((from, r) => {
      if (from === id || !hub.range) return;
      lastKey = `${Math.round(r.from / 1000)}:${Math.round(r.to / 1000)}`;
      quiet = Date.now() + 120;
      engine.setVisibleTimeRange(r.from, r.to);
    });
    return () => {
      u1();
      u2();
      engine.onCrosshairMove = null;
      engine.onViewChange = null;
      engine.setExternalCrosshair(null);
    };
  }, [hub, engineReady, storageId]);

  /* hotkeys: zoom, scroll, help, settings ... */
  const modalOpenRef = useRef(false);
  modalOpenRef.current = csOpen || shortcutsOpen || searchOpen || indOpen || alertsOpen || comparePick;
  const hotkeyActions = useRef({ toggleFullscreen: () => {}, screenshot: () => {} });
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented) return;
      if (!activeRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const engine = engineRef.current;
      const mod = ev.ctrlKey || ev.metaKey;
      if (ev.key === "?" || (ev.shiftKey && ev.code === "Slash")) {
        ev.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (modalOpenRef.current || mod) return;
      if (ev.altKey) {
        if (ev.code === "KeyR") engine?.resetView();
        else if (ev.code === "KeyG") setGotoSignal((n) => n + 1);
        else if (ev.code === "KeyP") setCsOpen(true);
        else if (ev.code === "KeyS") hotkeyActions.current.screenshot();
        else return;
        ev.preventDefault();
        return;
      }
      if (!engine) return;
      if (ev.shiftKey && ev.code === "KeyF") {
        ev.preventDefault();
        hotkeyActions.current.toggleFullscreen();
        return;
      }
      switch (ev.key) {
        case "+":
        case "=":
          engine.zoomBy(1.25);
          break;
        case "-":
        case "_":
          engine.zoomBy(0.8);
          break;
        case "ArrowLeft":
          engine.scrollBy(ev.shiftKey ? -10 : -1);
          break;
        case "ArrowRight":
          engine.scrollBy(ev.shiftKey ? 10 : 1);
          break;
        case "End":
          engine.scrollToLatest();
          break;
        case "Home":
          engine.scrollToStart();
          break;
        default:
          return;
      }
      ev.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
  /* app-only terminal page: hand the page the chart's actions and keep it told about the interval / delay / badges */
  if (appHandle) {
    appHandle.current = {
      setInterval: (id) => {
        update({ interval: id });
        onIntervalChange?.(id);
      },
      applyRange: (r) => void applyRange(r),
      openSearch: () => setSearchOpen(true),
      openAlerts: () => openAlerts(null),
      openIndicators: () => setIndOpen(true),
      openSettings: () => openSettings(),
      toggleDrawTools: () => setToolsOpen((v) => !v),
      openWatchlist: () => onTab("watchlist"),
    };
  }
  const onAppStateRef = useRef(onAppState);
  onAppStateRef.current = onAppState;
  useEffect(() => {
    onAppStateRef.current?.({ interval: prefs.interval, delayed: candlesDelayed });
  }, [prefs.interval, candlesDelayed]);
  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;
  hotkeyActions.current = { toggleFullscreen, screenshot };
  const scaleModeNow = cs.scale.mode;
  const setScaleMode = (m: ScaleMode) => csApi.update((x) => ({ ...x, scale: { ...x.scale, mode: m } }));

  return (
    <div ref={wrapRef} className="flex flex-col w-full h-full min-h-0 bg-[var(--tv3-canvas)] text-[var(--tv3-text)] select-none">
      {/* design v3: floating cards on the canvas: [drawing tools] [chart card: toolbar + chart + bottom bar] [right panel] */}
      <div className={`relative flex flex-1 min-h-0 ${embedded ? "" : compact ? "md:gap-2" : "md:gap-2 md:p-2"}`}>
        {/* drawing tools (the toolbar is its own card; on a phone it is a drawer under the top toolbar) */}
        <div
          className={`${embedded ? "!hidden " : ""}${toolsOpen ? "flex" : "hidden"} md:flex absolute md:static left-0 ${appPage ? "top-0" : "top-[46px]"} md:top-auto bottom-0 z-30 md:z-auto shrink-0 min-h-0 bg-[var(--tv3-card)] md:bg-transparent border-r border-[var(--tv3-hair)] md:border-0`}
        >
          <DrawingToolbar controller={drawings} />
        </div>

        {/* chart card */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 md:rounded-2xl bg-[var(--tv3-card)] overflow-hidden">
      {!appPage && (
      <TopToolbar
        instrument={instrument}
        interval={prefs.interval}
        onInterval={(id) => {
          update({ interval: id });
          onIntervalChange?.(id);
        }}
        chartType={prefs.chartType}
        onChartType={(c) => update({ chartType: c })}
        onOpenSearch={() => setSearchOpen(true)}
        onPickInstrument={handleSelect}
        onOpenIndicators={() => setIndOpen(true)}
        onOpenAlerts={() => (isDesktop && !embedded && !compact ? onTab("alerts") : openAlerts(null))}
        alertCount={alertsApi.activeCount}
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
        favIntervals={cs.ui.favIntervals}
        onFavIntervals={(list) => csApi.update((x) => ({ ...x, ui: { ...x.ui, favIntervals: list } }))}
        onOpenSettings={() => openSettings()}
        onOpenCompare={() => setComparePick(true)}
        compareCount={compares.length}
        settingsApi={csApi}
        transformBox={transformBox}
        templates={{ getTemplate, applyTemplate, getLayout, applyLayout }}
        onScreenshotCopy={copyScreenshot}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        extra={toolbarExtra}
      />
      )}

          <div className="group relative flex-1 min-h-0">
            <div ref={hostRef} className="absolute inset-0" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="inline-block w-6 h-6 border-2 border-[var(--tv3-hair)] border-t-[var(--tv3-accent)] rounded-full animate-spin" />
              </div>
            )}
            {candlesDelayed && !loading && !empty && !appPage && (
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-500" title={t("ap.delayed.tip")}>
                {t("ap.delayed")}
              </div>
            )}
            {source === "forex" && fxInfo && !loading && !empty && (
              <div
                className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none rounded bg-[var(--tv3-fill2)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--tv3-muted)]"
                title={`${t("fx.tip", { provider: fxInfo.provider === "yahoo" ? "Yahoo Finance" : fxInfo.provider === "fmp" ? "FMP" : fxInfo.provider === "stooq" ? "Stooq" : fxInfo.provider, volume: t(`fx.vol.${fxInfo.volumeKind === "tick" ? "tick" : fxInfo.volumeKind === "futures" ? "fut" : "none"}`) })}${fxInfo.proxy ? ` ${t("fx.proxy", { proxy: fxInfo.proxy })}` : ""}`}
              >
                {t(`fx.badge.${fxInfo.volumeKind === "tick" ? "tick" : fxInfo.volumeKind === "futures" ? "fut" : "none"}`)}
              </div>
            )}
            {!loading && empty && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--tv3-muted)] pointer-events-none">{t(source === "forex" ? "fx.noData" : source === "fmp" && emptyWhy ? `fmp.err.${emptyWhy}` : "chart.noData")}</div>
            )}
            {hasSelection && <DrawingStyleBar controller={drawings} onCreateAlert={openAlertFromDrawing} />}
            {!isTransformedType(prefs.chartType) && <IndicatorLegend controller={indicators} getEngine={getEngine} hostRef={hostRef} />}
            <CompareLegend
              items={compareItems}
              right={cs.scale.side === "left" ? 12 : 84}
              onToggle={(id) => {
                const c = compares.find((x) => x.id === id);
                if (!c) return;
                engineRef.current?.updateCompare(id, { visible: !c.visible });
                setCompares((l) => l.map((x) => (x.id === id ? { ...x, visible: !x.visible } : x)));
              }}
              onRemove={removeCompare}
              onColor={(id, color) => {
                engineRef.current?.updateCompare(id, { color });
                setCompares((l) => l.map((x) => (x.id === id ? { ...x, color } : x)));
              }}
              onMode={(id, mode) => {
                engineRef.current?.updateCompare(id, { mode });
                setCompares((l) => l.map((x) => (x.id === id ? { ...x, mode } : x)));
              }}
            />
            {cs.navButtons !== "never" && (
              <div
                className={`tv3-pop absolute bottom-2.5 z-10 flex items-center overflow-hidden rounded-xl shadow-[0_2px_12px_rgba(0,0,0,.14)] transition-opacity ${
                  cs.scale.side === "left" ? "left-[76px]" : "left-2.5"
                } ${cs.navButtons === "hover" ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100" : ""}`}
              >
                {(
                  [
                    ["zoomOut", CS_ICONS.zoomOut, "cs.nav.zoomOut", () => engineRef.current?.zoomBy(0.8)],
                    ["zoomIn", CS_ICONS.zoomIn, "cs.nav.zoomIn", () => engineRef.current?.zoomBy(1.25)],
                    ["toLatest", CS_ICONS.toLatest, "cs.nav.toLatest", () => engineRef.current?.scrollToLatest()],
                    ["resetView", CS_ICONS.resetView, "cs.nav.resetView", () => engineRef.current?.resetView()],
                  ] as const
                ).map(([k, glyph, label, fn]) => (
                  <button key={k} onClick={fn} title={t(label)} aria-label={t(label)} className="tv3-press w-[39px] h-[35px] inline-flex items-center justify-center text-[var(--tv3-text2)] hover:bg-[var(--tv3-hover)] cursor-pointer">
                    {glyph}
                  </button>
                ))}
              </div>
            )}
            <ReplayControls api={replay} hostRef={hostRef} getEngine={getEngine} />
          </div>
          {!appPage && (
          <BottomBar
            source={source}
            autoScale={autoScale}
            logScale={scaleModeNow === "log"}
            onAuto={() => engineRef.current?.setAutoScale(!autoScale)}
            onLog={() => setScaleMode(scaleModeNow === "log" ? "regular" : "log")}
            onRange={applyRange}
            rangeBusy={rangeBusy || replayActive}
            scaleMode={scaleModeNow}
            onScaleMode={setScaleMode}
            tz={cs.tz}
            zone={resolveZone(cs.tz, source)}
            onTz={(tz) => csApi.update((x) => ({ ...x, tz }))}
            onGoToDate={goToDate}
            gotoSignal={gotoSignal}
          />
          )}
          {!embedded && !compact && !appPage && (
            <nav className="md:hidden shrink-0 flex items-stretch border-t border-[var(--tv3-hair)] bg-[var(--tv3-card)] pb-[env(safe-area-inset-bottom)]">
              {(
                [
                  ["watchlist", "mnav.watchlist", panelTabIcon("watchlist", mobilePanel, 25), () => onTab("watchlist"), mobilePanel],
                  ["indicators", "mnav.indicators", ui(<path d={DESIGN_PATHS.indicators} />, 25), () => setIndOpen(true), false],
                  ["tools", "mnav.tools", <DrawIcon key="d" id="trend" size={25} filled={toolsOpen} />, () => setToolsOpen((v) => !v), toolsOpen],
                  ["alerts", "mnav.alerts", ui(<path d={DESIGN_PATHS.alert} />, 25), () => openAlerts(null), false],
                  ["settings", "mnav.settings", ui(<path d={DESIGN_PATHS.gear} />, 25), () => openSettings(), false],
                ] as const
              ).map(([k, label, icon, fn, on]) => (
                <button
                  key={k}
                  type="button"
                  onClick={fn}
                  aria-label={t(label)}
                  aria-pressed={on}
                  className={`tv3-press flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] leading-tight cursor-pointer ${on ? "text-[var(--tv3-accent)]" : "text-[var(--tv3-muted)]"}`}
                >
                  {icon}
                  <span className="truncate max-w-full">{t(label)}</span>
                </button>
              ))}
            </nav>
          )}
        </div>

        <div className={embedded || compact ? "hidden" : "contents"}>
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
          drawings={drawings}
          indicators={indicators}
          calendarZone={resolveZone(cs.tz, source)}
          alertsApi={alertsApi}
          onOpenAlerts={() => openAlerts(null)}
          appPage={appPage}
        />
        </div>
      </div>

      <ChartContextMenu
        state={menu}
        controller={drawings}
        onClose={closeMenu}
        onResetView={() => engineRef.current?.resetView()}
        onExportCsv={exportCandlesCsv}
        onAlertAtPrice={(price) => openAlerts({ price: Number(price.toFixed(engineRef.current?.getPrecision() ?? 2)) })}
        onCreateAlertFromDrawing={openAlertFromDrawing}
        onOpenChartSettings={() => openSettings()}
        eventsOn={calPrefs.chart.on}
        onToggleEvents={() => updateCalPrefs((p) => ({ ...p, chart: { ...p.chart, on: !p.chart.on } }))}
      />
      <ChartSettingsDialog
        open={csOpen}
        onClose={() => setCsOpen(false)}
        api={csApi}
        theme={composeTheme(cs, siteDark)}
        autoScale={autoScale}
        onAutoScale={(a) => engineRef.current?.setAutoScale(a)}
        toggles={{ showVolume: prefs.showVolume, showGrid: prefs.showGrid, showWatermark: prefs.showWatermark }}
        onToggle={(k, v) => update({ [k]: v } as Partial<Prefs>)}
        initialTab={csTab}
      />
      <PriceScaleMenu
        pos={scaleMenu}
        onClose={() => setScaleMenu(null)}
        api={csApi}
        autoScale={autoScale}
        onAuto={(a) => engineRef.current?.setAutoScale(a)}
        onSettings={() => openSettings("scales")}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {!embedded && <CalendarRemindersHost />}
      <InstrumentSearchDialog open={comparePick} mode="compare" onClose={() => setComparePick(false)} onPick={addCompare} current={{ source, ticker }} />
      <DrawingSettingsDialog controller={drawings} id={settingsId} onClose={() => setSettingsId(null)} />
      <InstrumentSearchDialog open={searchOpen} mode="symbol" onClose={() => setSearchOpen(false)} onPick={handleSelect} current={{ source, ticker }} />
      <IndicatorsDialog controller={indicators} open={indOpen} onClose={() => setIndOpen(false)} />
      <AlertsDialog
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        api={alertsApi}
        symbol={{ ticker: instrument.ticker, name: name || instrument.name, source, dataTicker: ticker }}
        draft={alertDraft}
      />
    </div>
  );
}
