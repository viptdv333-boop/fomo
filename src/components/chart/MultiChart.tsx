"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import TradingChart from "./TradingChart";
import MenuPopover from "./MenuPopover";
import type { AppChartHandle, AppChartState } from "./app-bridge";
import { ChartSyncHub } from "@/lib/chart/sync";
import { listUserData, saveUserData } from "@/lib/chart/userdata";
import { adHocInstrument, findInstrument, instName, type ChartSource, type TerminalInstrument } from "@/lib/terminal-data";

/* Several charts in one terminal: 1, 2 (side by side / stacked), 3 and 4 panes.
   Pane 0 is the terminal's main chart (symbol from the page, side panel, drawing tools); the others are compact
   TradingChart instances with their own symbol, interval and preferences. */

type LayoutId = "1" | "2c" | "2r" | "3" | "4";

const LAYOUTS: { id: LayoutId; panes: number; key: string }[] = [
  { id: "1", panes: 1, key: "cs.ml.one" },
  { id: "2c", panes: 2, key: "cs.ml.twoCols" },
  { id: "2r", panes: 2, key: "cs.ml.twoRows" },
  { id: "3", panes: 3, key: "cs.ml.three" },
  { id: "4", panes: 4, key: "cs.ml.four" },
];

interface PaneSym {
  source: ChartSource;
  ticker: string;
}

interface SyncFlags {
  symbol: boolean;
  interval: boolean;
  crosshair: boolean;
  range: boolean;
}

interface MultiState {
  v: 1;
  at: number;
  layout: LayoutId;
  /** Symbols of panes 1..3. */
  panes: (PaneSym | null)[];
  sync: SyncFlags;
}

const LS_KEY = "fomo-chart-multi-v1";
const DEFAULT_STATE: MultiState = { v: 1, at: 0, layout: "1", panes: [null, null, null], sync: { symbol: false, interval: false, crosshair: true, range: false } };

function normalize(raw: unknown): MultiState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<MultiState>;
  const layout = LAYOUTS.some((l) => l.id === r.layout) ? (r.layout as LayoutId) : "1";
  const panes = [0, 1, 2].map((i) => {
    const p = Array.isArray(r.panes) ? r.panes[i] : null;
    return p && typeof p.ticker === "string" && typeof p.source === "string" ? { source: p.source as ChartSource, ticker: p.ticker } : null;
  });
  const s = (r.sync && typeof r.sync === "object" ? r.sync : {}) as Partial<SyncFlags>;
  return {
    v: 1,
    at: typeof r.at === "number" ? r.at : 0,
    layout,
    panes,
    sync: {
      symbol: !!s.symbol,
      interval: !!s.interval,
      crosshair: s.crosshair !== false,
      range: !!s.range,
    },
  };
}

function loadLocal(): MultiState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return DEFAULT_STATE;
}

const I = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const LAYOUT_ICONS: Record<LayoutId, ReactNode> = {
  "1": I(<rect x="3.5" y="4.5" width="17" height="15" rx="3" />),
  "2c": I(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M12 4.5v15" />
    </>
  ),
  "2r": I(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M3.5 12h17" />
    </>
  ),
  "3": I(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M12 4.5v15M12 12h8.5" />
    </>
  ),
  "4": I(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M12 4.5v15M3.5 12h17" />
    </>
  ),
};

const GRID: Record<LayoutId, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2c": "grid-cols-2 grid-rows-1",
  "2r": "grid-cols-1 grid-rows-2",
  "3": "grid-cols-2 grid-rows-2",
  "4": "grid-cols-2 grid-rows-2",
};

interface Props {
  ticker: string;
  source: ChartSource;
  name?: string;
  onSelectSymbol?: (inst: TerminalInstrument) => void;
  /** App-only terminal page: a single chart whose toolbar / bottom bar / phone nav are drawn by the page (see AppTerminal). */
  appPage?: boolean;
  appHandle?: MutableRefObject<AppChartHandle | null>;
  onAppState?: (s: AppChartState) => void;
}

