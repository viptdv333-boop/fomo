import * as G from "./geometry";
import { paintTextInBox } from "./render";
import {
  BLUE,
  GREEN,
  RED,
  TOL,
  UI_LINE,
  UI_SHAPE,
  arrowHead,
  borderOn,
  fillCur,
  fillPoly,
  mkStyle,
  polyHit,
  stroke,
  strokePoly,
  unitNormal,
  YELLOW,
  type Drawing,
  type Env,
  type Pt,
  type ToolDef,
} from "./tools-kit";

const UI_SHAPE_TEXT = { color: true, width: true, dash: true, fill: true, text: true } as const;
const SHAPE_TEXT = { size: 14, valign: "middle", align: "center" } as const;

/** Text of a closed shape, laid out inside its bounding box. */
function boxText(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, pts: Pt[]) {
  if ((d.style.text ?? "") === "" || pts.length === 0) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  paintTextInBox(ctx, env, d, SHAPE_TEXT, x0, y0, x1, y1);
}

/* Geometric shapes: rotated rectangle, circle, path, polyline, arc, curve, double curve, highlighter, arrow markers. */

/* ───────────── rotated rectangle ───────────── */

function rotRectCorners(P: Pt[]): Pt[] {
  const n = unitNormal(P[0], P[1]);
  const wd = (P[2].x - P[0].x) * n.x + (P[2].y - P[0].y) * n.y;
  return [P[0], P[1], { x: P[1].x + n.x * wd, y: P[1].y + n.y * wd }, { x: P[0].x + n.x * wd, y: P[0].y + n.y * wd }];
}

const rotatedRect: ToolDef = {
  id: "rotated_rect",
  labelKey: "draw.tool.rotated_rect",
  points: 3,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE_TEXT,
  draw(ctx, env, d, P, st) {
    const c = rotRectCorners(P);
    fillPoly(ctx, d, c);
    if (borderOn(d)) {
      stroke(ctx, d, st);
      strokePoly(ctx, c, true);
    }
    boxText(ctx, env, d, c);
  },
  hit: (_env, _d, P, x, y) => polyHit(x, y, rotRectCorners(P), true, true),
  handles(_env, _d, P) {
    const c = rotRectCorners(P);
    // the third anchor sits at the middle of the far side, so dragging it resizes the width
    const far = G.mid(c[2], c[3]);
    return [
      { x: P[0].x, y: P[0].y, idx: 0 },
      { x: P[1].x, y: P[1].y, idx: 1 },
      { x: far.x, y: far.y, idx: 2 },
    ];
  },
};

/* ───────────── circle ───────────── */

const circle: ToolDef = {
  id: "circle",
  labelKey: "draw.tool.circle",
  points: 2,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE_TEXT,
  draw(ctx, env, d, P, st) {
    const r = Math.max(0.5, G.dist(P[0], P[1]));
    ctx.beginPath();
    ctx.arc(P[0].x, P[0].y, r, 0, Math.PI * 2);
    fillCur(ctx, d);
    if (borderOn(d)) {
      stroke(ctx, d, st);
      ctx.stroke();
    }
    boxText(ctx, env, d, [
      { x: P[0].x - r, y: P[0].y - r },
      { x: P[0].x + r, y: P[0].y + r },
    ]);
  },
  hit(_env, _d, P, x, y) {
    // the whole disc plus a rim tolerance so thin circles stay selectable
    return Math.hypot(x - P[0].x, y - P[0].y) <= G.dist(P[0], P[1]) + TOL * 0.5;
  },
};

/* ───────────── path & polyline (variable number of anchors) ───────────── */

