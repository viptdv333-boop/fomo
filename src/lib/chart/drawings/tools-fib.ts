import * as G from "./geometry";
import {
  GRAY,
  RAINBOW,
  TOL,
  UI_SHAPE,
  boxHandles,
  fillCur,
  fillPoly,
  guide,
  label,
  mkStyle,
  opt,
  plainText,
  segHit,
  stroke,
  strokeMode,
  strokeSeg,
  type Drawing,
  type Env,
  type Pt,
  type ToolDef,
} from "./tools-kit";

/* Gann and Fibonacci: time zones, trend-based time, circles, speed fan / arcs, spiral, wedge, Gann box / square / fan. */

const FIB_TIME = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const FIB_TREND_TIME = [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3, 4.236];
const FIB_CIRCLE = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 4.236];
const FAN_LV = [0.25, 0.382, 0.5, 0.618, 0.75, 1];
const ARC_LV = [0.382, 0.5, 0.618, 0.786, 1];
const WEDGE_LV = [0.236, 0.382, 0.5, 0.618, 0.786, 1];
const BOX_LV = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];
const PHI = 1.6180339887;

const lvText = G.fibLevelLabel;

function fibLabel(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, text: string, x: number, y: number, align: "left" | "right" | "center" = "center") {
  if (!opt(d, "showLabels", true)) return;
  label(ctx, env, text, x, y, { align, base: "middle", bg: env.theme.bg, fg: env.theme.text, alpha: 0.8, size: 10, clamp: false });
}

/* ───────────── time-based ───────────── */

function vertLines(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, st: Parameters<ToolDef["draw"]>[4], xs: number[], texts: string[]) {
  // alternate bands
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = Math.min(xs[i], xs[i + 1]);
    const x1 = Math.max(xs[i], xs[i + 1]);
    if (x1 < -2 || x0 > env.w + 2) continue;
    ctx.beginPath();
    ctx.rect(x0, 0, x1 - x0, env.h);
    fillCur(ctx, d, d.style.fill ?? RAINBOW[i % RAINBOW.length], i % 2 === 0 ? 0.7 : 0.35);
  }
  stroke(ctx, d, st);
  xs.forEach((x) => {
    if (x < -2 || x > env.w + 2) return;
    const px = Math.round(x) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, env.h);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  xs.forEach((x, i) => {
    if (x < 0 || x > env.w) return;
    fibLabel(ctx, env, d, texts[i], x, env.h - 14);
  });
}

const fibTime: ToolDef = {
  id: "fib_time",
  labelKey: "draw.tool.fib_time",
  points: 2,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const unit = P[1].x - P[0].x;
    if (Math.abs(unit) < 1) return;
    const xs = FIB_TIME.map((k) => P[0].x + k * unit);
    vertLines(ctx, env, d, st, xs, FIB_TIME.map(String));
    guide(ctx, d, env.theme.textMuted);
    strokeSeg(ctx, P[0], P[1]);
  },
  hit(_env, _d, P, x, y) {
    const unit = P[1].x - P[0].x;
    if (segHit(x, y, [P[0], P[1], "segment"])) return true;
    if (Math.abs(unit) < 1) return false;
    return FIB_TIME.some((k) => Math.abs(x - (P[0].x + k * unit)) <= TOL);
  },
};

const fibTrendTime: ToolDef = {
  id: "fib_trend_time",
  labelKey: "draw.tool.fib_trend_time",
  points: 3,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const unit = P[1].x - P[0].x;
    if (Math.abs(unit) < 1) return;
    const xs = FIB_TREND_TIME.map((k) => P[2].x + k * unit);
    vertLines(ctx, env, d, st, xs, FIB_TREND_TIME.map(lvText));
    guide(ctx, d, env.theme.textMuted);
    strokeSeg(ctx, P[0], P[1]);
    strokeSeg(ctx, P[1], P[2]);
  },
  hit(_env, _d, P, x, y) {
    const unit = P[1].x - P[0].x;
    if (segHit(x, y, [P[0], P[1], "segment"], [P[1], P[2], "segment"])) return true;
    if (Math.abs(unit) < 1) return false;
    return FIB_TREND_TIME.some((k) => Math.abs(x - (P[2].x + k * unit)) <= TOL);
  },
};

