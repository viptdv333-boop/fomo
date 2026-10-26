import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, NumberParam, Params, SelectOption, SelectParam } from "./registry";
import { formatPrice } from "../format";
import { detectWolfe, lineAt, type WolfeOptions, type WolfePattern, type WolfeStatus } from "../analysis/wolfe";
import { isDark, langOf, place, pill, precisionOf, rgba, type Box } from "./patterns-def";

/* "Wolfe Waves (auto)": bullish and bearish five-point Wolfe waves from the zigzag swings (analysis/wolfe.ts): points 1-5, the converging
   1-3 / 2-4 lines extended, the sweet zone beyond the 1-3 line, the 1->4 target line (EPA) with the estimated arrival (ETA).
   A pattern whose point 5 is still forming is drawn in full colour, the finished ones are faded. This file is the parameter schema,
   the legend and the canvas painter. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;
const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

/* ───────────── texts ───────────── */

const idx3 = (locale: string) => (langOf(locale) === "ru" ? 0 : langOf(locale) === "zh" ? 2 : 1);

const NAMES: Record<"bull" | "bear", [string, string, string]> = {
  bull: ["Волна Вульфа ↑", "Wolfe wave ↑", "沃尔夫波浪 ↑"],
  bear: ["Волна Вульфа ↓", "Wolfe wave ↓", "沃尔夫波浪 ↓"],
};
const STATUS: Record<WolfeStatus, [string, string, string]> = {
  setup: ["ждём точку 5", "waiting for point 5", "等待第5点"],
  forming: ["точка 5 формируется", "point 5 forming", "第5点形成中"],
  complete: ["завершена", "complete", "已完成"],
  hit: ["цель достигнута", "target hit", "目标达成"],
  failed: ["не отработала", "failed", "失败"],
};
const WORDS: Record<string, [string, string, string]> = {
  epa: ["цель EPA", "EPA target", "目标 EPA"],
  none: ["волн Вульфа нет", "no Wolfe waves", "无沃尔夫波浪"],
  zone: ["зона", "sweet zone", "甜蜜区"],
};

export function wolfeName(dir: 1 | -1, locale: string): string {
  return NAMES[dir > 0 ? "bull" : "bear"][idx3(locale)];
}
export function wolfeStatusText(s: WolfeStatus, locale: string): string {
  return STATUS[s][idx3(locale)];
}
const word = (k: string, locale: string) => WORDS[k][idx3(locale)];

/** Not over yet: the pattern is still open (point 5 is coming or forming). */
export const isLive = (pt: WolfePattern) => pt.status === "setup" || pt.status === "forming";

/* ───────────── compute ───────────── */

interface Extra {
  patterns: WolfePattern[];
  prec: number;
}

function optionsOf(p: Params): Partial<WolfeOptions> {
  return {
    mode: S(p, "wfMode") === "pct" ? "pct" : "atr",
    devAtr: N(p, "wfDevAtr"),
    devPct: N(p, "wfDevPct"),
    tolAtr: N(p, "wfTol"),
    maxLegRatio: N(p, "wfLegRatio"),
    minBars: N(p, "wfMinBars"),
    maxBars: N(p, "wfMaxBars"),
    minConf: N(p, "wfMinConf"),
    bullish: B(p, "wfBull"),
    bearish: B(p, "wfBear"),
    maxShown: N(p, "wfMax"),
    window: N(p, "wfWindow"),
    showDone: B(p, "wfDone"),
  };
}

/* ───────────── painter ───────────── */

