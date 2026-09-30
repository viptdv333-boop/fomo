import type { Candle, SeriesContext } from "../types";
import type { OrderFlowStore } from "./store";
import { buildVProfile, sessionKey, type VProfile } from "./flowmath";
import { flowLabels } from "./footprint";

/* Canvas painters of volume profiles: the visible range profile (VPVR), one profile per session, developing POC and naked
   POCs. Pure drawing + a small cache; the indicator definitions only wire parameters. */

export function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

export interface VpStyle {
  colorUp: string;
  colorDown: string;
  colorPoc: string;
  split: boolean;
  showPoc: boolean;
  showVaLines: boolean;
  /** "full": POC / VA lines run across the whole pane; "profile": only over the profile. */
  extend: "full" | "profile" | "right";
  labels: boolean;
}

export interface VpGeom {
  /** x of the side the histogram grows from. */
  x0: number;
  dir: 1 | -1;
  maxW: number;
  /** Line span (for "profile" extension). */
  lineFrom: number;
  lineTo: number;
}

/** Paints one profile. Returns nothing; the caller decides where it goes. */
export function paintProfile(sc: SeriesContext, prof: VProfile, st: VpStyle, g: VpGeom, alphaBase = 1): void {
  const { ctx } = sc;
  ctx.save();
  ctx.setLineDash([]);
  for (let k = 0; k < prof.rows.length; k++) {
    const r = prof.rows[k];
    const yTop = sc.y(r.hi);
    const yBot = sc.y(r.lo);
    const h = Math.max(1, Math.abs(yBot - yTop) - 1);
    const top = Math.min(yTop, yBot) + 0.5;
    if (top > sc.paneHeight || top + h < 0) continue;
    const inVa = k >= prof.vaLo && k <= prof.vaHi;
    const alpha = (inVa ? 0.62 : 0.28) * alphaBase;
    const tot = r.up + r.down;
    if (tot <= 0) continue;
    if (st.split) {
      const wUp = (r.up / prof.max) * g.maxW;
      const wDn = (r.down / prof.max) * g.maxW;
      if (wUp > 0.3) {
        ctx.fillStyle = rgba(st.colorUp, alpha);
        ctx.fillRect(g.dir === 1 ? g.x0 : g.x0 - wUp, top, wUp, h);
      }
      if (wDn > 0.3) {
        ctx.fillStyle = rgba(st.colorDown, alpha);
        ctx.fillRect(g.dir === 1 ? g.x0 + wUp : g.x0 - wUp - wDn, top, wDn, h);
      }
    } else {
      const w = (tot / prof.max) * g.maxW;
      if (w > 0.3) {
        ctx.fillStyle = rgba(st.colorUp, alpha);
        ctx.fillRect(g.dir === 1 ? g.x0 : g.x0 - w, top, w, h);
      }
    }
  }
  const x1 = st.extend === "full" ? 0 : g.lineFrom;
  const x2 = st.extend === "full" ? sc.paneWidth : st.extend === "right" ? sc.paneWidth : g.lineTo;
  if (st.showPoc) {
    const pocRow = prof.rows[prof.poc];
    const yPoc = Math.round(sc.y((pocRow.lo + pocRow.hi) / 2)) + 0.5;
    ctx.strokeStyle = st.colorPoc;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, yPoc);
    ctx.lineTo(x2, yPoc);
    ctx.stroke();
    if (st.labels) label(ctx, `POC ${fmtP(sc, (pocRow.lo + pocRow.hi) / 2)}`, x2 - 4, yPoc, st.colorPoc, "right", "bottom");
  }
  if (st.showVaLines) {
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = rgba(st.colorPoc, 0.75);
    const hiP = prof.rows[prof.vaHi].hi;
    const loP = prof.rows[prof.vaLo].lo;
    for (const price of [hiP, loP]) {
      const y = Math.round(sc.y(price)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (st.labels) {
      label(ctx, `VAH ${fmtP(sc, hiP)}`, x2 - 4, sc.y(hiP), st.colorPoc, "right", "bottom");
      label(ctx, `VAL ${fmtP(sc, loP)}`, x2 - 4, sc.y(loP), st.colorPoc, "right", "top");
    }
  }
  ctx.restore();
}

function fmtP(sc: SeriesContext, v: number): string {
  const dec = Math.abs(v) >= 1000 ? 1 : Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 3 : 6;
  return v.toLocaleString(sc.options.locale, { maximumFractionDigits: dec, minimumFractionDigits: 0 });
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign, base: CanvasTextBaseline) {
  ctx.save();
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillStyle = color;
  ctx.fillText(text, x, base === "bottom" ? y - 2 : y + 2);
  ctx.restore();
}

/** Small note on the chart when part of the profile is an estimate. */
export function paintApproxNote(sc: SeriesContext, real: number, approx: number, x: number, y: number, align: CanvasTextAlign = "left"): void {
  if (approx <= 0) return;
  const L = flowLabels(sc.options.locale);
  const text = sc.flow?.delayed && sc.flow.size > 0 ? L.delayed : real === 0 ? L.approx : L.partial;
  const { ctx } = sc;
  ctx.save();
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#f5a623";
  ctx.fillText(text, x, sc.paneHeight - 4);
  ctx.restore();
}

/* ───────────── developing POC ───────────── */

/** POC of the range [from, i] for every i, on the rows of `prof`. Returns the row midpoints as prices. */
export function developingPoc(candles: Candle[], from: number, to: number, prof: VProfile, store: OrderFlowStore | null | undefined, useFlow: boolean): Float64Array {
  const rows = prof.rows;
  const n = rows.length;
  const acc = new Float64Array(n);
  const out = new Float64Array(to - from + 1).fill(NaN);
  const lo = rows[0].lo;
  const step = rows[0].hi - rows[0].lo;
  const at = (p: number) => Math.min(n - 1, Math.max(0, Math.floor((p - lo) / step)));
  let poc = -1;
  let best = 0;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    const real = useFlow ? store?.real(c.t) : null;
    if (real && real.lv.length) {
      const cell = store!.tick > 0 ? store!.tick : 0;
      for (let k = 0; k < real.lv.length; k += 3) {
        const r = at(real.lv[k] + cell / 2);
        acc[r] += real.lv[k + 1] + real.lv[k + 2];
        if (acc[r] > best) {
          best = acc[r];
          poc = r;
        }
      }
    } else if (c.v > 0) {
      const a = at(c.l);
      const b = at(c.h);
      const share = c.v / (b - a + 1);
      for (let r = a; r <= b; r++) {
        acc[r] += share;
        if (acc[r] > best) {
          best = acc[r];
          poc = r;
        }
      }
    }
    if (poc >= 0) out[i - from] = (rows[poc].lo + rows[poc].hi) / 2;
  }
  return out;
}

