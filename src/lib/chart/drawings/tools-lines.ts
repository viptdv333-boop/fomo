import * as G from "./geometry";
import { paintLineText } from "./render";
import {
  BLUE,
  PURPLE,
  TEAL,
  UI_LINE,
  UI_SHAPE,
  candleSlice,
  dot,
  fillPoly,
  guide,
  label,
  opt,
  optNum,
  lerpPt,
  mkStyle,
  polyHit,
  segHit,
  tx,
  strokeMode,
  strokePoly,
  strokeSeg,
  stroke,
  type DPoint,
  type Drawing,
  type Env,
  type Pt,
  type ToolDef,
} from "./tools-kit";

const LINE_TEXT = { size: 12, valign: "top", align: "center" } as const;
const UI_LINE_TEXT = { color: true, width: true, dash: true, fill: false, text: true } as const;
const UI_SHAPE_TEXT = { color: true, width: true, dash: true, fill: true, text: true } as const;

/* Trend line tools: trend angle, disjoint channel, flat top/bottom, regression trend, pitchfork variants, pitchfan. */

const trendAngle: ToolDef = {
  id: "trend_angle",
  labelKey: "draw.tool.trend_angle",
  points: 2,
  style: mkStyle(BLUE, 2),
  ui: UI_LINE_TEXT,
  draw(ctx, env, d, P, st) {
    const [a, b] = P;
    stroke(ctx, d, st);
    strokeSeg(ctx, a, b);
    // horizontal reference to the right and the angle arc
    guide(ctx, d);
    strokeSeg(ctx, a, { x: a.x + Math.max(60, Math.abs(b.x - a.x)), y: a.y });
    const len = G.dist(a, b);
    if (len < 6) return;
    const ang = Math.atan2(b.y - a.y, b.x - a.x); // canvas angle, y grows downwards
    const r = Math.min(34, len * 0.5);
    ctx.setLineDash([]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, ang, ang < 0);
    ctx.stroke();
    paintLineText(ctx, env, d, LINE_TEXT, a, b);
    if (!opt(d, "showAngle", true)) return;
    const deg = (-ang * 180) / Math.PI; // counter-clockwise, up = positive
    const mid = ang / 2;
    label(ctx, env, `${Math.round(deg * 10) / 10}°`, a.x + Math.cos(mid) * (r + 6), a.y + Math.sin(mid) * (r + 6), {
      align: "left",
      base: "middle",
      bg: d.style.color,
      fg: "#ffffff",
      clamp: false,
    });
  },
  hit: (_env, _d, P, x, y) => segHit(x, y, [P[0], P[1], "segment"]),
};

function disjointGeom(P: Pt[]) {
  const dx = P[1].x - P[0].x;
  const dy = P[1].y - P[0].y;
  return { c: P[2], d: { x: P[2].x + dx, y: P[2].y + dy } };
}

const disjointChannel: ToolDef = {
  id: "disjoint_channel",
  labelKey: "draw.tool.disjoint_channel",
  points: 3,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.1 }),
  ui: UI_SHAPE_TEXT,
  draw(ctx, env, d, P, st) {
    const { c, d: e } = disjointGeom(P);
    fillPoly(ctx, d, [P[0], P[1], e, c]);
    stroke(ctx, d, st);
    strokeSeg(ctx, P[0], P[1]);
    strokeSeg(ctx, c, e);
    guide(ctx, d);
    ctx.globalAlpha = 0.6;
    strokeSeg(ctx, P[0], c);
    strokeSeg(ctx, P[1], e);
    ctx.globalAlpha = 1;
    paintLineText(ctx, env, d, LINE_TEXT, P[0], P[1]);
  },
  hit(_env, _d, P, x, y) {
    const { c, d: e } = disjointGeom(P);
    return segHit(x, y, [P[0], P[1], "segment"], [c, e, "segment"]) || G.pointInPolygon({ x, y }, [P[0], P[1], e, c]);
  },
};

