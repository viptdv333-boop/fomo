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
    const idx = Math.max(1, Math.min(n - 2, Math.round(e.xToIndex(clientX - rect.left - e.getPlotOffsetX()))));
    return { idx, x: e.indexToX(idx) + e.getPlotOffsetX() };
  };

  // design v3: dark pill "Симулятор · осталось N | Пуск | Шаг | Выход"
  const pill = "cursor-pointer px-2.5 py-1 rounded-full bg-white/[.14] hover:bg-white/25 font-semibold text-white disabled:opacity-40 disabled:cursor-default disabled:hover:bg-white/[.14]";

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
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 max-w-[90%] px-3.5 py-[7px] rounded-full bg-[var(--tv3-pill-dark)] text-white text-[13px] shadow-lg flex items-center gap-2">
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

  const nextSpeed = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(api.speed) + 1) % REPLAY_SPEEDS.length] ?? 1;
  return (
    <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full bg-[var(--tv3-pill-dark)] px-2 py-[5px] text-[13px] text-white max-w-[96%] shadow-[0_2px_12px_rgba(0,0,0,.25)]">
      {/* the label doubles as the speed control (click = next speed); the speed shows only when it is not 1x, so the pill reads like the design */}
      <button
        type="button"
        onClick={() => api.setSpeed(nextSpeed)}
        title={t("v3.sim.speed", { s: api.speed })}
        aria-label={t("shell.replay.speed")}
        className="hidden sm:inline cursor-pointer px-2 whitespace-nowrap text-[#c7c7cc] tabular-nums"
      >
        {api.atEnd ? t("v3.sim.end") : t("v3.sim", { n: Math.max(0, api.total - api.pos) })}
        {api.speed !== 1 && <span className="ml-1 text-white">{api.speed}x</span>}
      </button>
      <button onClick={api.togglePlay} disabled={api.atEnd} title={api.playing ? t("shell.replay.pause") : t("shell.replay.play")} className={pill}>
        {api.playing ? t("v3.sim.pause") : t("v3.sim.play")}
      </button>
      <button onClick={api.step} disabled={api.atEnd} title={t("shell.replay.step")} className={pill}>
        {t("v3.sim.step")}
      </button>
      <button onClick={() => api.setSpeed(nextSpeed)} title={t("v3.sim.speed", { s: api.speed })} aria-label={t("shell.replay.speed")} className={`${pill} tabular-nums sm:hidden`}>
        {api.speed}x
      </button>
      <button onClick={() => api.exit(true)} title={t("shell.replay.exit")} className={pill}>
        {t("v3.sim.exit")}
      </button>
    </div>
  );
}