export function paintDevelopingPoc(sc: SeriesContext, values: Float64Array, from: number, color: string): void {
  const { ctx } = sc;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  let prevY = NaN;
  let started = false;
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (!isFinite(v)) continue;
    const x = sc.x(from + k);
    const y = sc.y(v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, prevY);
      ctx.lineTo(x, y);
    }
    prevY = y;
  }
  ctx.stroke();
  ctx.restore();
}

/* ───────────── sessions ───────────── */

export interface Session {
  key: number;
  from: number;
  to: number;
}

export function splitSessions(candles: Candle[], wallShift: number, period: "day" | "week" | "month", visFrom: number, visTo: number): Session[] {
  const n = candles.length;
  if (n === 0) return [];
  const out: Session[] = [];
  // walk back from the first visible bar to the start of its session
  let s = Math.max(0, Math.min(n - 1, visFrom));
  const k0 = sessionKey(candles[s].t, wallShift, period);
  while (s > 0 && sessionKey(candles[s - 1].t, wallShift, period) === k0) s--;
  let i = s;
  while (i < n && i <= visTo) {
    const k = sessionKey(candles[i].t, wallShift, period);
    let j = i;
    while (j + 1 < n && sessionKey(candles[j + 1].t, wallShift, period) === k) j++;
    out.push({ key: k, from: i, to: j });
    i = j + 1;
  }
  return out;
}

interface CachedProfile {
  sig: string;
  prof: VProfile | null;
}
const sessionCache = new Map<string, CachedProfile>();

export function sessionProfile(
  candles: Candle[],
  ses: Session,
  store: OrderFlowStore | null | undefined,
  o: { rows: number; rowSize: number; valueArea: number; useFlow: boolean },
  sigExtra: string,
): VProfile | null {
  const last = candles[ses.to];
  const sig = `${sigExtra}|${candles.length}|${last.t}|${last.c}|${last.v}|${store?.version ?? 0}|${ses.from}|${ses.to}|${o.rows}|${o.rowSize}|${o.valueArea}|${o.useFlow}`;
  const key = `${sigExtra}:${ses.key}`;
  const hit = sessionCache.get(key);
  if (hit && hit.sig === sig) return hit.prof;
  const prof = buildVProfile(candles, ses.from, ses.to, store, { rows: o.rows, rowSize: o.rowSize, valueArea: o.valueArea, useFlow: o.useFlow });
  if (sessionCache.size > 400) sessionCache.clear();
  sessionCache.set(key, { sig, prof });
  return prof;
}
