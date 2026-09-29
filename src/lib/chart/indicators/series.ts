import type { AxisLabel, Candle, ChartTheme, LegendItem, Series, SeriesContext } from "../types";
import { formatPrice, formatVolume } from "../format";
import { computeIndicator } from "./registry";
import type { IndicatorDef, IndResult, LevelSpec, NumFmt, Params, PlotSpec } from "./registry";

/** What a series needs from the engine, without importing the engine class. */
export interface SeriesHost {
  getCandles(): Candle[];
  getPrecision(): number;
}

const DASH: number[] = [4, 4];
const NO_DASH: number[] = [];
const VOL_BAND = 0.2;

function finite(v: number): boolean {
  return v === v && v !== Infinity && v !== -Infinity;
}

/**
 * One indicator instance as a chart series. Computation is lazy and cached: it runs the first time the series is
 * asked for anything (draw / range / legend / axis labels) and again only when the candles or the params change.
 */
export class IndicatorSeries implements Series {
  readonly id: string;
  visible = true;

  private def: IndicatorDef;
  private params: Params;
  private host: SeriesHost;
  private res: IndResult | null = null;

  // cache signature
  private version = 0;
  private doneVersion = -1;
  private sLen = -1;
  private sFirstT = NaN;
  private sLastT = NaN;
  private sLastC = NaN;
  private sLastH = NaN;
  private sLastL = NaN;
  private sLastV = NaN;

  // remembered from the last draw, used by legend / axis labels which get no theme or locale
  private theme: ChartTheme | null = null;
  private locale = "ru-RU";

  constructor(uid: string, def: IndicatorDef, params: Params, host: SeriesHost) {
    this.id = uid;
    this.def = def;
    this.params = params;
    this.host = host;
  }

  setParams(params: Params) {
    this.params = params;
    this.version++;
  }

  title(): string {
    return this.def.title(this.params);
  }

  /** Recomputes when the candles or params changed. Returns true when a recompute happened. */
  ensure(candles: Candle[]): boolean {
    const n = candles.length;
    const last = n > 0 ? candles[n - 1] : null;
    const first = n > 0 ? candles[0] : null;
    if (
      this.doneVersion === this.version &&
      this.sLen === n &&
      (n === 0 ||
        (this.sFirstT === first!.t &&
          this.sLastT === last!.t &&
          this.sLastC === last!.c &&
          this.sLastH === last!.h &&
          this.sLastL === last!.l &&
          this.sLastV === last!.v))
    ) {
      return false;
    }
    this.sLen = n;
    this.sFirstT = first ? first.t : NaN;
    this.sLastT = last ? last.t : NaN;
    this.sLastC = last ? last.c : NaN;
    this.sLastH = last ? last.h : NaN;
    this.sLastL = last ? last.l : NaN;
    this.sLastV = last ? last.v : NaN;
    this.doneVersion = this.version;
    try {
      this.res = computeIndicator(this.def, candles, this.params);
    } catch {
      this.res = { plots: [] };
    }
    return true;
  }

  /* ───────────── formatting ───────────── */

  private fmt(v: number, kind: NumFmt): string {
    if (!finite(v)) return "—";
    if (kind === "vol") return formatVolume(v, this.locale);
    if (kind === "price") return formatPrice(v, this.host.getPrecision(), this.locale);
    const a = Math.abs(v);
    let d = 2;
    if (a > 0 && a < 0.1) d = Math.min(8, Math.ceil(-Math.log10(a)) + 2);
    return formatPrice(v, d, this.locale);
  }

  private plotFmt(p: PlotSpec): NumFmt {
    return p.fmt ?? this.def.fmt;
  }

  private plotValue(p: PlotSpec, index: number): number {
    const i = index - (p.offset ?? 0);
    if (i < 0 || i >= p.data.length) return NaN;
    return p.data[i];
  }

  private plotColorAt(p: PlotSpec, index: number): string {
    if (p.colors) {
      const i = index - (p.offset ?? 0);
      const c = p.colors[i];
      if (c) return c;
    }
    return p.color;
  }

  /* ───────────── Series interface ───────────── */