const flatTopBottom: ToolDef = {
  id: "flat_top_bottom",
  labelKey: "draw.tool.flat_top_bottom",
  points: 3,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.1 }),
  ui: UI_SHAPE_TEXT,
  draw(ctx, env, d, P, st) {
    const flat0 = { x: P[0].x, y: P[2].y };
    const flat1 = { x: P[1].x, y: P[2].y };
    fillPoly(ctx, d, [P[0], P[1], flat1, flat0]);
    stroke(ctx, d, st);
    strokeSeg(ctx, P[0], P[1]);
    strokeSeg(ctx, flat0, flat1);
    guide(ctx, d);
    ctx.globalAlpha = 0.6;
    strokeSeg(ctx, P[0], flat0);
    strokeSeg(ctx, P[1], flat1);
    ctx.globalAlpha = 1;
    paintLineText(ctx, env, d, LINE_TEXT, P[0], P[1]);
  },
  hit(_env, _d, P, x, y) {
    const flat0 = { x: P[0].x, y: P[2].y };
    const flat1 = { x: P[1].x, y: P[2].y };
    return segHit(x, y, [P[0], P[1], "segment"], [flat0, flat1, "segment"]) || G.pointInPolygon({ x, y }, [P[0], P[1], flat1, flat0]);
  },
};

/* ───────────── regression trend ───────────── */

interface Regr {
  x0: number;
  x1: number;
  yMid0: number;
  yMid1: number;
  spread: number;
  r: number;
  n: number;
}

/** Least-squares line through the closes between the two anchor times. Returns prices at the first and last candle. */
export function regression(env: Env, t1: number, t2: number): { p0: number; p1: number; sd: number; r: number; n: number; tFirst: number; tLast: number } | null {
  const cs = candleSlice(env, t1, t2);
  const n = cs.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const y = cs[i].c;
    sx += i;
    sy += y;
    sxx += i * i;
    sxy += i * y;
    syy += y * y;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / den;
  const icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const e = cs[i].c - (icpt + slope * i);
    ss += e * e;
  }
  const sd = Math.sqrt(ss / n);
  const varY = syy / n - (sy / n) * (sy / n);
  const varX = sxx / n - (sx / n) * (sx / n);
  const cov = sxy / n - (sx / n) * (sy / n);
  const r = varX > 0 && varY > 0 ? cov / Math.sqrt(varX * varY) : 0;
  return { p0: icpt, p1: icpt + slope * (n - 1), sd, r, n, tFirst: cs[0].t, tLast: cs[n - 1].t };
}

interface RegrView extends Regr {
  /** Visible extent of the lines (extended when "extend left / right" is on). */
  xa: number;
  xb: number;
  ya: number;
  yb: number;
}

function regrGeom(env: Env, d: Drawing): RegrView | null {
  const g = regression(env, d.points[0].t, d.points[1].t);
  if (!g) return null;
  const dev = optNum(d, "deviation", 2, 0.1, 10);
  const x0 = env.toX(g.tFirst);
  const x1 = env.toX(g.tLast);
  const y0 = env.toY(g.p0);
  const y1 = env.toY(g.p1);
  const slope = Math.abs(x1 - x0) > 1e-6 ? (y1 - y0) / (x1 - x0) : 0;
  const xa = opt(d, "extendLeft", false) ? -4 : x0;
  const xb = opt(d, "extendRight", false) ? env.w + 4 : x1;
  return {
    x0,
    x1,
    yMid0: y0,
    yMid1: y1,
    spread: Math.abs(env.toY(g.p0 + dev * g.sd) - env.toY(g.p0)),
    r: g.r,
    n: g.n,
    xa: Math.min(xa, x0),
    xb: Math.max(xb, x1),
    ya: y0 + slope * (Math.min(xa, x0) - x0),
    yb: y0 + slope * (Math.max(xb, x1) - x0),
  };
}

function regrBand(g: RegrView): Pt[] {
  return [
    { x: g.xa, y: g.ya - g.spread },
    { x: g.xb, y: g.yb - g.spread },
    { x: g.xb, y: g.yb + g.spread },
    { x: g.xa, y: g.ya + g.spread },
  ];
}

