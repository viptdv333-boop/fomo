import {
  BLUE,
  PURPLE,
  TEAL,
  TOL,
  UI_SHAPE,
  fillCur,
  guide,
  mkStyle,
  segHit,
  stroke,
  strokeSeg,
  type ToolDef,
} from "./tools-kit";

/* Cycles: cyclic lines, time cycles, sine line. All in screen space from two anchors. */

const MAX_REPEAT = 500;

function repeatRange(x0: number, period: number, w: number): [number, number] {
  const a = Math.floor((-8 - x0) / period);
  const b = Math.ceil((w + 8 - x0) / period);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return [Math.max(lo, -MAX_REPEAT), Math.min(hi, MAX_REPEAT)];
}

const cyclicLines: ToolDef = {
  id: "cyclic_lines",
  labelKey: "draw.tool.cyclic_lines",
  points: 2,
  style: mkStyle(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.06 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const period = P[1].x - P[0].x;
    if (Math.abs(period) < 3) return;
    const [lo, hi] = repeatRange(P[0].x, period, env.w);
    for (let k = lo; k < hi; k++) {
      if (k % 2 !== 0) continue;
      const xa = P[0].x + k * period;
      const xb = P[0].x + (k + 1) * period;
      ctx.beginPath();
      ctx.rect(Math.min(xa, xb), 0, Math.abs(period), env.h);
      fillCur(ctx, d);
    }
    stroke(ctx, d, st);
    for (let k = lo; k <= hi; k++) {
      const x = Math.round(P[0].x + k * period) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, env.h);
      ctx.stroke();
    }
    guide(ctx, d);
    strokeSeg(ctx, P[0], P[1]);
  },
  hit(env, _d, P, x, y) {
    const period = P[1].x - P[0].x;
    if (segHit(x, y, [P[0], P[1], "segment"])) return true;
    if (Math.abs(period) < 3) return false;
    const k = Math.round((x - P[0].x) / period);
    return Math.abs(x - (P[0].x + k * period)) <= TOL && Math.abs(k) <= MAX_REPEAT && env.h > 0;
  },
};

function cycleHeight(P: { x: number; y: number }[]): number {
  const dy = P[1].y - P[0].y;
  if (Math.abs(dy) >= 8) return dy;
  return -Math.abs(P[1].x - P[0].x) / 2;
}

const timeCycles: ToolDef = {
  id: "time_cycles",
  labelKey: "draw.tool.time_cycles",
  points: 2,
  style: mkStyle(PURPLE, 2, "solid", { fill: PURPLE, fillOpacity: 0.16 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const period = P[1].x - P[0].x;
    if (Math.abs(period) < 3) return;
    const h = cycleHeight(P);
    const y0 = P[0].y;
    const [lo, hi] = repeatRange(P[0].x, period, env.w);
    for (let k = lo; k < hi; k++) {
      const xa = P[0].x + k * period;
      const cx = xa + period / 2;
      ctx.beginPath();
      ctx.ellipse(cx, y0, Math.abs(period) / 2, Math.abs(h), 0, h < 0 ? Math.PI : 0, h < 0 ? Math.PI * 2 : Math.PI);
      ctx.closePath();
      fillCur(ctx, d);
      stroke(ctx, d, st);
      ctx.stroke();
    }
    // baseline
    guide(ctx, d);
    ctx.beginPath();
    ctx.moveTo(-2, y0);
    ctx.lineTo(env.w + 2, y0);
    ctx.stroke();
  },
  hit(_env, _d, P, x, y) {
    const period = P[1].x - P[0].x;
    if (Math.abs(period) < 3) return false;
    const h = cycleHeight(P);
    const k = Math.floor((x - P[0].x) / period);
    const cx = P[0].x + k * period + period / 2;
    const u = (x - cx) / (Math.abs(period) / 2);
    const above = h < 0 ? y <= P[0].y : y >= P[0].y;
    if (Math.abs(u) <= 1 && above) {
      const yEdge = Math.abs(h) * Math.sqrt(Math.max(0, 1 - u * u));
      const inside = Math.abs(y - P[0].y) <= yEdge + TOL;
      if (inside) return true;
    }
    return Math.abs(y - P[0].y) <= TOL && Math.abs(k) <= MAX_REPEAT;
  },
};

function sineParams(P: { x: number; y: number }[]) {
  const dx = P[1].x - P[0].x;
  const mid = (P[0].y + P[1].y) / 2;
  const amp = (P[0].y - P[1].y) / 2;
  return { dx, mid, amp };
}

const sineLine: ToolDef = {
  id: "sine_line",
  labelKey: "draw.tool.sine_line",
  points: 2,
  style: mkStyle(TEAL, 2),
  ui: { color: true, width: true, dash: true, fill: false, text: false },
  draw(ctx, env, d, P, st) {
    const { dx, mid, amp } = sineParams(P);
    if (Math.abs(dx) < 3) return;
    stroke(ctx, d, st);
    ctx.beginPath();
    for (let x = -4; x <= env.w + 4; x += 2) {
      const y = mid + amp * Math.cos((Math.PI * (x - P[0].x)) / dx);
      if (x === -4) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    guide(ctx, d);
    ctx.globalAlpha = 0.6;
    strokeSeg(ctx, P[0], P[1]);
  },
  hit(_env, _d, P, x, y) {
    const { dx, mid, amp } = sineParams(P);
    if (segHit(x, y, [P[0], P[1], "segment"])) return true;
    if (Math.abs(dx) < 3) return false;
    const arg = (Math.PI * (x - P[0].x)) / dx;
    const f = mid + amp * Math.cos(arg);
    const slope = (-amp * Math.PI * Math.sin(arg)) / dx;
    return Math.abs(y - f) / Math.sqrt(1 + slope * slope) <= TOL;
  },
};

export const CYCLE_TOOLS: ToolDef[] = [cyclicLines, timeCycles, sineLine];
