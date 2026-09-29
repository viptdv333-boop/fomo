"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ChartEngine } from "@/lib/chart/engine";
import type { Candle } from "@/lib/chart/types";
import { useT } from "@/lib/i18n/client";

/* Bar replay ("market simulator"): the engine is given a truncated copy of the loaded candles and the rest is
   fed back one bar at a time. Self-contained: nothing outside the shell knows how it works. */

export type ReplayMode = "off" | "pick" | "active";

export const REPLAY_SPEEDS = [1, 2, 5, 10];
const BASE_MS = 800;

export interface ReplayApi {
  mode: ReplayMode;
  playing: boolean;
  speed: number;
  /** Number of bars currently shown / bars available. */
  pos: number;
  total: number;
  atEnd: boolean;
  start(): void;
  cancelPick(): void;
  pickIndex(i: number): void;
  togglePlay(): void;
  step(): void;
  setSpeed(s: number): void;
  /** restore = put the full candle array back. Pass false when the data is about to be replaced anyway. */
  exit(restore?: boolean): void;
}

export function useReplay(getEngine: () => ChartEngine | null, onChanged: () => void): ReplayApi {
  const [mode, setMode] = useState<ReplayMode>("off");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [pos, setPos] = useState(0);
  const [total, setTotal] = useState(0);
  const fullRef = useRef<Candle[]>([]);
  const idxRef = useRef(0);
  const modeRef = useRef<ReplayMode>("off");
  modeRef.current = mode;
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  const start = useCallback(() => {
    const e = getEngine();
    if (!e || e.getCandles().length < 3) return;
    setMode("pick");
  }, [getEngine]);

  const cancelPick = useCallback(() => setMode((m) => (m === "pick" ? "off" : m)), []);

  const pickIndex = useCallback(
    (i: number) => {
      const e = getEngine();
      if (!e) return;
      const full = e.getCandles().slice();
      if (full.length < 3) return;
      const idx = Math.max(1, Math.min(full.length - 2, Math.round(i)));
      fullRef.current = full;
      idxRef.current = idx;
      e.setData(full.slice(0, idx + 1));
      changedRef.current();
      setPos(idx + 1);
      setTotal(full.length);
      setPlaying(false);
      setMode("active");
    },
    [getEngine]
  );

  const step = useCallback(() => {
    const e = getEngine();
    const full = fullRef.current;
    if (!e || idxRef.current + 1 >= full.length) {
      setPlaying(false);
      return;
    }
    idxRef.current += 1;
    e.upsertCandle(full[idxRef.current]);
    changedRef.current();
    setPos(idxRef.current + 1);
    if (idxRef.current + 1 >= full.length) setPlaying(false);
  }, [getEngine]);

  const togglePlay = useCallback(() => {
    if (idxRef.current + 1 >= fullRef.current.length) return;
    setPlaying((p) => !p);
  }, []);

  const exit = useCallback(
    (restore = true) => {
      setPlaying(false);
      if (modeRef.current === "active" && restore) {
        const e = getEngine();
        if (e && fullRef.current.length) {
          e.setData(fullRef.current);
          changedRef.current();
        }
      }
      modeRef.current = "off";
      setMode("off");
      fullRef.current = [];
    },
    [getEngine]
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(step, BASE_MS / speed);
    return () => clearInterval(id);
  }, [playing, speed, step]);

  return {
    mode,
    playing,
    speed,
    pos,
    total,
    atEnd: mode === "active" && pos >= total,
    start,
    cancelPick,
    pickIndex,
    togglePlay,
    step,
    setSpeed: setSpeedState,
    exit,
  };
}

/* ───────────── UI ───────────── */

const ic = "w-4 h-4";

export default function ReplayControls({ api, hostRef, getEngine }: { api: ReplayApi; hostRef: RefObject<HTMLDivElement | null>; getEngine: () => ChartEngine | null }) {
  const { t } = useT();
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    if (api.mode !== "pick") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") api.cancelPick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  if (api.mode === "off") return null;

  const locate = (clientX: number) => {
    const e = getEngine();
    const host = hostRef.current;
    if (!e || !host) return null;
    const rect = host.getBoundingClientRect();
    const n = e.getCandles().length;
    const idx = Math.max(1, Math.min(n - 2, Math.round(e.xToIndex(clientX - rect.left))));
    return { idx, x: e.indexToX(idx) };
  };

  const btn = "w-8 h-8 flex items-center justify-center rounded cursor-pointer text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-default";

  if (api.mode === "pick") {
    return (
      <div
        className="absolute inset-0 z-20 cursor-crosshair"
        onPointerMove={(ev) => {
          const p = locate(ev.clientX);
          if (p) {
            setHoverX(p.x);
          }
        }}
        onPointerLeave={() => setHoverX(null)}
        onClick={(ev) => {
          const p = locate(ev.clientX);
          if (p) api.pickIndex(p.idx);
        }}
      >
        {hoverX !== null && <div className="absolute top-0 bottom-0 w-px bg-green-600/80 pointer-events-none" style={{ left: hoverX }} />}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[90%] px-3 py-1.5 rounded-md bg-gray-900/90 text-white text-xs shadow-lg flex items-center gap-2">
          <span>{t("shell.replay.pick")}</span>
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              api.cancelPick();
            }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/15 cursor-pointer"
            title={t("shell.close")}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 px-1.5 h-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg max-w-[96%]">
      <button onClick={api.togglePlay} disabled={api.atEnd} title={api.playing ? t("shell.replay.pause") : t("shell.replay.play")} className={btn}>
        {api.playing ? (
          <svg viewBox="0 0 24 24" className={ic} fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className={ic} fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>
      <button onClick={api.step} disabled={api.atEnd} title={t("shell.replay.step")} className={btn}>
        <svg viewBox="0 0 24 24" className={ic} fill="currentColor">
          <path d="M6 6l9 6-9 6zM17 6h2v12h-2z" />
        </svg>
      </button>
      <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
      <div className="flex items-center" title={t("shell.replay.speed")}>
        {REPLAY_SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => api.setSpeed(s)}
            className={`h-7 px-1.5 rounded text-[11px] font-medium cursor-pointer ${
              api.speed === s ? "bg-green-600/10 text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
      <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
      <span className="hidden sm:inline text-[11px] text-gray-500 dark:text-gray-400 tabular-nums px-1 whitespace-nowrap">
        {api.atEnd ? t("shell.replay.end") : t("shell.replay.bars", { i: api.pos, n: api.total })}
      </span>
      <button onClick={() => api.exit(true)} title={t("shell.replay.exit")} className={btn}>
        <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