/* ───────────── circles, arcs, spiral, wedge ───────────── */

function ringPoly(c: Pt, r0: number, r1: number, a0: number, a1: number, steps = 48): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push({ x: c.x + Math.cos(a) * r1, y: c.y + Math.sin(a) * r1 });
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push({ x: c.x + Math.cos(a) * r0, y: c.y + Math.sin(a) * r0 });
  }
  return out;
}

const fibCircles: ToolDef = {
  id: "fib_circles",
  labelKey: "draw.tool.fib_circles",
  points: 2,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.08 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const c = G.mid(P[0], P[1]);
    const base = G.dist(P[0], P[1]) / 2;
    if (base < 1) return;
    for (let i = FIB_CIRCLE.length - 1; i >= 0; i--) {
      const r = FIB_CIRCLE[i] * base;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      if (i > 0) ctx.arc(c.x, c.y, FIB_CIRCLE[i - 1] * base, 0, Math.PI * 2, true);
      fillCur(ctx, d, d.style.fill ?? RAINBOW[i % RAINBOW.length], i % 2 === 0 ? 1 : 0.5);
    }
    stroke(ctx, d, st);
    FIB_CIRCLE.forEach((lv) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, lv * base, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    FIB_CIRCLE.forEach((lv) => fibLabel(ctx, env, d, lvText(lv), c.x + lv * base, c.y, "left"));
    guide(ctx, d, env.theme.textMuted);
    strokeSeg(ctx, P[0], P[1]);
  },
  hit(_env, _d, P, x, y) {
    const c = G.mid(P[0], P[1]);
    const base = G.dist(P[0], P[1]) / 2;
    const r = Math.hypot(x - c.x, y - c.y);
    if (segHit(x, y, [P[0], P[1], "segment"])) return true;
    return FIB_CIRCLE.some((lv) => Math.abs(r - lv * base) <= TOL);
  },
};

const fibArcs: ToolDef = {
  id: "fib_arcs",
  labelKey: "draw.tool.fib_arcs",
  points: 2,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const c = P[1];
    const R = G.dist(P[0], P[1]);
    if (R < 2) return;
    const face = Math.atan2(P[0].y - P[1].y, P[0].x - P[1].x);
    const a0 = face - Math.PI / 2;
    const a1 = face + Math.PI / 2;
    for (let i = ARC_LV.length - 1; i >= 0; i--) {
      const inner = i > 0 ? ARC_LV[i - 1] * R : 0;
      fillPoly(ctx, d, ringPoly(c, inner, ARC_LV[i] * R, a0, a1), d.style.fill ?? RAINBOW[i % RAINBOW.length], i % 2 === 0 ? 1 : 0.5);
    }
    stroke(ctx, d, st);
    ARC_LV.forEach((lv) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, lv * R, a0, a1);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ARC_LV.forEach((lv) => fibLabel(ctx, env, d, lvText(lv), c.x + Math.cos(face) * lv * R, c.y + Math.sin(face) * lv * R));
    guide(ctx, d, env.theme.textMuted);
    strokeSeg(ctx, P[0], P[1]);
  },
  hit(_env, _d, P, x, y) {
    const R = G.dist(P[0], P[1]);
    if (segHit(x, y, [P[0], P[1], "segment"])) return true;
    const face = Math.atan2(P[0].y - P[1].y, P[0].x - P[1].x);
    const ang = Math.atan2(y - P[1].y, x - P[1].x);
    let diff = Math.abs(ang - face) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > Math.PI / 2 + 0.05) return false;
    const r = Math.hypot(x - P[1].x, y - P[1].y);
    return ARC_LV.some((lv) => Math.abs(r - lv * R) <= TOL) || r <= R;
  },
};

