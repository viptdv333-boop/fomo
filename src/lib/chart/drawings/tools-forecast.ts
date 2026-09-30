import * as G from "./geometry";
import { buildProfileFromFlow } from "../orderflow/flowmath";
import { computeVwap } from "../orderflow/vwapcalc";
import {
  BLUE,
  GREEN,
  ORANGE,
  PURPLE,
  RED,
  TOL,
  UI_SHAPE,
  arrowHead,
  barPx,
  boxHandles,
  candleSlice,
  fillCur,
  fillPoly,
  fmtDuration,
  fmtPct,
  fmtSigned,
  guide,
  label,
  lowerBound,
  mkStyle,
  opt,
  optNum,
  paintCandle,
  pctOf,
  polyHit,
  prng,
  segHit,
  stroke,
  strokeSeg,
  tx,
  type Candle,
  type DPoint,
  type Drawing,
  type Env,
  type Pt,
  type ToolDef,
} from "./tools-kit";

/* Forecasting and volume tools: forecast, bars pattern, ghost feed, projection, anchored VWAP, volume profiles. */

/* ───────────── forecast ───────────── */

const forecast: ToolDef = {
  id: "forecast",
  labelKey: "draw.tool.forecast",
  points: 2,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.12 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const [a, b] = d.points;
    const up = b.p >= a.p;
    const col = up ? GREEN : RED;
    ctx.beginPath();
    ctx.rect(Math.min(P[0].x, P[1].x), Math.min(P[0].y, P[1].y), Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y));
    fillCur(ctx, d, col, 1);
    stroke(ctx, d, st);
    ctx.setLineDash([]);
    ctx.strokeStyle = d.style.color;
    strokeSeg(ctx, P[0], P[1]);
    if (G.dist(P[0], P[1]) > 10) arrowHead(ctx, P[0], P[1], 9 + d.style.width);
    ctx.beginPath();
    ctx.arc(P[0].x, P[0].y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = d.style.color;
    ctx.fill();
    const bars = Math.round(env.barsBetween(a.t, b.t));
    if (opt(d, "showLabels", true)) label(
      ctx,
      env,
      [`${tx("draw.txt.forecast")}: ${fmtSigned(env, b.p - a.p)} (${fmtPct(pctOf(a.p, b.p))})`, `${bars} ${tx("draw.txt.bars")}, ${fmtDuration(b.t - a.t, env.labels)}`],
      P[1].x + 8,
      P[1].y,
      { base: "middle", bg: col, fg: "#ffffff", clamp: false }
    );
  },
  hit(_env, _d, P, x, y) {
    return G.pointInRect({ x, y }, P[0], P[1]) || segHit(x, y, [P[0], P[1], "segment"]);
  },
  handles: (_env, _d, P) => boxHandles(P),
};

/* ───────────── bars pattern / ghost feed ───────────── */

function sourceBox(env: Env, d: { points: DPoint[] }) {
  const cs = candleSlice(env, d.points[0].t, d.points[1].t);
  if (cs.length === 0) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of cs) {
    hi = Math.max(hi, c.h);
    lo = Math.min(lo, c.l);
  }
  return { cs, hi, lo, x0: env.toX(cs[0].t), x1: env.toX(cs[cs.length - 1].t) };
}

/** Vertical mapping of the pasted bars: shifted copy, or mirrored around the anchor when "mirror" is on. */
function barsMapY(d: Drawing, P: Pt[]): (y: number) => number {
  const dy = P[2].y - P[0].y;
  return opt(d, "mirror", false) ? (y) => P[2].y - (y - P[0].y) : (y) => y + dy;
}

