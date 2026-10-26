import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, NumberParam, Params, SelectOption, SelectParam } from "./registry";
import { CANDLE_BY_ID, CANDLE_DISCLAIMER, CANDLE_META, MAIN_IDS, type CandleBias, type CandleId } from "../analysis/candle-meta";
import { DEFAULT_CANDLES, detectCandles, type CandleHit, type CandleOptions } from "../analysis/candles";
import { isDark, langOf, rgba } from "./patterns-def";

/* "Candlestick patterns (classic)": single, two, three and five candle patterns from OHLC only (analysis/candles.ts; the catalogue with names
   and meanings in analysis/candle-meta.ts). A small marker (arrow below a bullish, above a bearish pattern, a dot for neutral ones) with an
   optional short / full label, a thin box over the candles of a multi-candle pattern. The legend row follows the crosshair: the pattern on
   the bar under it, its meaning and reliability in the tooltip of the row. This file is the parameter schema, the legend and the painter. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;
const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

const idx3 = (locale: string) => (langOf(locale) === "ru" ? 0 : langOf(locale) === "zh" ? 2 : 1);

/* ───────────── texts ───────────── */

const WORDS = {
  count: ["Паттернов", "Patterns", "形态数"],
  none: ["паттернов нет", "no patterns", "无形态"],
  strength: ["Надёжность", "Reliability", "可靠度"],
  how: [
    "размер к ATR - 40%, объём к среднему - 30%, положение у экстремума последних 20 баров - 30%",
    "size vs ATR 40%, volume vs average 30%, position at the extreme of the last 20 bars 30%",
    "相对 ATR 的大小 40%、相对均量的成交量 30%、处于近 20 根极值位置 30%",
  ],
  also: ["Также на этой свече", "Also on this bar", "同一根K线还有"],
  forming: ["свеча формируется", "bar is forming", "K线形成中"],
  candles: ["свечи", "candles", "根K线"],
  nobar: ["На этой свече паттерна нет.", "No pattern on this bar.", "这根K线上没有形态。"],
} as const;
const w = (k: keyof typeof WORDS, locale: string) => WORDS[k][idx3(locale)];

export function candleName(id: CandleId, locale: string): string {
  return CANDLE_BY_ID[id].name[idx3(locale)];
}
export function candleShort(id: CandleId, locale: string): string {
  return CANDLE_BY_ID[id].short[idx3(locale)];
}
export function candleDesc(id: CandleId, locale: string): string {
  return CANDLE_BY_ID[id].desc[idx3(locale)];
}

/* ───────────── options ───────────── */

/** Ids switched on by the parameters (preset "main" / "all" override the checklist). */
export function enabledIds(p: Params): CandleId[] {
  const preset = S(p, "cpPreset");
  if (preset === "main") return MAIN_IDS.slice();
  if (preset === "all") return CANDLE_META.map((m) => m.id);
  return CANDLE_META.filter((m) => B(p, `cp_${m.id}`)).map((m) => m.id);
}

export function candleOptionsOf(p: Params): Partial<CandleOptions> {
  return {
    enabled: new Set<string>(enabledIds(p)),
    trend: B(p, "cpTrend"),
    trendMode: S(p, "cpTrendMode") === "sma" ? "sma" : "slope",
    trendLen: N(p, "cpTrendLen"),
    trendAtr: N(p, "cpTrendAtr"),
    gaps: S(p, "cpGaps") === "price" ? "price" : "body",
    overlap: N(p, "cpOverlap") / 100,
    atrLen: N(p, "cpAtrLen"),
    minSize: N(p, "cpMinSize"),
    longBody: N(p, "cpLongBody"),
    dojiBody: N(p, "cpDojiBody") / 100,
    spinBody: N(p, "cpSpinBody") / 100,
    shadowSmall: N(p, "cpShadow") / 100,
    hammerRatio: N(p, "cpHammer"),
    starRatio: N(p, "cpStar") / 100,
    haramiRatio: N(p, "cpHarami") / 100,
    tweezerTol: N(p, "cpTweezer"),
    engulfFull: B(p, "cpEngulfFull"),
    forming: B(p, "cpForming"),
    window: N(p, "cpWindow"),
    minStrength: N(p, "cpMinStrength"),
  };
}

interface Extra {
  hits: CandleHit[];
}