function spiralPoints(P: Pt[]): Pt[] {
  const R = G.dist(P[0], P[1]);
  if (R < 1) return [];
  const a0 = Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x);
  const out: Pt[] = [];
  for (let th = -5 * Math.PI; th <= 3 * Math.PI + 1e-6; th += 0.06) {
    const r = R * Math.pow(PHI, (2 * th) / Math.PI);
    if (r > 40000) break;
    out.push({ x: P[0].x + Math.cos(a0 + th) * r, y: P[0].y + Math.sin(a0 + th) * r });
  }
  return out;
}

const fibSpiral: ToolDef = {
  id: "fib_spiral",
  labelKey: "draw.tool.fib_spiral",
  points: 2,
  style: mkStyle(GRAY, 2),
  ui: { color: true, width: true, dash: true, fill: false, text: false },
  draw(ctx, env, d, P, st) {
    const pts = spiralPoints(P);
    if (pts.length < 2) return;
    stroke(ctx, d, st);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    guide(ctx, d, env.theme.textMuted);
    strokeSeg(ctx, P[0], P[1]);
  },
  hit(_env, _d, P, x, y) {
    if (segHit(x, y, [P[0], P[1], "segment"])) return true;
    const pts = spiralPoints(P);
    // only test the part near the pointer: cheap polyline distance on ~170 samples
    return pts.length > 1 && G.distToPolyline({ x, y }, pts) <= TOL;
  },
};

function normAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

const fibWedge: ToolDef = {
  id: "fib_wedge",
  labelKey: "draw.tool.fib_wedge",
  points: 3,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const c = P[0];
    const R = G.dist(c, P[1]);
    if (R < 2) return;
    const a1 = Math.atan2(P[1].y - c.y, P[1].x - c.x);
    const a2 = a1 + normAngle(Math.atan2(P[2].y - c.y, P[2].x - c.x) - a1);
    for (let i = WEDGE_LV.length - 1; i >= 0; i--) {
      const inner = i > 0 ? WEDGE_LV[i - 1] * R : 0;
      fillPoly(ctx, d, ringPoly(c, inner, WEDGE_LV[i] * R, a1, a2, 32), d.style.fill ?? RAINBOW[i % RAINBOW.length], i % 2 === 0 ? 1 : 0.5);
    }
    stroke(ctx, d, st);
    WEDGE_LV.forEach((lv) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, lv * R, a1, a2, a2 < a1);
      ctx.stroke();
    });
    strokeSeg(ctx, c, { x: c.x + Math.cos(a1) * R, y: c.y + Math.sin(a1) * R });
    strokeSeg(ctx, c, { x: c.x + Math.cos(a2) * R, y: c.y + Math.sin(a2) * R });
    ctx.setLineDash([]);
    const am = (a1 + a2) / 2;
    WEDGE_LV.forEach((lv) => fibLabel(ctx, env, d, lvText(lv), c.x + Math.cos(am) * lv * R, c.y + Math.sin(am) * lv * R));
    guide(ctx, d, env.theme.textMuted);
    strokeSeg(ctx, P[1], P[2]);
  },
  hit(_env, _d, P, x, y) {
    const c = P[0];
    const R = G.dist(c, P[1]);
    if (R < 2) return false;
    const a1 = Math.atan2(P[1].y - c.y, P[1].x - c.x);
    const span = normAngle(Math.atan2(P[2].y - c.y, P[2].x - c.x) - a1);
    const a = normAngle(Math.atan2(y - c.y, x - c.x) - a1);
    const r = Math.hypot(x - c.x, y - c.y);
    const within = span >= 0 ? a >= -0.03 && a <= span + 0.03 : a <= 0.03 && a >= span - 0.03;
    if (within && (r <= R + TOL && WEDGE_LV.some((lv) => Math.abs(r - lv * R) <= TOL))) return true;
    if (within && r <= R) return true;
    return segHit(x, y, [c, P[1], "segment"], [c, { x: c.x + Math.cos(a1 + span) * R, y: c.y + Math.sin(a1 + span) * R }, "segment"], [P[1], P[2], "segment"]);
  },
};