const barsPattern: ToolDef = {
  id: "bars_pattern",
  labelKey: "draw.tool.bars_pattern",
  points: 3,
  style: mkStyle(BLUE, 1, "dashed"),
  ui: { color: true, width: true, dash: true, fill: false, text: false },
  draw(ctx, env, d, P, st) {
    const src = sourceBox(env, d);
    if (!src) {
      guide(ctx, d);
      strokeSeg(ctx, P[0], P[2]);
      return;
    }
    const dx = P[2].x - P[0].x;
    const my = barsMapY(d, P);
    const yTop = env.toY(src.hi);
    const yBot = env.toY(src.lo);
    // source range
    stroke(ctx, d, st);
    ctx.strokeRect(src.x0 - 2, yTop - 2, src.x1 - src.x0 + 4, yBot - yTop + 4);
    // the copy
    const w = Math.max(2, barPx(env, src.cs[0].t) * 0.7);
    for (const c of src.cs) {
      const yh = my(env.toY(c.h));
      const yl = my(env.toY(c.l));
      paintCandle(ctx, env.toX(c.t) + dx, w, my(env.toY(c.o)), Math.min(yh, yl), Math.max(yh, yl), my(env.toY(c.c)), env.theme.up, env.theme.down, 0.9);
    }
    const c0 = my(yTop);
    const c1 = my(yBot);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = d.style.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(src.x0 - 2 + dx, Math.min(c0, c1) - 2, src.x1 - src.x0 + 4, Math.abs(c1 - c0) + 4);
    guide(ctx, d);
    strokeSeg(ctx, { x: src.x1, y: (yTop + yBot) / 2 }, { x: src.x0 + dx, y: (c0 + c1) / 2 });
  },
  hit(env, d, P, x, y) {
    const src = sourceBox(env, d);
    if (!src) return segHit(x, y, [P[0], P[2], "segment"]);
    const dx = P[2].x - P[0].x;
    const my = barsMapY(d, P);
    const yTop = env.toY(src.hi);
    const yBot = env.toY(src.lo);
    const c0 = my(yTop);
    const c1 = my(yBot);
    const inSrc = x >= src.x0 - 2 && x <= src.x1 + 2 && y >= yTop - 2 && y <= yBot + 2;
    const inCopy = x >= src.x0 + dx - 2 && x <= src.x1 + dx + 2 && y >= Math.min(c0, c1) - 2 && y <= Math.max(c0, c1) + 2;
    return inSrc || inCopy;
  },
};

function ghostCandles(src: Candle[], n: number, startPrice: number, seed: number): Candle[] {
  const rets: number[] = [];
  for (let i = 1; i < src.length; i++) if (src[i - 1].c > 0 && src[i].c > 0) rets.push(Math.log(src[i].c / src[i - 1].c));
  const m = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const v = rets.length ? rets.reduce((a, b) => a + (b - m) * (b - m), 0) / rets.length : 0.001;
  const s = Math.sqrt(v) || 0.001;
  const rnd = prng(seed);
  const gauss = () => {
    const u = Math.max(1e-9, rnd());
    const w = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  };
  const out: Candle[] = [];
  let prev = startPrice;
  for (let i = 0; i < n; i++) {
    const c = prev * Math.exp(m + s * gauss());
    const hi = Math.max(prev, c) * (1 + Math.abs(gauss()) * s * 0.5);
    const lo = Math.min(prev, c) * (1 - Math.abs(gauss()) * s * 0.5);
    out.push({ t: i, o: prev, h: hi, l: lo, c, v: 0 });
    prev = c;
  }
  return out;
}