const path: ToolDef = {
  id: "path",
  labelKey: "draw.tool.path",
  points: 2,
  variable: true,
  style: mkStyle(BLUE, 2),
  ui: UI_LINE,
  draw(ctx, _env, d, P, st) {
    stroke(ctx, d, st);
    if (P.length < 2) return;
    // stop the shaft at the head base so a thick line does not poke through the tip
    const last = P[P.length - 1];
    const prev = P[P.length - 2];
    const head = 8 + Math.max(1, d.style.width) * 2;
    const len = G.dist(prev, last);
    const pts = P.slice();
    if (len > 1) pts[pts.length - 1] = G.farPoint(last, prev, Math.min(len, head * 0.7)) as Pt;
    const endArrow = d.style.rightEnd !== "none";
    if (!endArrow) pts[pts.length - 1] = last;
    if (d.style.leftEnd === "arrow" && P.length > 1) {
      const a = P[0];
      const b = P[1];
      const l0 = G.dist(a, b);
      if (l0 > 1) pts[0] = G.farPoint(a, b, Math.min(l0, head * 0.7)) as Pt;
    }
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    if (endArrow && len > 1) arrowHead(ctx, prev, last, head);
    if (d.style.leftEnd === "arrow" && P.length > 1 && G.dist(P[0], P[1]) > 1) arrowHead(ctx, P[1], P[0], head);
  },
  hit: (_env, _d, P, x, y) => polyHit(x, y, P),
};

const polyline: ToolDef = {
  id: "polyline",
  labelKey: "draw.tool.polyline",
  points: 2,
  variable: true,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE_TEXT,
  draw(ctx, env, d, P, st) {
    fillPoly(ctx, d, P);
    if (borderOn(d)) {
      stroke(ctx, d, st);
      strokePoly(ctx, P, P.length > 2);
    }
    boxText(ctx, env, d, P);
  },
  hit: (_env, _d, P, x, y) => polyHit(x, y, P, P.length > 2, true),
};

/* ───────────── arc, curve, double curve ───────────── */

interface ArcGeo {
  m: Pt;
  a: number;
  b: number;
  phi: number;
  side: number;
  u: Pt;
  n: Pt;
}

function arcGeo(P: Pt[]): ArcGeo | null {
  const chord = G.dist(P[0], P[1]);
  if (chord < 1) return null;
  const m = G.mid(P[0], P[1]);
  const n = unitNormal(P[0], P[1]);
  const u = { x: (P[1].x - P[0].x) / chord, y: (P[1].y - P[0].y) / chord };
  const h = (P[2].x - m.x) * n.x + (P[2].y - m.y) * n.y;
  return { m, a: chord / 2, b: Math.max(1, Math.abs(h)), phi: Math.atan2(u.y, u.x), side: h >= 0 ? 1 : -1, u, n };
}

const arc: ToolDef = {
  id: "arc",
  labelKey: "draw.tool.arc",
  points: 3,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.12 }),
  ui: UI_SHAPE,
  draw(ctx, _env, d, P, st) {
    const g = arcGeo(P);
    if (!g) return;
    const start = g.side > 0 ? 0 : Math.PI;
    ctx.beginPath();
    ctx.ellipse(g.m.x, g.m.y, g.a, g.b, g.phi, start, start + Math.PI);
    ctx.closePath();
    fillCur(ctx, d);
    stroke(ctx, d, st);
    ctx.beginPath();
    ctx.ellipse(g.m.x, g.m.y, g.a, g.b, g.phi, start, start + Math.PI);
    if (borderOn(d)) ctx.stroke();
  },
  hit(_env, _d, P, x, y) {
    const g = arcGeo(P);
    if (!g) return false;
    const dx = x - g.m.x;
    const dy = y - g.m.y;
    const uu = (dx * g.u.x + dy * g.u.y) / g.a;
    const vv = ((dx * g.n.x + dy * g.n.y) * g.side) / g.b;
    if (vv >= -0.02 && uu * uu + vv * vv <= 1) return true;
    const k = Math.hypot(uu, vv);
    return vv >= -0.05 && Math.abs(k - 1) * Math.min(g.a, g.b) <= TOL;
  },
  handles(_env, _d, P) {
    const g = arcGeo(P);
    return [
      { x: P[0].x, y: P[0].y, idx: 0 },
      { x: P[1].x, y: P[1].y, idx: 1 },
      g ? { x: g.m.x + g.n.x * g.side * g.b, y: g.m.y + g.n.y * g.side * g.b, idx: 2 } : { x: P[2].x, y: P[2].y, idx: 2 },
    ];
  },
};