/* ───────────── speed resistance fan ───────────── */

function fanEnds(P: Pt[]): { h: Pt[]; v: Pt[] } {
  const dx = P[1].x - P[0].x;
  const dy = P[1].y - P[0].y;
  return {
    // rays through the far vertical side (price levels) and through the far horizontal side (time levels)
    h: FAN_LV.map((lv) => ({ x: P[1].x, y: P[0].y + dy * lv })),
    v: FAN_LV.map((lv) => ({ x: P[0].x + dx * lv, y: P[1].y })),
  };
}

const fibSpeedFan: ToolDef = {
  id: "fib_speed_fan",
  labelKey: "draw.tool.fib_speed_fan",
  points: 2,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const { h, v } = fanEnds(P);
    const reach = (env.w + env.h) * 3;
    const far = (q: Pt) => G.farPoint(P[0], q, reach);
    const fam = [h, v];
    fam.forEach((ends) => {
      for (let i = 0; i < ends.length - 1; i++) fillPoly(ctx, d, [P[0], far(ends[i]), far(ends[i + 1])], d.style.fill ?? RAINBOW[i % RAINBOW.length], i % 2 === 0 ? 1 : 0.5);
    });
    stroke(ctx, d, st);
    fam.forEach((ends) => ends.forEach((q) => strokeMode(ctx, env, P[0], q, "ray")));
    // frame of the box
    guide(ctx, d, env.theme.textMuted);
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[1].y);
    ctx.lineTo(P[1].x, P[1].y);
    ctx.lineTo(P[1].x, P[0].y);
    ctx.stroke();
    ctx.setLineDash([]);
    h.forEach((q, i) => fibLabel(ctx, env, d, lvText(FAN_LV[i]), q.x + 2, q.y, "left"));
    v.forEach((q, i) => fibLabel(ctx, env, d, lvText(FAN_LV[i]), q.x, q.y + (P[1].y >= P[0].y ? 10 : -10)));
  },
  hit(_env, _d, P, x, y) {
    const { h, v } = fanEnds(P);
    const segs = [...h, ...v].map((q): [Pt, Pt, G.LineMode] => [P[0], q, "ray"]);
    if (segHit(x, y, ...segs, [P[0], P[1], "segment"])) return true;
    return G.pointInRect({ x, y }, P[0], P[1]);
  },
};

/* ───────────── Gann ───────────── */

interface BoxGeo {
  a: Pt;
  b: Pt;
}

function gridLines(ctx: CanvasRenderingContext2D, g: BoxGeo, xs: number[], ys: number[]) {
  const { a, b } = g;
  ctx.beginPath();
  xs.forEach((k) => {
    const x = a.x + (b.x - a.x) * k;
    ctx.moveTo(x, a.y);
    ctx.lineTo(x, b.y);
  });
  ys.forEach((k) => {
    const y = a.y + (b.y - a.y) * k;
    ctx.moveTo(a.x, y);
    ctx.lineTo(b.x, y);
  });
  ctx.stroke();
}