const ghostFeed: ToolDef = {
  id: "ghost_feed",
  labelKey: "draw.tool.ghost_feed",
  points: 3,
  style: mkStyle(PURPLE, 1, "dashed"),
  ui: { color: true, width: true, dash: true, fill: false, text: false },
  draw(ctx, env, d, P, st) {
    const src = sourceBox(env, d);
    if (!src) {
      guide(ctx, d);
      strokeSeg(ctx, P[0], P[2]);
      return;
    }
    const yTop = env.toY(src.hi);
    const yBot = env.toY(src.lo);
    stroke(ctx, d, st);
    ctx.strokeRect(src.x0 - 2, yTop - 2, src.x1 - src.x0 + 4, yBot - yTop + 4);
    const n = Math.min(400, src.cs.length);
    const seed = Math.abs(Math.round(d.points[0].t / 1000) ^ Math.round(d.points[1].t / 1000)) + 17;
    const ghost = ghostCandles(src.cs, n, d.points[2].p, seed);
    const step = src.cs.length > 1 ? (src.x1 - src.x0) / (src.cs.length - 1) : barPx(env, src.cs[0].t);
    const w = Math.max(2, Math.abs(step) * 0.7);
    ghost.forEach((c, i) => {
      const x = P[2].x + i * step;
      paintCandle(ctx, x, w, env.toY(c.o), env.toY(c.h), env.toY(c.l), env.toY(c.c), env.theme.up, env.theme.down, 0.55);
    });
    guide(ctx, d);
    strokeSeg(ctx, { x: src.x1, y: (yTop + yBot) / 2 }, P[2]);
  },
  hit(env, d, P, x, y) {
    const src = sourceBox(env, d);
    if (!src) return segHit(x, y, [P[0], P[2], "segment"]);
    const yTop = env.toY(src.hi);
    const yBot = env.toY(src.lo);
    const step = src.cs.length > 1 ? (src.x1 - src.x0) / (src.cs.length - 1) : 6;
    const gx1 = P[2].x + Math.min(400, src.cs.length) * step;
    const inSrc = x >= src.x0 - 2 && x <= src.x1 + 2 && y >= yTop - 2 && y <= yBot + 2;
    const inGhost = x >= P[2].x - 2 && x <= gx1 + 2 && Math.abs(y - P[2].y) <= Math.max(30, (yBot - yTop) / 2 + 20);
    return inSrc || inGhost;
  },
};

/* ───────────── projection ───────────── */

const projection: ToolDef = {
  id: "projection",
  labelKey: "draw.tool.projection",
  points: 3,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const D: Pt = { x: P[2].x + (P[1].x - P[0].x), y: P[2].y + (P[1].y - P[0].y) };
    fillPoly(ctx, d, [P[0], P[1], D, P[2]]);
    stroke(ctx, d, st);
    strokeSeg(ctx, P[0], P[1]);
    strokeSeg(ctx, P[2], D);
    if (G.dist(P[2], D) > 10) arrowHead(ctx, P[2], D, 9 + d.style.width);
    guide(ctx, d);
    strokeSeg(ctx, P[1], P[2]);
    strokeSeg(ctx, P[0], P[2]);
    const a = d.points[0];
    const b = d.points[1];
    const c = d.points[2];
    const target = c.p + (b.p - a.p);
    if (opt(d, "showLabels", true)) label(ctx, env, [`${tx("draw.txt.projection")}: ${env.fmt(target)}`, `${fmtSigned(env, target - c.p)} (${fmtPct(pctOf(c.p, target))})`], D.x + 8, D.y, {
      base: "middle",
      bg: d.style.color,
      fg: "#ffffff",
      clamp: false,
    });
  },
  hit(_env, _d, P, x, y) {
    const D: Pt = { x: P[2].x + (P[1].x - P[0].x), y: P[2].y + (P[1].y - P[0].y) };
    return polyHit(x, y, [P[0], P[1], D, P[2]], true, true);
  },
};

/* ───────────── anchored VWAP ───────────── */

interface VwapPoint {
  x: number;
  y: number;
}

function vwapSeries(env: Env, t0: number): { pts: VwapPoint[]; last: number } | null {
  const all = env.candles?.();
  if (!all || all.length === 0) return null;
  const start = lowerBound(all, t0);
  if (start >= all.length) return null;
  // same maths as the Anchored VWAP indicator: from real trades when the chart has them
  const r = computeVwap(all, { anchor: { from: start }, source: "hlc3", useTrades: true, store: env.flow?.() });
  const pts: VwapPoint[] = [];
  let last = 0;
  for (let i = start; i < all.length; i++) {
    last = r.vwap[i];
    pts.push({ x: env.toX(all[i].t), y: env.toY(last) });
  }
  return { pts, last };
}

