import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, NumberParam, Params, SelectOption, SelectParam } from "./registry";
import { formatPrice } from "../format";
import { detectHarmonics, harmonicLive, HARMONIC_TYPES, type HarmonicOptions, type HarmonicPattern, type HarmonicPoint, type HarmonicStatus, type HarmonicType } from "../analysis/harmonics";
import { isDark, langOf, place, pill, precisionOf, rgba, type Box } from "./patterns-def";

/* "Harmonic Patterns (auto)": AB=CD, Gartley, Bat, Butterfly, Crab, Deep Crab, Shark and Cypher, bullish and bearish, from the zigzag
   swings (analysis/harmonics.ts). Drawn the classic way: the two filled triangles X-A-B and B-C-D, the dashed connectors with the
   Fibonacci ratios written on them, the potential reversal zone (PRZ) as a box at D, two targets and the invalidation level.
   A pattern whose D is still ahead is drawn with a dashed C-D leg to the projected D; the finished ones are faded.
   This file is the parameter schema, the legend and the canvas painter. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;
const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

/* ───────────── texts ───────────── */

const idx3 = (locale: string) => (langOf(locale) === "ru" ? 0 : langOf(locale) === "zh" ? 2 : 1);

const NAMES: Record<HarmonicType, [string, string, string]> = {
  abcd: ["AB=CD", "AB=CD", "AB=CD"],
  gartley: ["Гартли", "Gartley", "加特利"],
  bat: ["Летучая мышь", "Bat", "蝙蝠"],
  butterfly: ["Бабочка", "Butterfly", "蝴蝶"],
  crab: ["Краб", "Crab", "螃蟹"],
  deep_crab: ["Глубокий краб", "Deep Crab", "深海螃蟹"],
  shark: ["Акула", "Shark", "鲨鱼"],
  cypher: ["Сайфер", "Cypher", "赛福"],
};
const STATUS: Record<HarmonicStatus, [string, string, string]> = {
  forming: ["формируется, D впереди", "forming, D ahead", "形成中，D 点未到"],
  prz: ["цена в PRZ", "price in the PRZ", "价格位于 PRZ"],
  complete: ["завершён", "complete", "已完成"],
  target: ["цель достигнута", "target hit", "目标达成"],
  failed: ["отменён", "invalidated", "已失效"],
};
const WORDS: Record<string, [string, string, string]> = {
  t1: ["цель 1", "target 1", "目标1"],
  t2: ["цель 2", "target 2", "目标2"],
  stop: ["отмена", "invalidation", "失效位"],
  none: ["гармонических паттернов нет", "no harmonic patterns", "无谐波形态"],
};

const PARAM_OF: Record<HarmonicType, string> = {
  abcd: "hmAbcd",
  gartley: "hmGartley",
  bat: "hmBat",
  butterfly: "hmButterfly",
  crab: "hmCrab",
  deep_crab: "hmDeepCrab",
  shark: "hmShark",
  cypher: "hmCypher",
};

/** "Gartley ↑": the arrow is the direction of the expected move. */
export function harmonicName(type: HarmonicType, dir: 1 | -1, locale: string): string {
  return `${NAMES[type][idx3(locale)]} ${dir > 0 ? "↑" : "↓"}`;
}
export function harmonicStatusText(s: HarmonicStatus, locale: string): string {
  return STATUS[s][idx3(locale)];
}
const word = (k: string, locale: string) => WORDS[k][idx3(locale)];
/** 0.618, 1.27, 2: three decimals at most, no trailing zeros. */
const ratioText = (v: number) => String(Math.round(v * 1000) / 1000);

/* ───────────── compute ───────────── */

interface Extra {
  patterns: HarmonicPattern[];
  prec: number;
  lastIdx: number;
}

function optionsOf(p: Params): Partial<HarmonicOptions> {
  const enabled: Partial<Record<HarmonicType, boolean>> = {};
  for (const t of HARMONIC_TYPES) enabled[t] = B(p, PARAM_OF[t]);
  return {
    mode: S(p, "hmMode") === "pct" ? "pct" : "atr",
    devAtr: N(p, "hmDevAtr"),
    devPct: N(p, "hmDevPct"),
    tol: N(p, "hmTol") / 100,
    maxSkip: N(p, "hmSkip"),
    minBars: N(p, "hmMinBars"),
    maxBars: N(p, "hmMaxBars"),
    minConf: N(p, "hmMinConf"),
    bullish: B(p, "hmBull"),
    bearish: B(p, "hmBear"),
    enabled,
    forming: B(p, "hmForming"),
    showDone: B(p, "hmDone"),
    maxShown: N(p, "hmMax"),
    window: N(p, "hmWindow"),
    maxAge: N(p, "hmMaxAge"),
  };
}