function curveCtrl(P: Pt[]): Pt {
  if (P.length >= 3) return { x: 2 * P[2].x - (P[0].x + P[1].x) / 2, y: 2 * P[2].y - (P[0].y + P[1].y) / 2 };
  const m = G.mid(P[0], P[1]);
  const n = unitNormal(P[0], P[1]);
  const len = G.dist(P[0], P[1]);
  return { x: m.x + n.x * len * 0.5, y: m.y + n.y * len * 0.5 };
}

function sampleQuad(a: Pt, c: Pt, b: Pt, n = 32): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = 1 - t;
    out.push({ x: k * k * a.x + 2 * k * t * c.x + t * t * b.x, y: k * k * a.y + 2 * k * t * c.y + t * t * b.y });
  }
  return out;
}

const curve: ToolDef = {
  id: "curve",
  labelKey: "draw.tool.curve",
  points: 2,
  total: 3,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0 }),
  ui: UI_SHAPE,
  complete(pts, env) {
    const a = { x: env.toX(pts[0].t), y: env.toY(pts[0].p) };
    const b = { x: env.toX(pts[1].t), y: env.toY(pts[1].p) };
    const m = G.mid(a, b);
    const n = unitNormal(a, b);
    const len = G.dist(a, b);
    // the anchor the curve passes through, a quarter of the chord away from it
    const c = { x: m.x + n.x * len * 0.25, y: m.y + n.y * len * 0.25 };
    return [pts[0], pts[1], { t: env.timeAt(c.x), p: env.priceAt(c.y) }];
  },
  draw(ctx, _env, d, P, st) {
    const q = curveCtrl(P);
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.quadraticCurveTo(q.x, q.y, P[1].x, P[1].y);
    if ((d.style.fillOpacity ?? 0) > 0) fillCur(ctx, d);
    stroke(ctx, d, st);
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.quadraticCurveTo(q.x, q.y, P[1].x, P[1].y);
    ctx.stroke();
  },
  hit(_env, _d, P, x, y) {
    return G.distToPolyline({ x, y }, sampleQuad(P[0], curveCtrl(P), P[1])) <= TOL;
  },
};

function sampleCubic(a: Pt, c1: Pt, c2: Pt, b: Pt, n = 40): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = 1 - t;
    out.push({
      x: k * k * k * a.x + 3 * k * k * t * c1.x + 3 * k * t * t * c2.x + t * t * t * b.x,
      y: k * k * k * a.y + 3 * k * k * t * c1.y + 3 * k * t * t * c2.y + t * t * t * b.y,
    });
  }
  return out;
}

const doubleCurve: ToolDef = {
  id: "double_curve",
  labelKey: "draw.tool.double_curve",
  points: 2,
  style: mkStyle(BLUE, 2),
  ui: UI_LINE,
  draw(ctx, _env, d, P, st) {
    const mx = (P[0].x + P[1].x) / 2;
    stroke(ctx, d, st);
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.bezierCurveTo(mx, P[0].y, mx, P[1].y, P[1].x, P[1].y);
    ctx.stroke();
  },
  hit(_env, _d, P, x, y) {
    const mx = (P[0].x + P[1].x) / 2;
    return G.distToPolyline({ x, y }, sampleCubic(P[0], { x: mx, y: P[0].y }, { x: mx, y: P[1].y }, P[1])) <= TOL;
  },
};

/* ───────────── highlighter ───────────── */

const highlighter: ToolDef = {
  id: "highlighter",
  labelKey: "draw.tool.highlighter",
  points: 0,
  style: mkStyle(YELLOW, 3),
  ui: { color: true, width: true, dash: false, fill: false, text: false },
  draw(ctx, _env, d, P, st) {
    if (P.length < 2) return;
    const w = Math.max(1, d.style.width) * 6 + (st.hover && !st.selected ? 2 : 0);
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = d.style.color;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length - 1; i++) {
      const mx = (P[i].x + P[i + 1].x) / 2;
      const my = (P[i].y + P[i + 1].y) / 2;
      ctx.quadraticCurveTo(P[i].x, P[i].y, mx, my);
    }
    ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
    ctx.stroke();
  },
  hit: (_env, d, P, x, y) => G.distToPolyline({ x, y }, P) <= TOL + Math.max(1, d.style.width) * 3,
  handles: () => [],
};