const anchoredVwap: ToolDef = {
  id: "anchored_vwap",
  labelKey: "draw.tool.anchored_vwap",
  points: 1,
  style: mkStyle(ORANGE, 2),
  ui: { color: true, width: true, dash: true, fill: false, text: false },
  complete(pts, env) {
    const all = env.candles?.();
    if (!all || all.length === 0) return pts;
    const i = Math.min(all.length - 1, lowerBound(all, pts[0].t));
    const c = all[i];
    return [{ t: pts[0].t, p: (c.h + c.l + c.c) / 3 }];
  },
  draw(ctx, env, d, P, st) {
    const s = vwapSeries(env, d.points[0].t);
    if (!s || s.pts.length === 0) {
      dotFallback(ctx, P[0], d.style.color);
      return;
    }
    stroke(ctx, d, st);
    ctx.beginPath();
    s.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    const lp = s.pts[s.pts.length - 1];
    dotFallback(ctx, s.pts[0], d.style.color);
    if (opt(d, "showLabels", true)) label(ctx, env, `${tx("draw.txt.vwap")} ${env.fmt(s.last)}`, lp.x + 6, lp.y, { base: "middle", bg: d.style.color, fg: "#ffffff", size: 10, clamp: false });
  },
  hit(env, d, P, x, y) {
    const s = vwapSeries(env, d.points[0].t);
    if (!s || s.pts.length === 0) return Math.hypot(x - P[0].x, y - P[0].y) <= TOL;
    return G.distToPolyline({ x, y }, s.pts) <= TOL;
  },
  handles(env, d, P) {
    const s = vwapSeries(env, d.points[0].t);
    return [
      {
        x: s && s.pts[0] ? s.pts[0].x : P[0].x,
        y: s && s.pts[0] ? s.pts[0].y : P[0].y,
        drag: (pts, t) => {
          pts[0].t = t;
        },
      },
    ];
  },
};

function dotFallback(ctx: CanvasRenderingContext2D, p: Pt, color: string) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/* ───────────── volume profile ───────────── */

const VP_ROWS = 30;

interface Profile {
  lo: number;
  step: number;
  up: number[];
  dn: number[];
  total: number[];
  max: number;
  poc: number;
  vaLo: number;
  vaHi: number;
  x0: number;
  x1: number;
  /** true = spread from candles (no trade data). */
  approx?: boolean;
}

export function buildProfile(cs: Candle[], rows = VP_ROWS, vaShare = 0.7): Omit<Profile, "x0" | "x1"> | null {
  if (cs.length === 0) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of cs) {
    hi = Math.max(hi, c.h);
    lo = Math.min(lo, c.l);
  }
  if (!(hi > lo)) hi = lo + Math.max(Math.abs(lo) * 1e-4, 1e-8);
  const step = (hi - lo) / rows;
  const up = new Array<number>(rows).fill(0);
  const dn = new Array<number>(rows).fill(0);
  for (const c of cs) {
    const v = c.v > 0 ? c.v : 0;
    if (v === 0) continue;
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor((c.l - lo) / step)));
    const r1 = Math.max(r0, Math.min(rows - 1, Math.floor((c.h - lo - 1e-12) / step)));
    const share = v / (r1 - r0 + 1);
    const arr = c.c >= c.o ? up : dn;
    for (let r = r0; r <= r1; r++) arr[r] += share;
  }
  const total = up.map((u, i) => u + dn[i]);
  let poc = 0;
  let max = 0;
  let sum = 0;
  total.forEach((v, i) => {
    sum += v;
    if (v > max) {
      max = v;
      poc = i;
    }
  });
  // value area: grow around the point of control until 70 % of the volume is inside
  let vaLo = poc;
  let vaHi = poc;
  let acc = total[poc];
  while (acc < sum * vaShare && (vaLo > 0 || vaHi < rows - 1)) {
    const below = vaLo > 0 ? total[vaLo - 1] : -1;
    const above = vaHi < rows - 1 ? total[vaHi + 1] : -1;
    if (above >= below) {
      vaHi += 1;
      acc += total[vaHi];
    } else {
      vaLo -= 1;
      acc += total[vaLo];
    }
  }
  return { lo, step, up, dn, total, max, poc, vaLo, vaHi };
}