const regressionTrend: ToolDef = {
  id: "regression",
  labelKey: "draw.tool.regression",
  points: 2,
  style: mkStyle(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  complete(pts, env) {
    const g = regression(env, pts[0].t, pts[1].t);
    if (!g) return pts;
    const [a, b] = pts[0].t <= pts[1].t ? [pts[0], pts[1]] : [pts[1], pts[0]];
    return [
      { t: a.t, p: g.p0 },
      { t: b.t, p: g.p1 },
    ];
  },
  draw(ctx, env, d, _P, st) {
    const g = regrGeom(env, d);
    if (!g) {
      const A = { x: env.toX(d.points[0].t), y: env.toY(d.points[0].p) };
      const B = { x: env.toX(d.points[1].t), y: env.toY(d.points[1].p) };
      guide(ctx, d);
      strokeSeg(ctx, A, B);
      return;
    }
    const band = regrBand(g);
    fillPoly(ctx, d, band);
    stroke(ctx, d, st, undefined, "solid");
    strokeSeg(ctx, band[0], band[1]);
    strokeSeg(ctx, band[3], band[2]);
    if (opt(d, "showMid", true)) {
      stroke(ctx, d, st, undefined, "dashed");
      strokeSeg(ctx, { x: g.xa, y: g.ya }, { x: g.xb, y: g.yb });
    }
    ctx.setLineDash([]);
    if (opt(d, "showLabels", true)) {
      label(ctx, env, `${tx("draw.txt.regression")} R=${g.r.toFixed(2)}`, g.xb + 4, g.yb, { base: "middle", bg: d.style.color, fg: "#ffffff", size: 10, clamp: false });
    }
  },
  hit(env, d, _P, x, y) {
    const g = regrGeom(env, d);
    return !!g && polyHit(x, y, regrBand(g), true, true);
  },
  handles(env, d, P) {
    const g = regrGeom(env, d);
    return [0, 1].map((i) => ({
      x: g ? (i === 0 ? g.x0 : g.x1) : P[i].x,
      y: g ? (i === 0 ? g.yMid0 : g.yMid1) : P[i].y,
      drag: (pts: DPoint[], t: number) => {
        pts[i].t = t;
      },
    }));
  },
};

/* ───────────── pitchfork family ───────────── */

type ForkKind = "schiff" | "mschiff" | "inside";

function forkOrigin(P: Pt[], kind: ForkKind): Pt {
  if (kind === "schiff") return { x: P[0].x, y: (P[0].y + P[1].y) / 2 };
  if (kind === "mschiff") return G.mid(P[0], P[1]);
  return P[0];
}

function forkTool(id: string, kind: ForkKind, color: string): ToolDef {
  const geom = (P: Pt[]) => {
    const o = forkOrigin(P, kind);
    const m = G.mid(P[1], P[2]);
    const dx = m.x - o.x;
    const dy = m.y - o.y;
    if (Math.hypot(dx, dy) < 1e-6) return null;
    return { o, m, dir: { x: dx, y: dy } };
  };
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 3,
    style: mkStyle(color, 1, "solid", { fill: color, fillOpacity: 0.08 }),
    ui: UI_SHAPE,
    draw(ctx, env, d, P, st) {
      const g = geom(P);
      if (!g) return;
      const { o, m, dir } = g;
      const reach = (env.w + env.h) * 3;
      const far = (q: Pt) => G.farPoint(q, { x: q.x + dir.x, y: q.y + dir.y }, reach);
      const dirOf = (q: Pt): Pt => ({ x: q.x + dir.x, y: q.y + dir.y });
      fillPoly(ctx, d, [P[1], far(P[1]), far(m), m]);
      fillPoly(ctx, d, [P[2], far(P[2]), far(m), m]);
      stroke(ctx, d, st);
      if (opt(d, "showMedian", true)) strokeMode(ctx, env, o, m, "ray");
      strokeMode(ctx, env, P[1], dirOf(P[1]), "ray");
      strokeMode(ctx, env, P[2], dirOf(P[2]), "ray");
      if (kind === "inside") {
        // half-way lines between the median and each outer line
        stroke(ctx, d, { ...st, hover: false }, undefined, "dashed");
        ctx.lineWidth = 1;
        const h1 = G.mid(P[1], m);
        const h2 = G.mid(P[2], m);
        strokeMode(ctx, env, h1, dirOf(h1), "ray");
        strokeMode(ctx, env, h2, dirOf(h2), "ray");
      }
      if (opt(d, "showBase", true)) {
        guide(ctx, d);
        ctx.globalAlpha = 0.8;
        strokeSeg(ctx, P[1], P[2]);
        if (kind !== "inside") strokeSeg(ctx, P[0], P[1]);
      }
      if (kind !== "inside") dot(ctx, o, 2.5, d.style.color);
    },
    hit(_env, _d, P, x, y) {
      const g = geom(P);
      if (!g) return false;
      const { o, m, dir } = g;
      const dirOf = (q: Pt): Pt => ({ x: q.x + dir.x, y: q.y + dir.y });
      if (segHit(x, y, [o, m, "ray"], [P[1], dirOf(P[1]), "ray"], [P[2], dirOf(P[2]), "ray"], [P[1], P[2], "segment"], [P[0], P[1], "segment"])) return true;
      // the band between the outer tines, ahead of the base P1-P2
      const c1 = dir.x * (y - P[1].y) - dir.y * (x - P[1].x);
      const c2 = dir.x * (y - P[2].y) - dir.y * (x - P[2].x);
      const ahead = sideOf({ x, y }, P[1], P[2]) !== sideOf(o, P[1], P[2]);
      return c1 * c2 <= 0 && ahead;
    },
  };
}