/* ───────────── arrow markers ───────────── */

function markerSize(d: { style: { width: number } }): number {
  return 6 + Math.round(Math.max(1, d.style.width)) * 3;
}

function markerPoly(p: Pt, s: number, dir: 1 | -1): Pt[] {
  // tip at p, body extends away from the tip (down for an up arrow)
  const head = s * 1.15;
  const total = s * 2.6;
  const sw = s * 0.42;
  const hw = s * 0.95;
  const y = (k: number) => p.y + dir * k;
  return [
    { x: p.x, y: p.y },
    { x: p.x + hw, y: y(head) },
    { x: p.x + sw, y: y(head) },
    { x: p.x + sw, y: y(total) },
    { x: p.x - sw, y: y(total) },
    { x: p.x - sw, y: y(head) },
    { x: p.x - hw, y: y(head) },
  ];
}

function arrowMark(id: "arrow_up" | "arrow_down"): ToolDef {
  const dir: 1 | -1 = id === "arrow_up" ? 1 : -1;
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 1,
    style: mkStyle(id === "arrow_up" ? GREEN : RED, 2),
    ui: { color: true, width: true, dash: false, fill: false, text: false },
    draw(ctx, _env, d, P, st) {
      const poly = markerPoly(P[0], markerSize(d), dir);
      ctx.beginPath();
      poly.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = d.style.color;
      ctx.fill();
      if (st.hover || st.selected) {
        ctx.strokeStyle = d.style.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
      }
    },
    hit(_env, d, P, x, y) {
      const s = markerSize(d);
      return G.pointInPolygon({ x, y }, markerPoly(P[0], s, dir)) || (Math.abs(x - P[0].x) <= s && y * dir >= P[0].y * dir - 4 && y * dir <= (P[0].y + dir * s * 2.6) * dir + 4);
    },
  };
}

function blockArrow(P: Pt[], w: number): Pt[] {
  const len = G.dist(P[0], P[1]);
  if (len < 2) return [];
  const u = { x: (P[1].x - P[0].x) / len, y: (P[1].y - P[0].y) / len };
  const n = { x: -u.y, y: u.x };
  const sw = 2 + w * 1.4;
  const hw = sw * 2.4;
  const hl = Math.min(len * 0.7, 10 + w * 4);
  const bx = P[1].x - u.x * hl;
  const by = P[1].y - u.y * hl;
  return [
    { x: P[0].x + n.x * sw * 0.5, y: P[0].y + n.y * sw * 0.5 },
    { x: bx + n.x * sw, y: by + n.y * sw },
    { x: bx + n.x * hw, y: by + n.y * hw },
    { x: P[1].x, y: P[1].y },
    { x: bx - n.x * hw, y: by - n.y * hw },
    { x: bx - n.x * sw, y: by - n.y * sw },
    { x: P[0].x - n.x * sw * 0.5, y: P[0].y - n.y * sw * 0.5 },
  ];
}

const arrowMarker: ToolDef = {
  id: "arrow_marker",
  labelKey: "draw.tool.arrow_marker",
  points: 2,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.85 }),
  ui: { color: true, width: true, dash: false, fill: false, text: false },
  draw(ctx, _env, d, P, st) {
    const poly = blockArrow(P, Math.max(1, d.style.width));
    if (poly.length === 0) return;
    ctx.beginPath();
    poly.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = d.style.color;
    ctx.fill();
    if (st.hover || st.selected) {
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },
  hit(_env, d, P, x, y) {
    const poly = blockArrow(P, Math.max(1, d.style.width));
    return poly.length > 0 && (G.pointInPolygon({ x, y }, poly) || G.distToSegment({ x, y }, P[0], P[1]) <= TOL);
  },
};

export const SHAPE_TOOLS: ToolDef[] = [rotatedRect, circle, path, polyline, arc, curve, doubleCurve, highlighter, arrowMark("arrow_up"), arrowMark("arrow_down"), arrowMarker];