  range(candles: Candle[], from: number, to: number): [number, number] | null {
    if (!this.visible) return null;
    this.ensure(candles);
    const r = this.res;
    const n = candles.length;
    if (!r || n === 0) return null;
    if (r.range) return r.range;
    from = Math.max(0, from);
    to = Math.min(n - 1, to);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of r.plots) {
      if (p.scale === false || p.volBand) continue;
      const off = p.offset ?? 0;
      const a = Math.max(0, from - off);
      const b = Math.min(p.data.length - 1, to - off);
      for (let i = a; i <= b; i++) {
        const v = p.data[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (p.kind === "hist") {
        if (0 < lo) lo = 0;
        if (0 > hi) hi = 0;
      }
    }
    if (this.def.pane === "own") {
      if (r.levels) {
        for (const l of r.levels) {
          if (l.scale === false) continue;
          if (l.value < lo) lo = l.value;
          if (l.value > hi) hi = l.value;
        }
      }
      if (r.bands) {
        for (const b of r.bands) {
          if (b.lo < lo) lo = b.lo;
          if (b.hi > hi) hi = b.hi;
        }
      }
    }
    if (!finite(lo) || !finite(hi)) return null;
    return [lo, hi];
  }

  legend(candles: Candle[], index: number): LegendItem[] {
    if (!this.visible) return [];
    this.ensure(candles);
    const r = this.res;
    const n = candles.length;
    if (!r || n === 0) return [];
    if (index < 0) index = 0;
    if (index > n - 1) index = n - 1;
    const title = this.title();
    const shown = r.plots.filter((p) => p.legend !== false);
    const vals: LegendItem[] = [];
    for (const p of shown) {
      const v = this.plotValue(p, index);
      if (!finite(v)) continue;
      vals.push({ text: this.fmt(v, this.plotFmt(p)), color: this.plotColorAt(p, index) });
    }
    if (shown.length === 1) {
      const p = shown[0];
      const color = vals.length ? vals[0].color : p.color;
      return [{ text: vals.length ? `${title}  ${vals[0].text}` : title, color }];
    }
    const titleColor = this.theme?.textMuted ?? "#9ca3af";
    return [{ text: title, color: titleColor }, ...vals];
  }

  axisLabels(candles: Candle[], index: number): AxisLabel[] {
    if (!this.visible) return [];
    this.ensure(candles);
    const r = this.res;
    const n = candles.length;
    if (!r || n === 0) return [];
    if (index < 0) index = 0;
    if (index > n - 1) index = n - 1;
    const out: AxisLabel[] = [];
    for (const p of r.plots) {
      const flag = p.flag ?? (p.kind !== "hist" && !p.volBand);
      if (!flag || p.volBand) continue;
      const v = this.plotValue(p, index);
      if (!finite(v)) continue;
      out.push({ price: v, text: this.fmt(v, this.plotFmt(p)), color: this.plotColorAt(p, index) });
    }
    if (r.levels) {
      for (const l of r.levels) {
        if (!l.flag || !finite(l.value)) continue;
        out.push({ price: l.value, text: this.fmt(l.value, this.def.fmt), color: l.color });
      }
    }
    return out;
  }

  draw(sc: SeriesContext) {
    if (!this.visible) return;
    const candles = this.host.getCandles();
    this.ensure(candles);
    const r = this.res;
    const n = candles.length;
    if (!r || n === 0) return;
    this.theme = sc.theme;
    this.locale = sc.options.locale;
    const { ctx } = sc;
    const from = Math.max(0, sc.from);
    const to = Math.min(n - 1, sc.to);
    if (to < from) return;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (r.bands) {
      for (const b of r.bands) {
        const y1 = sc.y(b.hi);
        const y2 = sc.y(b.lo);
        ctx.fillStyle = b.color;
        ctx.fillRect(0, Math.min(y1, y2), sc.paneWidth, Math.abs(y2 - y1));
      }
    }
    if (r.fills) {
      for (const f of r.fills) this.drawFill(sc, f.a, f.b, f.color, f.when, f.offset ?? 0, from, to);
    }
    if (r.levels) {
      for (const l of r.levels) this.drawLevel(sc, l);
    }

    // volume-band scale (matches the engine's built-in volume band of the main pane)
    let maxV = 0;
    let needVol = false;
    for (const p of r.plots) if (p.volBand) needVol = true;
    if (needVol) for (let i = from; i <= to; i++) if (candles[i].v > maxV) maxV = candles[i].v;

    for (const p of r.plots) if (p.kind === "hist") this.drawHist(sc, p, from, to);
    for (const p of r.plots) if (p.kind === "line") this.drawLine(sc, p, from, to, maxV);
    for (const p of r.plots) if (p.kind === "dots") this.drawDots(sc, p, from, to);

    ctx.restore();
  }

  /* ───────────── drawing helpers ───────────── */

  private drawFill(
    sc: SeriesContext,
    a: ArrayLike<number>,
    b: ArrayLike<number>,
    color: string,
    when: "above" | "below" | undefined,
    off: number,
    from: number,
    to: number,
  ) {
    const { ctx } = sc;
    const len = Math.min(a.length, b.length);
    const s0 = Math.max(0, from - off - 1);
    const s1 = Math.min(len - 1, to - off + 1);
    ctx.fillStyle = color;
    let start = -1;
    for (let i = s0; i <= s1 + 1; i++) {
      let ok = false;
      if (i <= s1) {
        const av = a[i];
        const bv = b[i];
        ok = finite(av) && finite(bv) && (when === undefined || (when === "above" ? av >= bv : av < bv));
      }
      if (ok) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        const end = i - 1;
        ctx.beginPath();
        ctx.moveTo(sc.x(start + off), sc.y(a[start]));
        for (let k = start + 1; k <= end; k++) ctx.lineTo(sc.x(k + off), sc.y(a[k]));
        for (let k = end; k >= start; k--) ctx.lineTo(sc.x(k + off), sc.y(b[k]));
        ctx.closePath();
        ctx.fill();
        start = -1;
      }
    }
  }