const gannBox: ToolDef = {
  id: "gann_box",
  labelKey: "draw.tool.gann_box",
  points: 2,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const g = { a: P[0], b: P[1] };
    // horizontal bands
    for (let i = 0; i < BOX_LV.length - 1; i++) {
      const y0 = g.a.y + (g.b.y - g.a.y) * BOX_LV[i];
      const y1 = g.a.y + (g.b.y - g.a.y) * BOX_LV[i + 1];
      ctx.beginPath();
      ctx.rect(Math.min(g.a.x, g.b.x), Math.min(y0, y1), Math.abs(g.b.x - g.a.x), Math.abs(y1 - y0));
      fillCur(ctx, d, d.style.fill ?? RAINBOW[i % RAINBOW.length], 0.8);
    }
    stroke(ctx, d, st);
    gridLines(ctx, g, BOX_LV, BOX_LV);
    // diagonals: 1x1 both ways and the 1x2 / 2x1 fans from every corner
    guide(ctx, d);
    ctx.setLineDash([]);
    const at = (kx: number, ky: number): Pt => ({ x: g.a.x + (g.b.x - g.a.x) * kx, y: g.a.y + (g.b.y - g.a.y) * ky });
    const diag: [Pt, Pt][] = [
      [at(0, 0), at(1, 1)],
      [at(0, 1), at(1, 0)],
      [at(0, 0), at(1, 0.5)],
      [at(0, 0), at(0.5, 1)],
      [at(1, 1), at(0, 0.5)],
      [at(1, 1), at(0.5, 0)],
      [at(0, 1), at(1, 0.5)],
      [at(0, 1), at(0.5, 0)],
      [at(1, 0), at(0, 0.5)],
      [at(1, 0), at(0.5, 1)],
    ];
    diag.forEach(([p, q], i) => {
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = i < 2 ? 1.5 : 1;
      ctx.globalAlpha = i < 2 ? 1 : 0.55;
      strokeSeg(ctx, p, q);
    });
    ctx.globalAlpha = 1;
    if (opt(d, "showLabels", true)) BOX_LV.forEach((k) => {
      const p = at(0, k);
      plainText(ctx, env, lvText(k), Math.min(g.a.x, g.b.x) - 4, p.y, env.theme.text, 10, "right");
      const q = at(k, 0);
      plainText(ctx, env, lvText(k), q.x, g.a.y + (g.a.y <= g.b.y ? -8 : 8), env.theme.text, 10, "center");
    });
  },
  hit: (_env, _d, P, x, y) => G.pointInRect({ x, y }, P[0], P[1]) || G.distToRectEdge({ x, y }, P[0], P[1]) <= TOL,
  handles: (_env, _d, P) => boxHandles(P),
};

function squareGeo(P: Pt[], fixed: boolean): BoxGeo {
  if (!fixed) return { a: P[0], b: P[1] };
  const side = Math.abs(P[1].x - P[0].x);
  const sy = P[1].y >= P[0].y ? 1 : -1;
  return { a: P[0], b: { x: P[1].x, y: P[0].y + sy * side } };
}

function gannSquareTool(id: "gann_square" | "gann_square_fixed"): ToolDef {
  const fixed = id === "gann_square_fixed";
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 2,
    style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.08 }),
    ui: UI_SHAPE,
    draw(ctx, env, d, P, st) {
      const g = squareGeo(P, fixed);
      const { a, b } = g;
      const x0 = Math.min(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      ctx.beginPath();
      ctx.rect(x0, y0, w, h);
      fillCur(ctx, d);
      // cells alternate shading
      const N = 8;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if ((i + j) % 2 === 0) continue;
          ctx.beginPath();
          ctx.rect(x0 + (w / N) * i, y0 + (h / N) * j, w / N, h / N);
          fillCur(ctx, d, d.style.fill ?? d.style.color, 0.5);
        }
      }
      stroke(ctx, d, st);
      const ks = Array.from({ length: N + 1 }, (_, i) => i / N);
      gridLines(ctx, g, ks, ks);
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      const at = (kx: number, ky: number): Pt => ({ x: a.x + (b.x - a.x) * kx, y: a.y + (b.y - a.y) * ky });
      strokeSeg(ctx, at(0, 0), at(1, 1));
      strokeSeg(ctx, at(0, 1), at(1, 0));
      // inscribed diamond and circle of the Gann square
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(at(0.5, 0).x, at(0.5, 0).y);
      ctx.lineTo(at(1, 0.5).x, at(1, 0.5).y);
      ctx.lineTo(at(0.5, 1).x, at(0.5, 1).y);
      ctx.lineTo(at(0, 0.5).x, at(0, 0.5).y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x0 + w / 2, y0 + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    hit(_env, _d, P, x, y) {
      const { a, b } = squareGeo(P, fixed);
      return G.pointInRect({ x, y }, a, b) || G.distToRectEdge({ x, y }, a, b) <= TOL;
    },
    handles(_env, _d, P) {
      if (!fixed) return boxHandles(P);
      const g = squareGeo(P, true);
      return [
        { x: P[0].x, y: P[0].y, idx: 0 },
        { x: g.b.x, y: g.b.y, idx: 1 },
      ];
    },
  };
}