function paintProfile(ctx: CanvasRenderingContext2D, env: Env, d: Parameters<ToolDef["draw"]>[2], pr: Profile, maxLen: number, st: Parameters<ToolDef["draw"]>[4]) {
  const upCol = d.style.color;
  const dnCol = d.style.fill ?? ORANGE;
  const rows = pr.total.length;
  for (let i = 0; i < rows; i++) {
    if (pr.total[i] <= 0) continue;
    const yTop = env.toY(pr.lo + (i + 1) * pr.step);
    const yBot = env.toY(pr.lo + i * pr.step);
    const h = Math.max(1, Math.abs(yBot - yTop) - 1);
    const y = Math.min(yTop, yBot);
    const len = (pr.total[i] / pr.max) * maxLen;
    const upLen = (pr.up[i] / pr.total[i]) * len;
    const inVa = i >= pr.vaLo && i <= pr.vaHi;
    ctx.save();
    ctx.globalAlpha = inVa ? 0.6 : 0.3;
    ctx.fillStyle = upCol;
    ctx.fillRect(pr.x0, y, upLen, h);
    ctx.fillStyle = dnCol;
    ctx.fillRect(pr.x0 + upLen, y, len - upLen, h);
    ctx.restore();
  }
  // point of control and value area edges
  const pocY = env.toY(pr.lo + (pr.poc + 0.5) * pr.step);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = RED;
  ctx.beginPath();
  ctx.moveTo(pr.x0, pocY);
  ctx.lineTo(pr.x1, pocY);
  ctx.stroke();
  ctx.strokeStyle = d.style.color;
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([4, 4]);
  const vahY = env.toY(pr.lo + (pr.vaHi + 1) * pr.step);
  const valY = env.toY(pr.lo + pr.vaLo * pr.step);
  ctx.beginPath();
  ctx.moveTo(pr.x0, vahY);
  ctx.lineTo(pr.x1, vahY);
  ctx.moveTo(pr.x0, valY);
  ctx.lineTo(pr.x1, valY);
  ctx.stroke();
  ctx.restore();
  if (pr.approx) label(ctx, env, "≈", pr.x0 + 6, env.toY(pr.lo + pr.total.length * pr.step) + 8, { base: "top", bg: "#f5a623", fg: "#ffffff", size: 10, clamp: false });
  const showLabels = opt(d, "showLabels", false) || st.selected || st.hover;
  if (showLabels) {
    label(ctx, env, `${tx("draw.txt.poc")} ${env.fmt(pr.lo + (pr.poc + 0.5) * pr.step)}`, pr.x1 - 4, pocY, { align: "right", base: "middle", bg: RED, fg: "#ffffff", size: 10, clamp: false });
    label(ctx, env, `${tx("draw.txt.vah")} ${env.fmt(pr.lo + (pr.vaHi + 1) * pr.step)}`, pr.x1 - 4, vahY, { align: "right", base: "bottom", bg: d.style.color, fg: "#ffffff", size: 10, clamp: false });
    label(ctx, env, `${tx("draw.txt.val")} ${env.fmt(pr.lo + pr.vaLo * pr.step)}`, pr.x1 - 4, valY, { align: "right", base: "top", bg: d.style.color, fg: "#ffffff", size: 10, clamp: false });
  }
}