  private drawLevel(sc: SeriesContext, l: LevelSpec) {
    const { ctx } = sc;
    if (!finite(l.value)) return;
    const y = Math.round(sc.y(l.value)) + 0.5;
    if (y < -2 || y > sc.paneHeight + 2) return;
    const x0 = l.fromIndex !== undefined ? Math.max(0, sc.x(l.fromIndex) - sc.barSpacing / 2) : 0;
    if (x0 >= sc.paneWidth) return;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 1;
    ctx.setLineDash(l.dashed ? DASH : NO_DASH);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(sc.paneWidth, y);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    if (l.label) {
      ctx.font = `600 10px ${sc.options.fontFamily}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = l.color;
      ctx.fillText(l.label, sc.paneWidth - 6, y - 2);
    }
  }

  private drawHist(sc: SeriesContext, p: PlotSpec, from: number, to: number) {
    const { ctx } = sc;
    const off = p.offset ?? 0;
    const data = p.data;
    const y0 = Math.min(sc.paneHeight, Math.max(0, sc.y(0)));
    const bw = Math.max(1, Math.floor(sc.barSpacing * 0.72));
    const colors = p.colors;
    ctx.globalAlpha = p.alpha ?? 1;
    ctx.fillStyle = p.color;
    let cur = p.color;
    const a = Math.max(0, from - off);
    const b = Math.min(data.length - 1, to - off);
    for (let i = a; i <= b; i++) {
      const v = data[i];
      if (!finite(v)) continue;
      if (colors) {
        const c = colors[i];
        if (c && c !== cur) {
          cur = c;
          ctx.fillStyle = c;
        }
      }
      const y1 = sc.y(v);
      const top = y1 < y0 ? y1 : y0;
      const h = Math.max(1, Math.abs(y1 - y0));
      const x = Math.round(sc.x(i + off) - bw / 2);
      ctx.fillRect(x, top, bw, h);
    }
    ctx.globalAlpha = 1;
  }

  private drawLine(sc: SeriesContext, p: PlotSpec, from: number, to: number, maxV: number) {
    const { ctx } = sc;
    const off = p.offset ?? 0;
    const data = p.data;
    const vb = p.volBand === true;
    if (vb && (!sc.options.showVolume || maxV <= 0)) return;
    const band = sc.paneHeight * VOL_BAND;
    const a = Math.max(0, from - off - 1);
    const b = Math.min(data.length - 1, to - off + 1);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width ?? 1.6;
    ctx.setLineDash(p.dashed ? DASH : NO_DASH);
    ctx.beginPath();
    let started = false;
    for (let i = a; i <= b; i++) {
      const v = data[i];
      if (!finite(v)) {
        started = false;
        continue;
      }
      const x = sc.x(i + off);
      const y = vb ? sc.paneHeight - (v / maxV) * band : sc.y(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
  }

  private drawDots(sc: SeriesContext, p: PlotSpec, from: number, to: number) {
    const { ctx } = sc;
    const off = p.offset ?? 0;
    const data = p.data;
    const colors = p.colors;
    const r = Math.max(1.2, Math.min(3, sc.barSpacing * 0.28));
    const a = Math.max(0, from - off);
    const b = Math.min(data.length - 1, to - off);
    let cur = "";
    for (let i = a; i <= b; i++) {
      const v = data[i];
      if (!finite(v)) continue;
      const c = colors ? colors[i] || p.color : p.color;
      if (c !== cur) {
        cur = c;
        ctx.fillStyle = c;
      }
      const x = sc.x(i + off);
      const y = sc.y(v);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