/** The hit whose last bar is `i` (hits are sorted by bar). */
function hitAt(hits: CandleHit[], i: number): CandleHit | undefined {
  let a = 0;
  let b = hits.length - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    const v = hits[m].i;
    if (v === i) return hits[m];
    if (v < i) a = m + 1;
    else b = m - 1;
  }
  return undefined;
}
function firstFrom(hits: CandleHit[], i: number): number {
  let a = 0;
  let b = hits.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (hits[m].i < i) a = m + 1;
    else b = m;
  }
  return a;
}

const colorOf = (bias: CandleBias, p: Params) => (bias === "bull" ? S(p, "cpColUp") : bias === "bear" ? S(p, "cpColDown") : S(p, "cpColFlat"));

/* ───────────── painter ───────────── */

function paint(sc: SeriesContext, p: Params, res?: IndResult): void {
  const ex = res?.extra as Extra | undefined;
  if (!ex || ex.hits.length === 0) return;
  const { ctx, candles } = sc;
  const locale = sc.options.locale;
  const dark = isDark(sc.theme.bg);
  const bw = sc.barSpacing;
  const pw = sc.paneWidth;
  const ph = sc.paneHeight;
  const labels = S(p, "cpLabels");
  const brackets = B(p, "cpBrackets");
  const strengthMode = S(p, "cpStrength");
  const sz = Math.max(3.5, Math.min(8, bw * 0.5));
  const halo = dark ? "rgba(19,23,34,0.85)" : "rgba(255,255,255,0.9)";
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const hitBox = (a: { x: number; y: number; w: number; h: number }) => boxes.some((b) => a.x < b.x + b.w + 1 && a.x + a.w + 1 > b.x && a.y < b.y + b.h && a.y + a.h > b.y);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.font = `600 10px ${sc.options.fontFamily}`;
  ctx.textAlign = "center";

  const hits = ex.hits;
  const to = Math.min(sc.to + 2, candles.length - 1);
  for (let k = firstFrom(hits, sc.from - 1); k < hits.length; k++) {
    const hit = hits[k];
    if (hit.i > to) break;
    const cx = sc.x(hit.i);
    if (cx < -20 || cx > pw + 20) continue;
    const color = colorOf(hit.bias, p);
    let alpha = strengthMode === "opacity" ? 0.5 + 0.5 * (hit.strength / 100) : 1;
    if (hit.forming) alpha *= 0.6;

    // extremes of the candles of the pattern
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = hit.start; j <= hit.i; j++) {
      const c = candles[j];
      if (!c) continue;
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
    }
    if (!(hi >= lo)) continue;
    const yHi = sc.y(hi);
    const yLo = sc.y(lo);
    ctx.globalAlpha = alpha;

    // thin box over the candles of a multi-candle pattern
    if (brackets && hit.i > hit.start) {
      const x0 = sc.x(hit.start) - bw * 0.46;
      const x1 = cx + bw * 0.46;
      ctx.beginPath();
      ctx.rect(x0, yHi - 2, x1 - x0, yLo - yHi + 4);
      ctx.fillStyle = rgba(color, dark ? 0.07 : 0.05);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(color, 0.65);
      ctx.setLineDash(hit.forming ? [3, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // marker: ▲ under a bullish, ▼ over a bearish pattern, a dot over a neutral one
    let ty: number; // tip of the marker, the label goes beyond its far end
    let farY: number;
    ctx.beginPath();
    if (hit.bias === "bull") {
      ty = yLo + 5;
      farY = ty + sz * 1.15;
      ctx.moveTo(cx, ty);
      ctx.lineTo(cx - sz * 0.62, farY);
      ctx.lineTo(cx + sz * 0.62, farY);
      ctx.closePath();
    } else if (hit.bias === "bear") {
      ty = yHi - 5;
      farY = ty - sz * 1.15;
      ctx.moveTo(cx, ty);
      ctx.lineTo(cx - sz * 0.62, farY);
      ctx.lineTo(cx + sz * 0.62, farY);
      ctx.closePath();
    } else {
      const r = Math.max(2.2, sz * 0.4);
      ty = yHi - 5;
      farY = ty - 2 * r;
      ctx.arc(cx, ty - r, r, 0, Math.PI * 2);
    }
    if (hit.forming) {
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    boxes.push({ x: cx - sz * 0.7, y: Math.min(ty, farY), w: sz * 1.4, h: Math.abs(farY - ty) });

    // label
    if (labels !== "none" || strengthMode === "number") {
      let text = labels === "full" ? candleName(hit.id, locale) : labels === "short" ? candleShort(hit.id, locale) : "";
      if (text && hit.others.length) text += ` +${hit.others.length}`;
      if (strengthMode === "number") text = text ? `${text} ${hit.strength}` : String(hit.strength);
      if (text) {
        const tw = Math.ceil(ctx.measureText(text).width);
        const below = hit.bias === "bull";
        const y0 = below ? farY + 2 : farY - 2 - 11;
        const box = { x: cx - tw / 2 - 1, y: y0, w: tw + 2, h: 11 };
        if (!hitBox(box) && box.x > -2 && box.x + box.w < pw + 2 && y0 > 0 && y0 + 11 < ph) {
          boxes.push(box);
          ctx.textBaseline = "top";
          ctx.lineWidth = 3;
          ctx.strokeStyle = halo;
          ctx.strokeText(text, cx, y0);
          ctx.fillStyle = color;
          ctx.fillText(text, cx, y0);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ───────────── legend ───────────── */

function legendRows(res: IndResult, p: Params, locale: string, index?: number): { text: string; color: string }[] {
  const ex = res.extra as Extra | undefined;
  if (!ex) return [];
  const out: { text: string; color: string }[] = [{ text: `${w("count", locale)}: ${ex.hits.length}`, color: S(p, "cpColFlat") }];
  const hit = index === undefined ? undefined : hitAt(ex.hits, index);
  if (hit) {
    let text = candleName(hit.id, locale);
    if (hit.others.length) text += ` +${hit.others.length}`;
    if (hit.forming) text += ` (${w("forming", locale)})`;
    out.push({ text, color: colorOf(hit.bias, p) });
  }
  return out;
}

function legendTipOf(res: IndResult, p: Params, locale: string, index?: number): string | undefined {
  const ex = res.extra as Extra | undefined;
  if (!ex) return undefined;
  const hit = index === undefined ? undefined : hitAt(ex.hits, index);
  const lines: string[] = [];
  if (hit) {
    const m = CANDLE_BY_ID[hit.id];
    lines.push(`${candleName(hit.id, locale)} (${m.bars} ${w("candles", locale)})`);
    lines.push(candleDesc(hit.id, locale));
    lines.push(`${w("strength", locale)}: ${hit.strength}/100 (${w("how", locale)})`);
    if (hit.others.length) lines.push(`${w("also", locale)}: ${hit.others.map((id) => candleName(id, locale)).join(", ")}`);
    if (hit.forming) lines.push(w("forming", locale));
  } else {
    lines.push(w("nobar", locale));
  }
  lines.push(CANDLE_DISCLAIMER[idx3(locale)]);
  return lines.join("\n");
}

/* ───────────── definition ───────────── */

const PRESETS: SelectOption[] = [
  { value: "list", label: "ind.cp.o.list" },
  { value: "main", label: "ind.cp.o.main" },
  { value: "all", label: "ind.cp.o.all" },
];
const GAPS: SelectOption[] = [
  { value: "body", label: "ind.cp.o.gbody" },
  { value: "price", label: "ind.cp.o.gprice" },
];
const TREND_MODES: SelectOption[] = [
  { value: "slope", label: "ind.cp.o.slope" },
  { value: "sma", label: "ind.cp.o.sma" },
];
const LABELS: SelectOption[] = [
  { value: "short", label: "ind.cp.o.lshort" },
  { value: "full", label: "ind.cp.o.lfull" },
  { value: "none", label: "ind.cp.o.lnone" },
];
const STRENGTH: SelectOption[] = [
  { value: "opacity", label: "ind.cp.o.sop" },
  { value: "number", label: "ind.cp.o.snum" },
  { value: "off", label: "ind.cp.o.soff" },
];

/** Checklist order: by number of candles, then bullish / bearish / neutral. */
const BIAS_ORDER: CandleBias[] = ["bull", "bear", "flat"];
const CHECKLIST = CANDLE_META.slice().sort((a, b) => a.bars - b.bars || BIAS_ORDER.indexOf(a.bias) - BIAS_ORDER.indexOf(b.bias));
const MAIN_SET = new Set<string>(MAIN_IDS);

const G_MAIN = "ind.cp.g.main";
const G_SHOW = "ind.cp.g.show";
const G_THR = "ind.cp.g.thr";
export const groupKeyOf = (bars: number, bias: CandleBias) => `ind.cp.g.${bars}${bias}`;

const MAIN_KEYS = ["cpPreset", "cpForming", "cpTrend", "cpGaps", "cpWindow", "cpMinStrength"];
const SHOW_KEYS = ["cpLabels", "cpBrackets", "cpStrength"];
const THR_KEYS = ["cpMinSize", "cpAtrLen", "cpLongBody", "cpDojiBody", "cpSpinBody", "cpShadow", "cpHammer", "cpStar", "cpHarami", "cpTweezer", "cpEngulfFull", "cpTrendMode", "cpTrendLen", "cpTrendAtr", "cpOverlap"];

const paramGroup: Record<string, string> = {};
for (const k of MAIN_KEYS) paramGroup[k] = G_MAIN;
for (const k of SHOW_KEYS) paramGroup[k] = G_SHOW;
for (const k of THR_KEYS) paramGroup[k] = G_THR;
for (const m of CHECKLIST) paramGroup[`cp_${m.id}`] = groupKeyOf(m.bars, m.bias);

export const candlesDef: IndicatorDef = {
  id: "candle_patterns",
  category: "patterns",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "candlestick candlesticks candle candles patterns pattern japanese doji hammer inverted hanging man shooting star marubozu spinning top engulfing harami cross piercing dark cloud tweezer kicker belt hold morning evening star three white soldiers black crows inside outside up down rising falling three methods abandoned baby reversal " +
    "свеча свечи свечной свечные свечных японские японских паттерн паттерны фигуры разворот доджи додж молот перевернутый повешенный падающая звезда марубозу волчок поглощение харами кросс проникающая завеса темных облаков пинцет кикер захват пояс утренняя вечерняя три солдата вороны внутри снаружи метода брошенный младенец " +
    "蜡烛 K线 烛台 形态 十字星 锤头 上吊 流星 吞没 孕线 启明星 黄昏星 红三兵 三只乌鸦",
  params: [
    sel("cpPreset", "list", PRESETS),
    bool("cpForming", false),
    bool("cpTrend", true),
    sel("cpGaps", "body", GAPS),
    num("cpWindow", 500, 50, 20000, 50),
    num("cpMinStrength", 0, 0, 100, 5),
    sel("cpLabels", "short", LABELS),
    bool("cpBrackets", true),
    sel("cpStrength", "opacity", STRENGTH),
    ...CHECKLIST.map((m) => bool(`cp_${m.id}`, MAIN_SET.has(m.id))),
    num("cpMinSize", DEFAULT_CANDLES.minSize, 0, 5, 0.05),
    num("cpAtrLen", DEFAULT_CANDLES.atrLen, 2, 100),
    num("cpLongBody", DEFAULT_CANDLES.longBody, 0.1, 5, 0.05),
    num("cpDojiBody", DEFAULT_CANDLES.dojiBody * 100, 1, 30, 1),
    num("cpSpinBody", DEFAULT_CANDLES.spinBody * 100, 5, 60, 1),
    num("cpShadow", DEFAULT_CANDLES.shadowSmall * 100, 0, 40, 1),
    num("cpHammer", DEFAULT_CANDLES.hammerRatio, 1, 6, 0.1),
    num("cpStar", DEFAULT_CANDLES.starRatio * 100, 5, 100, 5),
    num("cpHarami", DEFAULT_CANDLES.haramiRatio * 100, 10, 100, 5),
    num("cpTweezer", DEFAULT_CANDLES.tweezerTol, 0, 1, 0.01),
    bool("cpEngulfFull", false),
    sel("cpTrendMode", "slope", TREND_MODES),
    num("cpTrendLen", DEFAULT_CANDLES.trendLen, 2, 100),
    num("cpTrendAtr", DEFAULT_CANDLES.trendAtr, 0, 10, 0.1),
    num("cpOverlap", DEFAULT_CANDLES.overlap * 100, 0, 100, 5),
    col("cpColUp", "#26a69a"),
    col("cpColDown", "#ef5350"),
    col("cpColFlat", "#8b93a7"),
  ],
  paramGroup,
  styleParams: ["cpColUp", "cpColDown", "cpColFlat"],
  title: (p) => `Candles ${enabledIds(p).length}`,
  compute(cs, p) {
    if (cs.length < 3) return { plots: [], extra: { hits: [] } satisfies Extra };
    let hits: CandleHit[] = [];
    try {
      hits = detectCandles(cs, candleOptionsOf(p));
    } catch {
      hits = [];
    }
    return { plots: [], extra: { hits } satisfies Extra };
  },
  drawExtra(sc, p, res) {
    paint(sc, p, res);
  },
  legendItems(res, p, locale, index) {
    return legendRows(res, p, locale, index);
  },
  legendTip(res, p, locale, index) {
    return legendTipOf(res, p, locale, index);
  },
};

export const CANDLE_DEFS: IndicatorDef[] = [candlesDef];
