import type { Candle, SeriesContext } from "../types";
import type { Params } from "./registry";

/* Volume Profile of the visible range: volume per price row, split into up / down bars, with the point of control
   (POC) and the value area. Pure computation + a canvas painter; the registry only wires the parameters. */

export interface ProfileRow {
  lo: number;
  hi: number;
  up: number;
  down: number;
}

export interface Profile {
  rows: ProfileRow[];
  poc: number;
  /** Inclusive row indices of the value area. */
  vaLo: number;
  vaHi: number;
  max: number;
}

export function computeProfile(candles: Candle[], from: number, to: number, rowCount: number, vaPct: number): Profile | null {
  from = Math.max(0, from);
  to = Math.min(candles.length - 1, to);
  if (to < from) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    if (candles[i].h > hi) hi = candles[i].h;
    if (candles[i].l < lo) lo = candles[i].l;
  }
  if (!(hi > lo)) return null;
  const n = Math.max(2, Math.min(500, Math.floor(rowCount)));
  const step = (hi - lo) / n;
  const rows: ProfileRow[] = [];
  for (let k = 0; k < n; k++) rows.push({ lo: lo + k * step, hi: lo + (k + 1) * step, up: 0, down: 0 });
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (!(c.v > 0)) continue;
    const isUp = c.c >= c.o;
    const range = c.h - c.l;
    const a = Math.min(n - 1, Math.max(0, Math.floor((c.l - lo) / step)));
    const b = Math.min(n - 1, Math.max(0, Math.floor((c.h - lo) / step)));
    if (range <= 0 || a === b) {
      if (isUp) rows[a].up += c.v;
      else rows[a].down += c.v;
      continue;
    }
    for (let k = a; k <= b; k++) {
      const ov = Math.min(c.h, rows[k].hi) - Math.max(c.l, rows[k].lo);
      if (ov <= 0) continue;
      const part = (ov / range) * c.v;
      if (isUp) rows[k].up += part;
      else rows[k].down += part;
    }
  }
  let poc = 0;
  let max = 0;
  let total = 0;
  for (let k = 0; k < n; k++) {
    const t = rows[k].up + rows[k].down;
    total += t;
    if (t > max) {
      max = t;
      poc = k;
    }
  }
  if (max <= 0) return null;
  // value area: grow from the POC towards the heavier neighbour until vaPct of the volume is inside
  const need = (total * Math.min(100, Math.max(1, vaPct))) / 100;
  let vaLo = poc;
  let vaHi = poc;
  let acc = max;
  const at = (k: number) => (k >= 0 && k < n ? rows[k].up + rows[k].down : -1);
  while (acc < need && (vaLo > 0 || vaHi < n - 1)) {
    const below = at(vaLo - 1);
    const above = at(vaHi + 1);
    if (above >= below && above >= 0) {
      vaHi++;
      acc += above;
    } else if (below >= 0) {
      vaLo--;
      acc += below;
    } else break;
  }
  return { rows, poc, vaLo, vaHi, max };
}

function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

export function drawVolumeProfile(sc: SeriesContext, p: Params): void {
  const prof = computeProfile(sc.candles, sc.from, sc.to, Number(p.rows), Number(p.valueArea));
  if (!prof) return;
  const { ctx } = sc;
  const left = p.placement !== "right";
  const maxW = (sc.paneWidth * Number(p.widthPct)) / 100;
  const cUp = String(p.colorUp);
  const cDn = String(p.colorDown);
  const cPoc = String(p.colorPoc);
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
    const alpha = inVa ? 0.62 : 0.28;
    const wUp = (r.up / prof.max) * maxW;
    const wDn = (r.down / prof.max) * maxW;
    const x0 = left ? 0 : sc.paneWidth;
    const dir = left ? 1 : -1;
    if (wUp > 0.3) {
      ctx.fillStyle = rgba(cUp, alpha);
      ctx.fillRect(left ? x0 : x0 - wUp, top, wUp, h);
    }
    if (wDn > 0.3) {
      ctx.fillStyle = rgba(cDn, alpha);
      ctx.fillRect(left ? x0 + dir * wUp : x0 - wUp - wDn, top, wDn, h);
    }
  }
  const pocRow = prof.rows[prof.poc];
  const yPoc = Math.round(sc.y((pocRow.lo + pocRow.hi) / 2)) + 0.5;
  ctx.strokeStyle = cPoc;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, yPoc);
  ctx.lineTo(sc.paneWidth, yPoc);
  ctx.stroke();
  if (p.showVaLines === true) {
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = rgba(cPoc, 0.75);
    for (const price of [prof.rows[prof.vaHi].hi, prof.rows[prof.vaLo].lo]) {
      const y = Math.round(sc.y(price)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(sc.paneWidth, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}