export default function MultiChart(props: Props) {
  const { t } = useT();
  const { ticker, source, name, onSelectSymbol, appPage, appHandle, onAppState } = props;
  const [state, setState] = useState<MultiState>(() => (typeof window === "undefined" ? DEFAULT_STATE : loadLocal()));
  const [active, setActive] = useState(0);
  const [sharedInterval, setSharedInterval] = useState<string | null>(null);
  const hub = useMemo(() => new ChartSyncHub(), []);
  hub.crosshair = state.sync.crosshair;
  hub.range = state.sync.range;
  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commit = useCallback((fn: (s: MultiState) => MultiState) => {
    const next = { ...fn(stateRef.current), at: Date.now() };
    stateRef.current = next;
    setState(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveUserData("chart_settings", "multi", stateRef.current), 900);
  }, []);

  // the account copy follows the user across devices
  useEffect(() => {
    let cancelled = false;
    listUserData("chart_settings", "multi").then((items) => {
      if (cancelled || !items[0]) return;
      const remote = normalize(items[0].data);
      if (remote.at > stateRef.current.at) {
        stateRef.current = remote;
        setState(remote);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(remote));
        } catch {}
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // the app terminal page is one chart: a layout saved on the desktop must not squeeze four panes into it
  const count = appPage ? 1 : LAYOUTS.find((l) => l.id === state.layout)?.panes ?? 1;
  const primary: PaneSym = { source, ticker };
  const symOf = (i: number): PaneSym => (i === 0 ? primary : state.panes[i - 1] ?? primary);

  const setLayout = (layout: LayoutId) => {
    commit((s) => {
      // new panes start with the main chart's symbol
      const panes = s.panes.map((p) => p ?? { source, ticker });
      return { ...s, layout, panes };
    });
    setActive((a) => Math.min(a, (LAYOUTS.find((l) => l.id === layout)?.panes ?? 1) - 1));
  };

  const setSyncFlag = (k: keyof SyncFlags, v: boolean) => {
    commit((s) => ({ ...s, sync: { ...s.sync, [k]: v } }));
    if (k === "symbol" && v) {
      const sym = symOf(active);
      commit((s) => ({ ...s, panes: s.panes.map(() => sym) }));
      if (active !== 0) onSelectSymbol?.(findInstrument(sym.source, sym.ticker) ?? adHocInstrument(sym.source, sym.ticker));
    }
    if (k === "interval" && !v) setSharedInterval(null);
  };

  const pick = (i: number) => (inst: TerminalInstrument) => {
    const sym: PaneSym = { source: inst.source, ticker: inst.dataTicker };
    if (i === 0) onSelectSymbol?.(inst);
    else commit((s) => ({ ...s, panes: s.panes.map((p, j) => (j === i - 1 ? sym : p)) }));
    if (state.sync.symbol) {
      commit((s) => ({ ...s, panes: s.panes.map(() => sym) }));
      if (i !== 0) onSelectSymbol?.(inst);
    }
  };

  const picker = (
    <MenuPopover
      title={t("cs.ml.title")}
      className="tv3-press min-h-[31px] min-w-[44px] px-3 py-[5px] inline-flex items-center justify-center rounded-[11px] bg-[var(--tv3-fill)] text-[13.5px] font-semibold shrink-0 cursor-pointer text-[var(--tv3-text)] hover:brightness-95 dark:hover:brightness-125"
      width={250}
      align="right"
      trigger={<span className="inline-flex h-[20px] w-[20px] items-center justify-center"><span className="scale-[0.77] inline-flex shrink-0">{LAYOUT_ICONS[state.layout]}</span></span>}
    >
      {() => (
        <div className="px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)] mb-1.5">{t("cs.ml.layout")}</div>
          <div className="flex gap-1">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLayout(l.id)}
                title={t(l.key)}
                aria-pressed={state.layout === l.id}
                className={`w-10 h-10 inline-flex items-center justify-center rounded-[10px] cursor-pointer ${
                  state.layout === l.id ? "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]" : "text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)]"
                }`}
              >
                {LAYOUT_ICONS[l.id]}
              </button>
            ))}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)] mt-3 mb-1">{t("cs.ml.sync")}</div>
          {(
            [
              ["symbol", "cs.ml.syncSymbol"],
              ["interval", "cs.ml.syncInterval"],
              ["crosshair", "cs.ml.syncCrosshair"],
              ["range", "cs.ml.syncRange"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={`flex items-center gap-2 h-8 text-[13px] text-[var(--tv3-text)] ${count > 1 ? "cursor-pointer" : "opacity-50"}`}>
              <input type="checkbox" checked={state.sync[k]} onChange={(e) => setSyncFlag(k, e.target.checked)} className="w-4 h-4 accent-[var(--tv3-accent)]" />
              {t(label)}
            </label>
          ))}
        </div>
      )}
    </MenuPopover>
  );

  const gridCls = appPage ? GRID["1"] : GRID[state.layout];
  const cellCls = (i: number) => `relative min-w-0 min-h-0 flex flex-col overflow-hidden ${count === 3 && i === 0 ? "row-span-2" : ""} ${count > 1 ? "rounded-2xl" : ""} ${count > 1 && active === i ? "outline outline-2 -outline-offset-2 outline-[var(--tv3-accent)]/60" : ""}`;

  return (
    <div className={`grid w-full h-full min-h-0 ${count > 1 ? "gap-2 p-2 bg-[var(--tv3-canvas)]" : ""} ${gridCls}`}>
      {Array.from({ length: count }, (_, i) => {
        const sym = symOf(i);
        const inst = findInstrument(sym.source, sym.ticker) ?? adHocInstrument(sym.source, sym.ticker);
        return (
          <div key={i} className={cellCls(i)} onPointerDownCapture={() => setActive(i)}>
            <TradingChart
              ticker={sym.ticker}
              source={sym.source}
              name={i === 0 ? name : instName(inst, t)}
              onSelectSymbol={pick(i)}
              embedded={i > 0}
              compact={count > 1 && i === 0}
              storageId={i > 0 ? `p${i}` : undefined}
              active={count === 1 || active === i}
              toolbarExtra={i === 0 ? picker : undefined}
              hub={count > 1 ? hub : undefined}
              syncInterval={count > 1 && state.sync.interval ? sharedInterval : null}
              onIntervalChange={(id) => {
                if (count > 1 && state.sync.interval) setSharedInterval(id);
              }}
              appPage={appPage}
              appHandle={i === 0 ? appHandle : undefined}
              onAppState={i === 0 ? onAppState : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
