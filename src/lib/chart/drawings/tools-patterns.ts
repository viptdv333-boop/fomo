import * as G from "./geometry";
import {
  BLUE,
  GREEN,
  ORANGE,
  PURPLE,
  RED,
  TEAL,
  UI_SHAPE,
  fillPoly,
  guide,
  mkStyle,
  opt,
  polyHit,
  ratioBadge,
  ratioText,
  segHit,
  stroke,
  strokeMode,
  strokePoly,
  strokeSeg,
  tx,
  vertexLabel,
  type Pt,
  type ToolDef,
} from "./tools-kit";

/* Chart patterns (harmonic, head and shoulders, three drives) and Elliott waves. */

interface Ratio {
  /** Badge is shown at the middle of anchors [i, j]. */
  at: [number, number];
  /** value = |p[num[1]] - p[num[0]]| / |p[den[1]] - p[den[0]]| (prices) */
  num: [number, number];
  den: [number, number];
}

interface PatSpec {
  id: string;
  n: number;
  color: string;
  labels: string[] | (() => string[]);
  circled?: boolean;
  fills?: number[][];
  guides?: [number, number][];
  ratios?: Ratio[];
  /** Extra painting / geometry: returns extra hit polylines. */
  extra?: (ctx: CanvasRenderingContext2D, env: Parameters<ToolDef["draw"]>[1], d: Parameters<ToolDef["draw"]>[2], P: Pt[], st: Parameters<ToolDef["draw"]>[4]) => void;
  extraHit?: (P: Pt[], x: number, y: number) => boolean;
}

function patternTool(s: PatSpec): ToolDef {
  const labelsOf = () => (typeof s.labels === "function" ? s.labels() : s.labels);
  return {
    id: s.id,
    labelKey: `draw.tool.${s.id}`,
    points: s.n,
    style: mkStyle(s.color, 2, "solid", { fill: s.color, fillOpacity: 0.12 }),
    ui: UI_SHAPE,
    draw(ctx, env, d, P, st) {
      (s.fills ?? []).forEach((idx) => fillPoly(ctx, d, idx.map((i) => P[i])));
      s.extra?.(ctx, env, d, P, st);
      if (s.guides) {
        guide(ctx, d);
        s.guides.forEach(([i, j]) => strokeSeg(ctx, P[i], P[j]));
      }
      stroke(ctx, d, st);
      ctx.setLineDash([]);
      strokePoly(ctx, P);
      if (opt(d, "showRatios", true)) (s.ratios ?? []).forEach((r) => {
        const den = Math.abs(d.points[r.den[1]].p - d.points[r.den[0]].p);
        if (den <= 0) return;
        const v = Math.abs(d.points[r.num[1]].p - d.points[r.num[0]].p) / den;
        ratioBadge(ctx, env, G.mid(P[r.at[0]], P[r.at[1]]), ratioText(v), d.style.color);
      });
      const labels = opt(d, "showLabels", true) ? labelsOf() : [];
      labels.forEach((l, i) => {
        if (P[i]) vertexLabel(ctx, env, P, i, l, d.style.color, s.circled);
      });
    },
    hit(_env, _d, P, x, y) {
      if (polyHit(x, y, P)) return true;
      for (const g of s.guides ?? []) if (segHit(x, y, [P[g[0]], P[g[1]], "segment"])) return true;
      for (const f of s.fills ?? []) if (G.pointInPolygon({ x, y }, f.map((i) => P[i]))) return true;
      return s.extraHit ? s.extraHit(P, x, y) : false;
    },
  };
}

/* ───────────── harmonic & classic patterns ───────────── */

const xabcd = patternTool({
  id: "xabcd",
  n: 5,
  color: BLUE,
  labels: ["X", "A", "B", "C", "D"],
  fills: [
    [0, 1, 2],
    [2, 3, 4],
  ],
  guides: [
    [0, 2],
    [1, 3],
    [2, 4],
    [0, 4],
  ],
  ratios: [
    { at: [0, 2], num: [1, 2], den: [0, 1] },
    { at: [1, 3], num: [2, 3], den: [1, 2] },
    { at: [2, 4], num: [3, 4], den: [2, 3] },
    { at: [0, 4], num: [1, 4], den: [0, 1] },
  ],
});

const cypher = patternTool({
  id: "cypher",
  n: 5,
  color: PURPLE,
  labels: ["X", "A", "B", "C", "D"],
  fills: [
    [0, 1, 2],
    [2, 3, 4],
  ],
  guides: [
    [0, 2],
    [0, 3],
    [2, 4],
  ],
  ratios: [
    { at: [0, 2], num: [1, 2], den: [0, 1] },
    { at: [0, 3], num: [0, 3], den: [0, 1] },
    { at: [2, 4], num: [3, 4], den: [0, 3] },
  ],
});