/* ───────────── painter ───────────── */

function paint(sc: SeriesContext, p: Params, res?: IndResult): void {
  const ex = res?.extra as Extra | undefined;
  if (!ex || ex.patterns.length === 0) return;
  const { ctx } = sc;
  const locale = sc.options.locale;
  const dark = isDark(sc.theme.bg);
  const cUp = S(p, "hmColUp");
  const cDown = S(p, "hmColDown");
  const cPrz = S(p, "hmColPrz");
  const cStop = S(p, "hmColStop");
  const showFill = B(p, "hmFill");
  const showRatios = B(p, "hmRatios");
  const showPrz = B(p, "hmPrz");
  const showTargets = B(p, "hmTargets");
  const showStop = B(p, "hmStop");
  const showLabels = B(p, "hmLabels");
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
  const ratios: { x: number; y: number; text: string; col: string; alpha: number }[] = [];
  const labels: { pt: HarmonicPattern; x: number; y: number; col: string }[] = [];
  const letterFont = `700 11px ${fontFamily}`;
  const smallFont = `600 10px ${fontFamily}`;

  for (const pt of list) {
    const col = pt.dir > 0 ? cUp : cDown;
    const live = harmonicLive(pt);
    const alpha = live ? 1 : pt.status === "failed" ? 0.38 : 0.55;
    const first = pt.pts[0];
    const d = pt.pts[pt.pts.length - 1];
    const len = Math.max(4, d.i - first.i);
    // how far the levels run to the right of D
    const lvlEnd = pt.failIdx >= 0 ? pt.failIdx : pt.t2Idx >= 0 ? pt.t2Idx : Math.max(d.i + Math.round(len * 0.4), ex.lastIdx + 4);
    if (sc.x(Math.max(lvlEnd, pt.prz.i1)) < -20 || sc.x(first.i) > pw + 20) continue;
    const P = (q: { i: number; p: number }) => [sc.x(q.i), sc.y(q.p)] as const;
    const by = (l: string) => pt.pts.find((q) => q.label === l);
    ctx.globalAlpha = alpha;

    // the two triangles: X-A-B and B-C-D (A-B-C and B-C-D for AB=CD)
    if (showFill) {
      const n = pt.pts.length;
      const tris: HarmonicPoint[][] = [pt.pts.slice(0, 3), pt.pts.slice(n - 3)];
      ctx.fillStyle = rgba(col, dark ? 0.16 : 0.12);
      for (const tr of n === 4 ? tris.slice(1) : tris) {
        ctx.beginPath();
        tr.forEach((q, k) => (k === 0 ? ctx.moveTo(...P(q)) : ctx.lineTo(...P(q))));
        ctx.closePath();
        ctx.fill();
      }
    }

    // PRZ: the box at D
    if (showPrz) {
      const x0 = sc.x(pt.prz.i0);
      const x1 = sc.x(pt.prz.i1);
      const y0 = sc.y(pt.prz.hi);
      const y1 = sc.y(pt.prz.lo);
      const h = Math.max(2, y1 - y0);
      ctx.fillStyle = rgba(cPrz, dark ? 0.2 : 0.16);
      ctx.fillRect(x0, y0, x1 - x0, h);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = rgba(cPrz, 0.9);
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, x1 - x0, h);
      ctx.setLineDash([]);
      if (live) tags.push({ x: x1, y: (y0 + y0 + h) / 2, text: `PRZ ${fmt(pt.prz.lo)} – ${fmt(pt.prz.hi)}`, col: cPrz });
    }

    // dashed connectors (X-B, A-C, B-D, X-D) with the ratios
    if (showRatios) {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = rgba(col, 0.6);
      ctx.lineWidth = 1;
      for (const r of pt.ratios) {
        const a = by(r.a);
        const b = by(r.b);
        if (!a || !b) continue;
        const [ax, ay] = P(a);
        const [bx, by2] = P(b);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by2);
        ctx.stroke();
        ratios.push({ x: (ax + bx) / 2, y: (ay + by2) / 2, text: (r.projected ? "→ " : "") + ratioText(r.value), col, alpha });
      }
      ctx.setLineDash([]);
    }

    // legs; the one to a projected D is dashed
    ctx.strokeStyle = rgba(col, 0.95);
    ctx.lineWidth = 1.6;
    for (let k = 1; k < pt.pts.length; k++) {
      const proj = !!pt.pts[k].projected;
      ctx.setLineDash(proj ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(...P(pt.pts[k - 1]));
      ctx.lineTo(...P(pt.pts[k]));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // targets and invalidation
    const level = (v: number, c: string, dash: number[], text: string, doneAt: number) => {
      const xa = sc.x(d.i);
      const xb = sc.x(doneAt >= 0 ? doneAt : lvlEnd);
      const y = sc.y(v);
      ctx.setLineDash(dash);
      ctx.strokeStyle = rgba(c, 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(xa, y);
      ctx.lineTo(xb, y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (pt.status !== "failed") tags.push({ x: Math.min(xb, pw - 8), y, text: `${doneAt >= 0 ? "✓ " : ""}${text} ${fmt(v)}`, col: c });
    };
    if (showTargets) {
      level(pt.t1, col, [6, 4], word("t1", locale), pt.t1Idx);
      level(pt.t2, col, [6, 4], word("t2", locale), pt.t2Idx);
    }
    if (showStop && pt.status !== "target") level(pt.stop, cStop, [2, 3], word("stop", locale), -1);

    // points and their letters
    pt.pts.forEach((q, k) => {
      const [qx, qy] = P(q);
      if (qx < -8 || qx > pw + 8) return;
      // bullish: X, B, D are lows (A, C lows for the four-point AB=CD run A-B-C-D: A high, B low, C high, D low)
      const fromEnd = pt.pts.length - 1 - k;
      const low = (fromEnd % 2 === 0) === (pt.dir > 0);
      ctx.beginPath();
      ctx.arc(qx, qy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = q.confirmed ? col : sc.theme.bg;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col;
      ctx.stroke();
      if (showLabels) {
        const cy = qy + (low ? 13 : -13);
        ctx.font = letterFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = labelBg;
        ctx.strokeText(q.label, qx, cy);
        ctx.fillStyle = col;
        ctx.fillText(q.label, qx, cy);
        boxes.push({ x: qx - 7, y: cy - 7, w: 14, h: 14 });
      }
    });
    ctx.globalAlpha = 1;
    if (showLabels) {
      const [lx, ly] = P(d);
      labels.push({ pt, x: lx, y: ly, col });
    }
  }

  // ratios on the connectors
  ctx.font = smallFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of ratios) {
    if (r.x < -30 || r.x > pw + 30) continue;
    const w = Math.ceil(ctx.measureText(r.text).width) + 8;
    ctx.globalAlpha = r.alpha;
    ctx.fillStyle = labelBg;
    ctx.fillRect(r.x - w / 2, r.y - 7, w, 14);
    ctx.fillStyle = r.col;
    ctx.fillText(r.text, r.x, r.y + 0.5);
    boxes.push({ x: r.x - w / 2, y: r.y - 7, w, h: 14 });
  }
  ctx.globalAlpha = 1;

  // price tags, then the pattern labels around them
  for (const t of tags) {
    ctx.font = smallFont;
    const w = Math.ceil(ctx.measureText(t.text).width) + 10;
    const h = 15;
    const b = place(boxes, w, h, Math.min(pw - w - 4, t.x + 6), t.y - h / 2, { w: pw, h: ph }, -1);
    boxes.push(b);
    sc.labelBoxes?.push(b);
    pill(ctx, b, t.text, { bg: labelBg, border: rgba(t.col, 0.85), fg: t.col, font: smallFont });
  }
  const labFont = `600 11px ${fontFamily}`;
  labels.sort((a, b) => b.pt.endIdx - a.pt.endIdx || b.pt.confidence - a.pt.confidence);
  for (const j of labels) {
    const pt = j.pt;
    const text = `${harmonicName(pt.type, pt.dir, locale)} · ${harmonicStatusText(pt.status, locale)} · ${pt.confidence}%`;
    ctx.font = labFont;
    const w = Math.ceil(ctx.measureText(text).width) + 18;
    const h = 18;
    // on the outer side of D: below a low (bullish), above a high (bearish)
    const below = pt.dir > 0;
    let y = below ? j.y + 24 : j.y - h - 24;
    if (y < 3 || y + h > ph - 3) y = below ? j.y - h - 24 : j.y + 24;
    const b = place(boxes, w, h, j.x - w / 2, y, { w: pw, h: ph }, below ? 1 : -1);
    boxes.push(b);
    sc.labelBoxes?.push(b);
    const live = harmonicLive(pt);
    ctx.globalAlpha = live ? 1 : 0.8;
    pill(ctx, b, text, { bg: labelBg, border: rgba(j.col, 0.9), fg: labelFg, font: labFont, dot: live ? j.col : undefined });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ───────────── definition ───────────── */

const MODES: SelectOption[] = [
  { value: "atr", label: "ind.hm.o.atr" },
  { value: "pct", label: "ind.hm.o.pct" },
];

export const harmonicDef: IndicatorDef = {
  id: "harmonic_auto",
  category: "patterns",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "harmonic patterns xabcd abcd ab=cd gartley bat butterfly crab deep crab shark cypher prz potential reversal zone fibonacci ratios carney pesavento гармонические паттерны гармоники гартли летучая мышь бабочка краб глубокий краб акула сайфер фибоначчи зона разворота паттерн паттерны фигура разворот",
  params: [
    bool("hmBull", true),
    bool("hmBear", true),
    bool("hmAbcd", true),
    bool("hmGartley", true),
    bool("hmBat", true),
    bool("hmButterfly", true),
    bool("hmCrab", true),
    bool("hmDeepCrab", true),
    bool("hmShark", true),
    bool("hmCypher", true),
    sel("hmMode", "atr", MODES),
    num("hmDevAtr", 2, 0.5, 10, 0.1),
    num("hmDevPct", 1, 0.1, 20, 0.1),
    num("hmTol", 5, 1, 15, 0.5),
    num("hmSkip", 2, 0, 3),
    num("hmMinBars", 12, 6, 200),
    num("hmMaxBars", 400, 20, 2000),
    num("hmMinConf", 60, 0, 100),
    bool("hmForming", true),
    bool("hmDone", true),
    num("hmMax", 4, 1, 12),
    num("hmWindow", 1500, 100, 20000),
    num("hmMaxAge", 150, 10, 2000),
    bool("hmFill", true),
    bool("hmRatios", true),
    bool("hmPrz", true),
    bool("hmTargets", true),
    bool("hmStop", true),
    bool("hmLabels", true),
    col("hmColUp", "#26a69a"),
    col("hmColDown", "#ef5350"),
    col("hmColPrz", "#f0b90b"),
    col("hmColStop", "#9598a1"),
  ],
  styleParams: ["hmColUp", "hmColDown", "hmColPrz", "hmColStop"],
  title: (p) => `Harmonic ${S(p, "hmMode") === "pct" ? `${N(p, "hmDevPct")}%` : `ATR${N(p, "hmDevAtr")}`} ±${N(p, "hmTol")}%`,
  compute(cs, p) {
    if (cs.length < 40) return { plots: [], extra: { patterns: [], prec: 2, lastIdx: cs.length - 1 } satisfies Extra };
    let patterns: HarmonicPattern[] = [];
    try {
      patterns = detectHarmonics(cs, optionsOf(p));
    } catch {
      patterns = [];
    }
    return { plots: [], extra: { patterns, prec: precisionOf(cs), lastIdx: cs.length - 1 } satisfies Extra };
  },
  drawExtra(sc, p, res) {
    paint(sc, p, res);
  },
  alertLevels(res) {
    const ex = res.extra as Extra | undefined;
    if (!ex) return [];
    // D of the patterns that are still on their way to it, the first target of the completed ones
    return ex.patterns
      .filter(harmonicLive)
      .slice(0, 2)
      .map((q) => (q.status === "forming" ? q.d : q.t1));
  },
  legendItems(res, p, locale) {
    const ex = res.extra as Extra | undefined;
    const out: { text: string; color: string }[] = [];
    if (!ex) return out;
    const fmt = (v: number) => formatPrice(v, ex.prec, locale);
    const sorted = ex.patterns.slice().sort((a, b) => Number(harmonicLive(b)) - Number(harmonicLive(a)) || b.endIdx - a.endIdx);
    for (const pt of sorted.slice(0, 3)) {
      let text = `${harmonicName(pt.type, pt.dir, locale)} · ${harmonicStatusText(pt.status, locale)} · ${pt.confidence}%`;
      if (harmonicLive(pt)) {
        if (pt.status !== "complete") text += ` · PRZ ${fmt(pt.prz.lo)} – ${fmt(pt.prz.hi)}`;
        text += ` · ${word("t1", locale)} ${fmt(pt.t1)} · ${word("t2", locale)} ${fmt(pt.t2)} · ${word("stop", locale)} ${fmt(pt.stop)}`;
      }
      out.push({ text, color: pt.dir > 0 ? S(p, "hmColUp") : S(p, "hmColDown") });
    }
    if (sorted.length > 3) out.push({ text: `+${sorted.length - 3}`, color: S(p, "hmColPrz") });
    if (sorted.length === 0) out.push({ text: word("none", locale), color: S(p, "hmColPrz") });
    return out;
  },
};

export const HARMONIC_DEFS: IndicatorDef[] = [harmonicDef];