function profileFor(env: Env, d: Drawing, tA: number, tB: number, toEnd: boolean): Profile | null {
  const all = env.candles?.();
  if (!all || all.length === 0) return null;
  const lo = Math.min(tA, tB);
  const hiT = toEnd ? all[all.length - 1].t : Math.max(tA, tB);
  const cs = candleSlice(env, lo, hiT);
  const rows = Math.round(optNum(d, "rows", VP_ROWS, 8, 120));
  const vaShare = optNum(d, "vaPct", 70, 10, 100) / 100;
  // real trades (buy / sell split, volume at the price it traded) when the chart has them, else the candle approximation
  const real = buildProfileFromFlow(cs, env.flow?.(), rows, vaShare);
  const pr = real ?? buildProfile(cs, rows, vaShare);
  if (!pr) return null;
  const x0 = env.toX(lo);
  const x1 = toEnd ? env.toX(all[all.length - 1].t) : env.toX(hiT);
  return { ...pr, x0, x1, approx: !real };
}

function profileTool(id: string, anchored: boolean): ToolDef {
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: anchored ? 1 : 2,
    style: mkStyle(BLUE, 1, "solid", { fill: ORANGE, fillOpacity: 0.12 }),
    ui: { color: true, width: false, dash: false, fill: true, text: false },
    draw(ctx, env, d, P, st) {
      const tB = anchored ? d.points[0].t : d.points[1].t;
      const pr = profileFor(env, d, d.points[0].t, tB, anchored);
      if (!pr) {
        guide(ctx, d);
        ctx.beginPath();
        ctx.moveTo(P[0].x, 0);
        ctx.lineTo(P[0].x, env.h);
        ctx.stroke();
        return;
      }
      const width = Math.max(50, Math.abs(pr.x1 - pr.x0) * (optNum(d, "widthPct", 70, 10, 100) / 100));
      // boundaries
      stroke(ctx, d, st, undefined, "dashed");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(pr.x0) + 0.5, 0);
      ctx.lineTo(Math.round(pr.x0) + 0.5, env.h);
      if (!anchored) {
        ctx.moveTo(Math.round(pr.x1) + 0.5, 0);
        ctx.lineTo(Math.round(pr.x1) + 0.5, env.h);
      }
      ctx.stroke();
      paintProfile(ctx, env, d, pr, anchored ? Math.max(60, Math.min(width, 260)) : width, st);
    },
    hit(env, d, P, x, y) {
      const tB = anchored ? d.points[0].t : d.points[1].t;
      const pr = profileFor(env, d, d.points[0].t, tB, anchored);
      if (!pr) return Math.abs(x - P[0].x) <= TOL;
      if (Math.abs(x - pr.x0) <= TOL) return true;
      if (!anchored && Math.abs(x - pr.x1) <= TOL) return true;
      const yTop = env.toY(pr.lo + pr.total.length * pr.step);
      const yBot = env.toY(pr.lo);
      const width = Math.max(50, Math.abs(pr.x1 - pr.x0) * (optNum(d, "widthPct", 70, 10, 100) / 100));
      const len = anchored ? Math.max(60, Math.min(width, 260)) : width;
      return x >= pr.x0 && x <= pr.x0 + len && y >= Math.min(yTop, yBot) && y <= Math.max(yTop, yBot);
    },
    handles(env, d, P) {
      const tB = anchored ? d.points[0].t : d.points[1].t;
      const pr = profileFor(env, d, d.points[0].t, tB, anchored);
      const ym = pr ? (env.toY(pr.lo) + env.toY(pr.lo + pr.total.length * pr.step)) / 2 : P[0].y;
      const hs = anchored ? [0] : [0, 1];
      return hs.map((i) => ({
        x: P[i].x,
        y: ym,
        drag: (pts: DPoint[], t: number) => {
          pts[i].t = t;
        },
      }));
    },
  };
}

export const FORECAST_TOOLS: ToolDef[] = [
  forecast,
  barsPattern,
  ghostFeed,
  projection,
  anchoredVwap,
  profileTool("fixed_volume_profile", false),
  profileTool("anchored_volume_profile", true),
];