const abcd = patternTool({
  id: "abcd",
  n: 4,
  color: GREEN,
  labels: ["A", "B", "C", "D"],
  fills: [[0, 1, 2, 3]],
  guides: [
    [0, 2],
    [1, 3],
  ],
  ratios: [
    { at: [0, 2], num: [1, 2], den: [0, 1] },
    { at: [1, 3], num: [2, 3], den: [1, 2] },
  ],
});

/** Intersection of lines a1-a2 and b1-b2, or null when parallel. */
function intersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

function apexOf(P: Pt[], u1: number, u2: number, l1: number, l2: number): Pt | null {
  const x = intersect(P[u1], P[u2], P[l1], P[l2]);
  if (!x) return null;
  const last = Math.max(P[u2].x, P[l2].x);
  return x.x > last + 1 ? x : null;
}

const trianglePattern = patternTool({
  id: "triangle_pattern",
  n: 4,
  color: ORANGE,
  labels: ["A", "B", "C", "D"],
  extra(ctx, _env, d, P, st) {
    const apex = apexOf(P, 0, 2, 1, 3);
    fillPoly(ctx, d, apex ? [P[0], P[2], apex, P[3], P[1]] : [P[0], P[2], P[3], P[1]]);
    stroke(ctx, d, st, undefined, "dashed");
    ctx.lineWidth = Math.max(1, d.style.width - 0.5);
    strokeSeg(ctx, P[0], apex ?? P[2]);
    strokeSeg(ctx, P[1], apex ?? P[3]);
  },
  extraHit(P, x, y) {
    const apex = apexOf(P, 0, 2, 1, 3);
    return segHit(x, y, [P[0], apex ?? P[2], "segment"], [P[1], apex ?? P[3], "segment"]);
  },
});

const headShoulders = patternTool({
  id: "head_shoulders",
  n: 7,
  color: RED,
  labels: () => ["", tx("draw.txt.leftShoulder"), "", tx("draw.txt.head"), "", tx("draw.txt.rightShoulder"), ""],
  fills: [[2, 3, 4]],
  extra(ctx, env, d, P) {
    // neckline through the two troughs, continued to the right
    ctx.save();
    ctx.strokeStyle = d.style.color;
    ctx.lineWidth = Math.max(1, d.style.width);
    ctx.setLineDash([6, 4]);
    strokeMode(ctx, env, P[2], P[4], "line");
    ctx.restore();
  },
  extraHit: (P, x, y) => segHit(x, y, [P[2], P[4], "line"]),
});

const threeDrives = patternTool({
  id: "three_drives",
  n: 7,
  color: TEAL,
  circled: true,
  labels: ["", "1", "A", "2", "B", "3", "C"],
  guides: [
    [1, 3],
    [3, 5],
    [2, 4],
    [4, 6],
  ],
  ratios: [
    { at: [1, 2], num: [1, 2], den: [0, 1] },
    { at: [2, 3], num: [2, 3], den: [1, 2] },
    { at: [3, 4], num: [3, 4], den: [2, 3] },
    { at: [4, 5], num: [4, 5], den: [3, 4] },
  ],
});

/* ───────────── Elliott waves ───────────── */

const impulse = patternTool({ id: "elliott_impulse", n: 6, color: BLUE, circled: true, labels: ["", "1", "2", "3", "4", "5"] });
const correction = patternTool({ id: "elliott_correction", n: 4, color: GREEN, circled: true, labels: ["", "A", "B", "C"] });
const triangleWave = patternTool({
  id: "elliott_triangle",
  n: 6,
  color: ORANGE,
  circled: true,
  labels: ["", "A", "B", "C", "D", "E"],
  guides: [
    [1, 3],
    [3, 5],
    [2, 4],
  ],
});
const doubleCombo = patternTool({ id: "elliott_double", n: 4, color: PURPLE, circled: true, labels: ["", "W", "X", "Y"] });
const tripleCombo = patternTool({ id: "elliott_triple", n: 6, color: TEAL, circled: true, labels: ["", "W", "X", "Y", "X", "Z"] });

export const PATTERN_TOOLS: ToolDef[] = [xabcd, cypher, headShoulders, abcd, trianglePattern, threeDrives, impulse, correction, triangleWave, doubleCombo, tripleCombo];
