import type { Env, HandleDef } from "./tools";
import type { DPoint, Pt } from "./types";

/** Screen-space geometry matters on logarithmic scales and on indicator panes. */
function point(env: Env, p: Pt): DPoint {
  return { t: env.timeAt(p.x), p: env.priceAt(p.y) };
}

export function boxSideHandles(P: Pt[]): HandleDef[] {
  const [a, b] = P;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return [
    { x: mx, y: a.y, drag: (pts, _t, p) => { pts[0].p = p; } },
    { x: b.x, y: my, drag: (pts, t) => { pts[1].t = t; } },
    { x: mx, y: b.y, drag: (pts, _t, p) => { pts[1].p = p; } },
    { x: a.x, y: my, drag: (pts, t) => { pts[0].t = t; } },
  ];
}

/** Move just the two endpoints of a side, perpendicular to it; all other vertices stay fixed. */
export function polygonSideHandles(env: Env, P: Pt[]): HandleDef[] {
  return P.slice(0, P.length > 2 ? P.length : 1).flatMap((a, i) => {
    const j = (i + 1) % P.length, b = P[j];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) return [];
    const n = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    return [{ x, y, drag: (pts: DPoint[], t: number, p: number) => {
      const delta = (env.toX(t) - x) * n.x + (env.toY(p) - y) * n.y;
      for (const k of [i, j]) pts[k] = point(env, { x: P[k].x + n.x * delta, y: P[k].y + n.y * delta });
    } }];
  });
}

/** A rotated rectangle keeps its angle and opposite side when one of its four sides moves. */
export function rotatedSideHandles(env: Env, P: Pt[], corners: Pt[]): HandleDef[] {
  return corners.map((a, i) => {
    const b = corners[(i + 1) % 4];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const n = length > 0 ? { x: -(b.y - a.y) / length, y: (b.x - a.x) / length } : { x: 0, y: 0 };
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    return { x, y, drag: (pts: DPoint[], t: number, p: number) => {
      const delta = (env.toX(t) - x) * n.x + (env.toY(p) - y) * n.y;
      // Anchor 2 determines the far side's distance from the base, not its angle.
      const indexes = i === 0 ? [0, 1] : i === 1 ? [1] : i === 2 ? [2] : [0];
      for (const k of indexes) pts[k] = point(env, { x: P[k].x + n.x * delta, y: P[k].y + n.y * delta });
    } };
  });
}

/** Resize a circle by a cardinal edge while keeping the opposite edge fixed and the shape circular. */
export function circleSideHandles(env: Env, P: Pt[]): HandleDef[] {
  const radius = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y);
  return [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }].map((axis) => {
    const fixed = { x: P[0].x - axis.x * radius, y: P[0].y - axis.y * radius };
    return { x: P[0].x + axis.x * radius, y: P[0].y + axis.y * radius,
      drag: (pts: DPoint[], t: number, p: number) => {
        const diameter = (env.toX(t) - fixed.x) * axis.x + (env.toY(p) - fixed.y) * axis.y;
        const center = { x: fixed.x + axis.x * diameter / 2, y: fixed.y + axis.y * diameter / 2 };
        pts[0] = point(env, center);
        pts[1] = point(env, { x: center.x + Math.abs(diameter) / 2, y: center.y });
      },
    };
  });
}