function paint(sc: SeriesContext, p: Params, res?: IndResult): void {
  const ex = res?.extra as Extra | undefined;
  if (!ex || ex.patterns.length === 0) return;
  const { ctx } = sc;
  const locale = sc.options.locale;
  const dark = isDark(sc.theme.bg);
  const cUp = S(p, "wfColUp");
  const cDown = S(p, "wfColDown");
  const cTarget = S(p, "wfColTarget");
  const cZone = S(p, "wfColZone");
  const showTarget = B(p, "wfTarget");
  const showZone = B(p, "wfZone");
  const showLines = B(p, "wfLines");
  const showNums = B(p, "wfNumbers");
  const showLabels = B(p, "wfLabels");
  const pw = sc.paneWidth;
  const ph = sc.paneHeight;
  const fontFamily = sc.options.fontFamily;
  const labelBg = dark ? "rgba(19,23,34,0.9)" : "rgba(255,255,255,0.94)";
  const labelFg = dark ? "#d1d4dc" : "#1f2937";
  const fmt = (v: number) => formatPrice(v, ex.prec, locale);
  const boxes: Box[] = [{ x: 0, y: 0, w: Math.min(pw * 0.62, 520), h: 72 }];

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const list = ex.patterns.slice().sort((a, b) => a.endIdx - b.endIdx);
  const tags: { x: number; y: number; text: string; col: string }[] = [];
  const labels: { pt: WolfePattern; x: number; y: number; col: string }[] = [];
  const numFont = `700 10px ${fontFamily}`;

  for (const pt of list) {
    const col = pt.dir > 0 ? cUp : cDown;
    const live = isLive(pt);
    const alpha = live ? 1 : pt.status === "failed" ? 0.38 : 0.55;
    const last = pt.pts[pt.pts.length - 1];
    const first = pt.pts[0];
    const x1 = sc.x(first.i);
    // the lines go on a bit to the right of the last point, never past the place where they meet
    const reach = Math.max(6, Math.round((last.i - first.i) * 0.28));
    const iEnd = Math.min(Math.round(pt.cross) - 1, last.i + reach);
    const targetEnd = pt.hitIdx >= 0 ? pt.hitIdx : pt.eta;
    const xFar = sc.x(Math.max(iEnd, showTarget ? targetEnd : iEnd));
    if (xFar < -20 || x1 > pw + 20) continue;
    const P = (i: number, v: number) => [sc.x(i), sc.y(v)] as const;
    const p2 = pt.pts[1];
    const p3 = pt.pts[2];
    const p4 = pt.pts[3];
    ctx.globalAlpha = alpha;

    // wedge body (between the 1-3 and the 2-4 line) and the sweet zone (beyond the 1-3 line)
    if (showLines) {
      ctx.fillStyle = rgba(col, dark ? 0.08 : 0.06);
      ctx.beginPath();
      ctx.moveTo(...P(first.i, first.p));
      ctx.lineTo(...P(iEnd, lineAt(pt.l13, iEnd)));
      ctx.lineTo(...P(iEnd, lineAt(pt.l24, iEnd)));
      ctx.lineTo(...P(p2.i, p2.p));
      ctx.closePath();
      ctx.fill();
    }
    if (showZone) {
      const z0 = p4.i;
      const off = -pt.dir * pt.zone;
      ctx.fillStyle = rgba(cZone, dark ? 0.16 : 0.12);
      ctx.beginPath();
      ctx.moveTo(...P(z0, lineAt(pt.l13, z0)));
      ctx.lineTo(...P(iEnd, lineAt(pt.l13, iEnd)));
      ctx.lineTo(...P(iEnd, lineAt(pt.l13, iEnd) + off));
      ctx.lineTo(...P(z0, lineAt(pt.l13, z0) + off));
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = rgba(cZone, 0.75);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...P(z0, lineAt(pt.l13, z0) + off));
      ctx.lineTo(...P(iEnd, lineAt(pt.l13, iEnd) + off));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // zigzag through the points
    ctx.strokeStyle = rgba(col, 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pt.pts.forEach((q, k) => (k === 0 ? ctx.moveTo(...P(q.i, q.p)) : ctx.lineTo(...P(q.i, q.p))));
    ctx.stroke();

    // the two converging lines: solid between their anchors, dotted where they are extended
    if (showLines) {
      const seg = (l: typeof pt.l13, a: number, b: number, dashed: boolean) => {
        ctx.setLineDash(dashed ? [2, 4] : []);
        ctx.strokeStyle = rgba(col, dashed ? 0.7 : 0.95);
        ctx.lineWidth = dashed ? 1.2 : 1.6;
        ctx.beginPath();
        ctx.moveTo(...P(a, lineAt(l, a)));
        ctx.lineTo(...P(b, lineAt(l, b)));
        ctx.stroke();
      };
      seg(pt.l13, first.i, p3.i, false);
      seg(pt.l13, p3.i, iEnd, true);
      seg(pt.l24, p2.i, p4.i, false);
      seg(pt.l24, p4.i, iEnd, true);
      ctx.setLineDash([]);
    }

    // target: the 1->4 line, dashed; the part after point 4 is the projection to EPA / ETA
    if (showTarget) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = rgba(cTarget, 0.55);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(...P(first.i, first.p));
      ctx.lineTo(...P(p4.i, lineAt(pt.l14, p4.i)));
      ctx.stroke();
      ctx.strokeStyle = rgba(cTarget, 0.95);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(...P(p4.i, p4.p));
      ctx.lineTo(...P(targetEnd, lineAt(pt.l14, targetEnd)));
      ctx.stroke();
      ctx.setLineDash([]);
      const [tx, ty] = P(targetEnd, lineAt(pt.l14, targetEnd));
      ctx.fillStyle = cTarget;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 5);
      ctx.lineTo(tx + 5, ty);
      ctx.lineTo(tx, ty + 5);
      ctx.lineTo(tx - 5, ty);
      ctx.closePath();
      ctx.fill();
      const price = lineAt(pt.l14, targetEnd);
      // the arrival is to the right of the visible area: the tag sits where the line leaves the pane
      const bw = sc.x(1) - sc.x(0);
      const clip = tx > pw - 8 && bw > 0;
      const tagY = clip ? sc.y(lineAt(pt.l14, (pw - 8 - sc.x(0)) / bw)) : ty;
      tags.push({ x: clip ? pw - 8 : tx, y: tagY, text: `${pt.hitIdx >= 0 ? "✓ " : "≈ "}${word("epa", locale)} ${fmt(price)}`, col: cTarget });
    }

    // numbered points
    for (const q of pt.pts) {
      const [qx, qy] = P(q.i, q.p);
      if (qx < -6 || qx > pw + 6) continue;
      const high = (q.n % 2 === 0) === (pt.dir > 0); // bullish: 2 and 4 are highs; bearish: 1, 3, 5
      ctx.beginPath();
      ctx.arc(qx, qy, q.confirmed ? 3.4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = q.confirmed ? col : sc.theme.bg;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col;
      ctx.stroke();
      if (showNums) {
        const cy = qy + (high ? -13 : 13);
        ctx.beginPath();
        ctx.arc(qx, cy, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = labelBg;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = rgba(col, 0.95);
        ctx.stroke();
        ctx.font = numFont;
        ctx.fillStyle = labelFg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(q.n), qx, cy + 0.5);
        boxes.push({ x: qx - 8, y: cy - 8, w: 16, h: 16 });
      }
    }
    ctx.globalAlpha = 1;
    if (showLabels) {
      const [lx, ly] = P(last.i, last.p);
      labels.push({ pt, x: lx, y: ly, col });
    }
  }

  // price tags (target) first, then the pattern labels around them
  const smallFont = `600 10px ${fontFamily}`;
  ctx.font = smallFont;
  for (const t of tags) {
    const w = Math.ceil(ctx.measureText(t.text).width) + 10;
    const h = 15;
    const b = place(boxes, w, h, Math.min(pw - w - 4, t.x + 8), t.y - h / 2, { w: pw, h: ph }, -1);
    boxes.push(b);
    sc.labelBoxes?.push(b);
    pill(ctx, b, t.text, { bg: labelBg, border: rgba(t.col, 0.85), fg: t.col, font: smallFont });
  }
  const labFont = `600 11px ${fontFamily}`;
  ctx.font = labFont;
  labels.sort((a, b) => b.pt.endIdx - a.pt.endIdx || b.pt.confidence - a.pt.confidence);
  for (const j of labels) {
    const pt = j.pt;
    const text = `${wolfeName(pt.dir, locale)} · ${wolfeStatusText(pt.status, locale)} · ${pt.confidence}%`;
    ctx.font = labFont;
    const w = Math.ceil(ctx.measureText(text).width) + 18;
    const h = 18;
    // the label sits on the outer side of the last point (below a low, above a high)
    const lastIsLow = (pt.pts[pt.pts.length - 1].n % 2 === 1) === (pt.dir > 0);
    const wantBelow = lastIsLow;
    let y = wantBelow ? j.y + 24 : j.y - h - 24;
    if (y < 3 || y + h > ph - 3) y = wantBelow ? j.y - h - 24 : j.y + 24;
    const b = place(boxes, w, h, j.x - w / 2, y, { w: pw, h: ph }, wantBelow ? 1 : -1);
    boxes.push(b);
    sc.labelBoxes?.push(b);
    ctx.globalAlpha = isLive(pt) ? 1 : 0.8;
    pill(ctx, b, text, { bg: labelBg, border: rgba(j.col, 0.9), fg: labelFg, font: labFont, dot: isLive(pt) ? j.col : undefined });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ───────────── definition ───────────── */

const MODES: SelectOption[] = [
  { value: "atr", label: "ind.wf.o.atr" },
  { value: "pct", label: "ind.wf.o.pct" },
];

export const wolfeDef: IndicatorDef = {
  id: "wolfe",
  category: "patterns",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "wolfe wave wolf waves pattern 1-5 epa eta sweet zone target converging wedge pattern reversal волны вульфа волна вульфа вулфа паттерн паттерны фигура разворот цель",
  params: [
    bool("wfBull", true),
    bool("wfBear", true),
    sel("wfMode", "atr", MODES),
    num("wfDevAtr", 2, 0.5, 10, 0.1),
    num("wfDevPct", 1, 0.1, 20, 0.1),
    num("wfTol", 0.3, 0, 2, 0.05),
    num("wfLegRatio", 6, 2, 20, 0.5),
    num("wfMinBars", 12, 6, 200),
    num("wfMaxBars", 400, 20, 2000),
    num("wfMinConf", 50, 0, 100),
    num("wfMax", 3, 1, 10),
    num("wfWindow", 1500, 100, 20000),
    bool("wfDone", true),
    bool("wfTarget", true),
    bool("wfZone", true),
    bool("wfLines", true),
    bool("wfNumbers", true),
    bool("wfLabels", true),
    col("wfColUp", "#26a69a"),
    col("wfColDown", "#ef5350"),
    col("wfColTarget", "#f0b90b"),
    col("wfColZone", "#5c9ded"),
  ],
  styleParams: ["wfColUp", "wfColDown", "wfColTarget", "wfColZone"],
  title: (p) => `Wolfe ${S(p, "wfMode") === "pct" ? `${N(p, "wfDevPct")}%` : `ATR${N(p, "wfDevAtr")}`} ≥${N(p, "wfMinConf")}%`,
  compute(cs, p) {
    if (cs.length < 40) return { plots: [], extra: { patterns: [], prec: 2 } satisfies Extra };
    let patterns: WolfePattern[] = [];
    try {
      patterns = detectWolfe(cs, optionsOf(p));
    } catch {
      patterns = [];
    }
    return { plots: [], extra: { patterns, prec: precisionOf(cs) } satisfies Extra };
  },
  drawExtra(sc, p, res) {
    paint(sc, p, res);
  },
  alertLevels(res) {
    const ex = res.extra as Extra | undefined;
    if (!ex) return [];
    // the target of the open patterns and of the freshest finished one
    return ex.patterns.filter((q) => q.status !== "hit" && q.status !== "failed").slice(-2).map((q) => q.epa);
  },
  legendItems(res, p, locale) {
    const ex = res.extra as Extra | undefined;
    const out: { text: string; color: string }[] = [];
    if (!ex) return out;
    const fmt = (v: number) => formatPrice(v, ex.prec, locale);
    const sorted = ex.patterns.slice().sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.endIdx - a.endIdx);
    for (const pt of sorted.slice(0, 3)) {
      let text = `${wolfeName(pt.dir, locale)} · ${wolfeStatusText(pt.status, locale)} · ${pt.confidence}%`;
      if (pt.status !== "failed" && pt.status !== "hit") text += ` · ${word("epa", locale)} ${fmt(pt.epa)}`;
      out.push({ text, color: pt.dir > 0 ? S(p, "wfColUp") : S(p, "wfColDown") });
    }
    if (sorted.length > 3) out.push({ text: `+${sorted.length - 3}`, color: S(p, "wfColZone") });
    if (sorted.length === 0) out.push({ text: word("none", locale), color: S(p, "wfColZone") });
    return out;
  },
};

export const WOLFE_DEFS: IndicatorDef[] = [wolfeDef];