function sideOf(p: Pt, a: Pt, b: Pt): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

/* ───────────── pitchfan ───────────── */

const FAN_LEVELS = [0, 0.382, 0.5, 0.618, 1];

const pitchfan: ToolDef = {
  id: "pitchfan",
  labelKey: "draw.tool.pitchfan",
  points: 3,
  style: mkStyle(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.08 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const reach = (env.w + env.h) * 3;
    const ends = FAN_LEVELS.map((k) => G.farPoint(P[0], lerpPt(P[1], P[2], k), reach));
    for (let i = 0; i < ends.length - 1; i++) fillPoly(ctx, d, [P[0], ends[i], ends[i + 1]], undefined, i % 2 === 0 ? 1 : 0.6);
    stroke(ctx, d, st);
    FAN_LEVELS.forEach((k) => {
      const q = lerpPt(P[1], P[2], k);
      stroke(ctx, d, st, undefined, k === 0.5 ? "solid" : d.style.dash);
      strokeMode(ctx, env, P[0], q, "ray");
    });
    guide(ctx, d);
    ctx.globalAlpha = 0.8;
    strokeSeg(ctx, P[1], P[2]);
  },
  hit(_env, _d, P, x, y) {
    if (segHit(x, y, [P[1], P[2], "segment"], ...FAN_LEVELS.map((k): [Pt, Pt, G.LineMode] => [P[0], lerpPt(P[1], P[2], k), "ray"]))) return true;
    // inside the wedge between the outer rays
    const p = { x, y };
    const s1 = sideOf(p, P[0], P[1]);
    const s2 = sideOf(p, P[0], P[2]);
    const inFront = (x - P[0].x) * (((P[1].x + P[2].x) / 2) - P[0].x) + (y - P[0].y) * (((P[1].y + P[2].y) / 2) - P[0].y) > 0;
    return inFront && s1 * s2 < 0;
  },
};

export const LINE_TOOLS: ToolDef[] = [
  trendAngle,
  disjointChannel,
  flatTopBottom,
  regressionTrend,
  forkTool("schiff", "schiff", BLUE),
  forkTool("mschiff", "mschiff", PURPLE),
  forkTool("inside_fork", "inside", TEAL),
  pitchfan,
];