const GANN_RATIOS: { key: string; m: number }[] = [
  { key: "1x8", m: 1 / 8 },
  { key: "1x4", m: 1 / 4 },
  { key: "1x3", m: 1 / 3 },
  { key: "1x2", m: 1 / 2 },
  { key: "1x1", m: 1 },
  { key: "2x1", m: 2 },
  { key: "3x1", m: 3 },
  { key: "4x1", m: 4 },
  { key: "8x1", m: 8 },
];

function gannEnds(P: Pt[]): Pt[] {
  const dx = P[1].x - P[0].x;
  const dy = P[1].y - P[0].y;
  return GANN_RATIOS.map((r) => ({ x: P[0].x + dx, y: P[0].y + dy * r.m }));
}

const gannFan: ToolDef = {
  id: "gann_fan",
  labelKey: "draw.tool.gann_fan",
  points: 2,
  style: mkStyle(GRAY, 1, "solid", { fillOpacity: 0.08 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    if (Math.abs(P[1].x - P[0].x) < 1) return;
    const ends = gannEnds(P);
    const reach = (env.w + env.h) * 3;
    for (let i = 0; i < ends.length - 1; i++) {
      fillPoly(ctx, d, [P[0], G.farPoint(P[0], ends[i], reach), G.farPoint(P[0], ends[i + 1], reach)], d.style.fill ?? RAINBOW[i % RAINBOW.length], i % 2 === 0 ? 1 : 0.5);
    }
    ends.forEach((q, i) => {
      const main = GANN_RATIOS[i].m === 1;
      stroke(ctx, d, st, main ? d.style.color : undefined);
      if (main) ctx.lineWidth = Math.max(ctx.lineWidth, 1.5);
      strokeMode(ctx, env, P[0], q, "ray");
    });
    ctx.setLineDash([]);
    const rect = { x0: 0, y0: 0, x1: env.w, y1: env.h };
    ends.forEach((q, i) => {
      const seg = G.clipLineToRect(P[0], q, "ray", rect);
      if (!seg) return;
      const e = seg[1];
      const ex = Math.max(20, Math.min(env.w - 22, e.x));
      const ey = Math.max(10, Math.min(env.h - 10, e.y));
      fibLabel(ctx, env, d, GANN_RATIOS[i].key, ex, ey);
    });
    guide(ctx, d, env.theme.textMuted);
  },
  hit(_env, _d, P, x, y) {
    if (Math.abs(P[1].x - P[0].x) < 1) return false;
    return segHit(x, y, ...gannEnds(P).map((q): [Pt, Pt, G.LineMode] => [P[0], q, "ray"]));
  },
};

export const FIB_TOOLS: ToolDef[] = [
  fibTime,
  fibTrendTime,
  fibCircles,
  fibSpeedFan,
  fibArcs,
  fibSpiral,
  fibWedge,
  gannBox,
  gannSquareTool("gann_square_fixed"),
  gannSquareTool("gann_square"),
  gannFan,
];
