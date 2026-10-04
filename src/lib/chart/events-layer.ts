import type { ChartEngine } from "./engine";
import type { OverlayLayer, PointerInfo } from "./types";
import type { CalEvent } from "../calendar/types";
import { clusterByX, overlayChunks, snapToBar, toChartTime, utcSpan, type EventCluster } from "../calendar/overlay";
import { formatValue, surprise } from "../calendar/surprise";
import { formatClock } from "../calendar/time";

const MAIN = "main";
const IMPACT_COLOR: Record<number, string> = { 3: "#ef4444", 2: "#f59e0b", 1: "#8b95a5" };
const MOEX_COLOR = "#0ea5e9";
const SURPRISE_COLOR = { better: "#22c55e", worse: "#ef4444", inline: "" } as const;
/** Beyond this many days on screen the markers would be a solid smear: nothing is drawn (and nothing fetched). */
const MAX_VISIBLE_DAYS = 62;
const TTL_MS = 5 * 60_000;
const FAR_PAST_MS = 3 * 86_400_000;

export interface EventsLabels {
  act: string;
  fcst: string;
  prev: string;
  /** "{n} more" with the number already filled in is built by the layer from this template. */
  more: string;
}

interface Chunk {
  events: CalEvent[];
  at: number;
  failed?: boolean;
}
/** Shared by every layer instance (several panes of a multi-chart): the same 28-day chunks are fetched once. */
const chunkCache = new Map<string, Chunk>();
const chunkInflight = new Map<string, Promise<void>>();

/**
 * Economic-calendar events on the chart: small impact-coloured country badges just above the time axis at the release time,
 * snapped to the bar that contains it; hovering one (or a cluster) shows the events with actual / forecast / previous.
 * Visible range is fetched lazily (debounced) in 28-day chunks and cached. Chart time = real UTC ms + offsetMs.
 */
export class EventsLayer implements OverlayLayer {
  private engine: ChartEngine | null = null;
  private enabled = false;
  private offsetMs = 0;
  private zone = "UTC";
  private locale = "en-US";
  private impacts = new Set<number>([3]);
  private countries: Set<string> | null = null;
  private moexOn = true;
  private commodityOn = true;
  private lang = "ru";
  private labels: EventsLabels = { act: "Act", fcst: "Fcst", prev: "Prev", more: "{n} more" };
  /** every loaded event, sorted, deduplicated */
  private all: CalEvent[] = [];
  private shown: CalEvent[] = [];
  private clusters: { c: EventCluster; y: number }[] = [];
  private hover: number | null = null;
  private pointer: { x: number; y: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private wantKey = "";
  private gen = 0;

  attach(engine: ChartEngine): void {
    if (this.engine === engine) return;
    this.detach();
    this.engine = engine;
    engine.addLayer(this);
  }

  detach(): void {
    clearTimeout(this.timer);
    this.gen++;
    const e = this.engine;
    this.engine = null;
    if (e) e.removeLayer(this);
  }

  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) {
      clearTimeout(this.timer);
      this.hover = null;
    }
    this.redraw();
  }

  setFilter(impacts: readonly number[], countries: readonly string[], moex = true, commodity = true): void {
    this.impacts = new Set(impacts);
    this.countries = countries.length ? new Set(countries) : null;
    this.moexOn = moex;
    this.commodityOn = commodity;
    this.rebuild();
  }

  setTimeOffset(ms: number): void {
    this.offsetMs = ms;
    this.redraw();
  }

  setZone(zone: string, locale: string): void {
    this.zone = zone;
    this.locale = locale;
    const lang = locale.startsWith("zh") ? "cn" : locale.startsWith("en") ? "en" : "ru";
    if (lang !== this.lang) {
      this.lang = lang;
      this.all = [];
      this.shown = [];
      this.wantKey = "";
    }
    this.redraw();
  }

  setLabels(l: EventsLabels): void {
    this.labels = l;
  }

  /** The events that pass the filter (test / debugging). */
  getShown(): readonly CalEvent[] {
    return this.shown;
  }

  private redraw() {
    this.engine?.requestOverlayRedraw();
  }

  private rebuild() {
    const imp = this.impacts;
    const c = this.countries;
    const moex = this.moexOn;
    const commodity = this.commodityOn;
    // the Moscow Exchange layer follows its own switch (and shows from medium importance up), not the country filter
    // the commodity layer has its own switch and follows the importance filter, not the country filter
    this.shown = this.all.filter((e) => (e.category === "moex" ? moex && (e.impact >= 2 || imp.has(e.impact)) : e.category === "commodity" ? commodity && imp.has(e.impact) : imp.has(e.impact) && (!c || c.has(e.country))));
    this.hover = null;
    this.redraw();
  }

  private mergeFromCache() {
    const m = new Map<string, CalEvent>();
    for (const [k, ch] of chunkCache) if (k.startsWith(`${this.lang}:`)) for (const e of ch.events) m.set(e.id, e);
    this.all = [...m.values()].sort((a, b) => a.ts - b.ts);
    this.rebuild();
  }

  /** Make sure the chunks under the visible range are loaded (debounced; called from draw). */
  private ensure(fromUtc: number, toUtc: number) {
    const chunks = overlayChunks(fromUtc, toUtc);
    const now = Date.now();
    const stale = chunks.filter((c) => {
      const h = chunkCache.get(`${this.lang}:${c.from}`);
      if (!h) return true;
      const endMs = Date.parse(`${c.to}T00:00:00Z`) + 86_400_000;
      if (h.failed) return now - h.at > 30_000; // a failed load is retried after a short pause only
      return endMs > now - FAR_PAST_MS && now - h.at > TTL_MS; // finished weeks never change
    });
    if (stale.length === 0) return;
    const key = this.lang + stale.map((c) => c.from).join("|");
    if (key === this.wantKey && this.timer) return;
    this.wantKey = key;
    clearTimeout(this.timer);
    const gen = this.gen;
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      await Promise.all(stale.map((c) => this.fetchChunk(c.from, c.to, this.lang)));
      if (gen !== this.gen || !this.engine) return;
      this.wantKey = "";
      this.mergeFromCache();
    }, 350);
  }

  private fetchChunk(from: string, to: string, lang: string): Promise<void> {
    const ck = `${lang}:${from}`;
    const have = chunkInflight.get(ck);
    if (have) return have;
    const p = (async () => {
      try {
        const res = await fetch(`/api/economic-calendar?from=${from}&to=${to}&lang=${lang}`);
        const body: unknown = await res.json().catch(() => []);
        const reason = res.headers.get("X-Calendar-Reason") || "ok";
        const events = Array.isArray(body) ? (body as CalEvent[]) : [];
        // a failed load is remembered only briefly (so a restricted plan is not retried on every pan)
        const failed = events.length === 0 && reason !== "ok" && reason !== "mock";
        chunkCache.set(ck, { events, at: Date.now(), failed });
      } catch {
        chunkCache.set(ck, { events: [], at: Date.now(), failed: true });
      } finally {
        chunkInflight.delete(ck);
      }
    })();
    chunkInflight.set(ck, p);
    return p;
  }

  /* ───────── interaction ───────── */

  pointerMove(p: PointerInfo): boolean {
    if (!this.enabled) return false;
    const prev = this.hover;
    if (p.region !== "plot") {
      this.pointer = null;
      this.hover = null;
    } else {
      this.pointer = { x: p.x, y: p.y };
      this.hover = this.hit(p.x, p.y);
    }
    if (prev !== this.hover) this.redraw();
    return false; // the crosshair stays
  }

  pointerLeave(): void {
    if (this.hover !== null) {
      this.hover = null;
      this.redraw();
    }
    this.pointer = null;
  }

  cursor(p: PointerInfo): string | null {
    return this.enabled && p.region === "plot" && this.hit(p.x, p.y) !== null ? "pointer" : null;
  }

  private hit(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.clusters.length; i++) {
      const { c, y: cy } = this.clusters[i];
      const dx = Math.abs(x - c.x);
      const dy = Math.abs(y - cy);
      if (dx <= 12 && dy <= 11 && dx + dy < bestD) {
        bestD = dx + dy;
        best = i;
      }
    }
    return best;
  }

  /* ───────── drawing ───────── */

  draw(ctx: CanvasRenderingContext2D, engine: ChartEngine): void {
    this.clusters = [];
    if (engine !== this.engine || !this.enabled) return;
    const rect = engine.getPaneRect(MAIN);
    if (!rect || engine.getBars().length === 0) return;

    const vis = engine.getVisibleTimeRange();
    const span = utcSpan(vis.from, vis.to, this.offsetMs);
    if (!(span.to > span.from) || span.to - span.from > MAX_VISIBLE_DAYS * 86_400_000) return;
    this.ensure(span.from, span.to);
    if (this.shown.length === 0) return;

    const bars = engine.getBars();
    const interval = engine.getIntervalMs();
    const snap = !engine.isTransformed();
    // a little margin so a marker half outside the plot is still painted
    const pad = 3 * 3_600_000;
    const lo = span.from - pad;
    const hi = span.to + pad;
    let a = 0;
    let b = this.shown.length;
    // binary search for the first event >= lo (shown is sorted by ts)
    while (a < b) {
      const m = (a + b) >> 1;
      if (this.shown[m].ts < lo) a = m + 1;
      else b = m;
    }
    const inView: CalEvent[] = [];
    for (let i = a; i < this.shown.length && this.shown[i].ts <= hi; i++) inView.push(this.shown[i]);
    if (inView.length === 0) return;

    const xOf = (utc: number) => {
      const ct = toChartTime(utc, this.offsetMs);
      return engine.timeToX(snap ? snapToBar(bars, ct, interval) : ct);
    };
    // all-day events have no clock time: not drawn
    const clusters = clusterByX(inView.filter((e) => !e.allDay), xOf, 18, rect.width);
    const y = rect.top + rect.height - 10;
    this.clusters = clusters.map((c) => ({ c, y }));

    const theme = engine.getTheme();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rect.top, rect.width, rect.height);
    ctx.clip();
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    clusters.forEach((c, i) => {
      const hot = i === this.hover;
      const top0 = c.events[0];
      const isMoex = top0.category === "moex";
      const col = isMoex ? MOEX_COLOR : IMPACT_COLOR[c.impact];
      if (hot || c.impact === 3) {
        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = hot ? col : `${col}59`;
        ctx.moveTo(Math.round(c.x) + 0.5, rect.top);
        ctx.lineTo(Math.round(c.x) + 0.5, y - 8);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const top = c.events[0];
      const code = isMoex ? "MX" : top.country || "··";
      ctx.font = `700 9px ${engine.opts.fontFamily}`;
      const w = 22;
      const h = 14;
      ctx.beginPath();
      if (isMoex) {
        // the exchange's own events: a diamond
        ctx.moveTo(c.x, y - 9);
        ctx.lineTo(c.x + 12, y);
        ctx.lineTo(c.x, y + 9);
        ctx.lineTo(c.x - 12, y);
        ctx.closePath();
      } else rrect(ctx, c.x - w / 2, y - h / 2, w, h, 4);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = hot ? 2 : 1;
      ctx.strokeStyle = hot ? theme.text : theme.bg;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(code, c.x, y + 0.5);
      if (c.events.length > 1) {
        ctx.beginPath();
        ctx.arc(c.x + w / 2 - 1, y - h / 2 + 1, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.labelBg;
        ctx.fill();
        ctx.font = `700 8px ${engine.opts.fontFamily}`;
        ctx.fillStyle = theme.labelText;
        ctx.fillText(String(Math.min(99, c.events.length)), c.x + w / 2 - 1, y - h / 2 + 1.5);
      }
    });

    if (this.hover !== null && this.clusters[this.hover]) this.drawTooltip(ctx, engine, this.clusters[this.hover].c, y, rect.width, rect.top);
    ctx.restore();
  }

  private drawTooltip(ctx: CanvasRenderingContext2D, engine: ChartEngine, c: EventCluster, y: number, plotW: number, plotTop: number) {
    const theme = engine.getTheme();
    const ff = engine.opts.fontFamily;
    const MAX = 6;
    const list = c.events.slice(0, MAX);
    const pad = 8;
    const rowH = 30;
    const lines = list.map((e) => {
      const nameFont = `600 11px ${ff}`;
      const s = surprise(e);
      const parts: { label: string; value: string; color?: string }[] = [
        { label: this.labels.act, value: formatValue(e.actual, e.unit, this.locale) || "—", color: s ? SURPRISE_COLOR[s] || undefined : undefined },
        { label: this.labels.fcst, value: formatValue(e.forecast, e.unit, this.locale) || "—" },
        { label: this.labels.prev, value: formatValue(e.previous, e.unit, this.locale) || "—" },
      ];
      return { e, nameFont, parts };
    });
    // measure
    let w = 190;
    for (const l of lines) {
      ctx.font = l.nameFont;
      const nameW = ctx.measureText(`${l.e.country} ${formatClock(l.e.ts, this.zone)}  ${l.e.event}`).width + 22;
      ctx.font = `500 10.5px ${ff}`;
      const figW = l.parts.reduce((s, p) => s + ctx.measureText(`${p.label} ${p.value}`).width + 12, 0) + 22;
      w = Math.max(w, nameW, figW);
    }
    w = Math.min(w, Math.max(160, plotW - 12), 380);
    const extra = c.events.length > MAX ? 16 : 0;
    const h = pad * 2 + lines.length * rowH - 4 + extra;
    let x0 = c.x - w / 2;
    x0 = Math.max(6, Math.min(x0, plotW - w - 6));
    let y0 = y - 12 - h;
    if (y0 < plotTop + 4) y0 = plotTop + 4;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    rrect(ctx, x0, y0, w, h, 6);
    ctx.fillStyle = theme.labelBg;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.axisBorder;
    ctx.beginPath();
    rrect(ctx, x0, y0, w, h, 6);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let yy = y0 + pad + 8;
    for (const l of lines) {
      ctx.beginPath();
      ctx.arc(x0 + pad + 3, yy, 3, 0, Math.PI * 2);
      ctx.fillStyle = l.e.category === "moex" ? MOEX_COLOR : IMPACT_COLOR[l.e.impact];
      ctx.fill();
      ctx.font = l.nameFont;
      ctx.fillStyle = theme.labelText;
      const title = `${l.e.category === "moex" ? "MOEX" : l.e.country} ${l.e.allDay ? "" : formatClock(l.e.ts, this.zone)}  ${l.e.event}`;
      ctx.fillText(fit(ctx, title, w - pad * 2 - 12), x0 + pad + 11, yy);
      ctx.font = `500 10.5px ${ff}`;
      let xx = x0 + pad + 11;
      for (const p of l.parts) {
        ctx.fillStyle = theme.textMuted;
        const lab = `${p.label} `;
        ctx.fillText(lab, xx, yy + 14);
        xx += ctx.measureText(lab).width;
        ctx.fillStyle = p.color ?? theme.labelText;
        ctx.fillText(p.value, xx, yy + 14);
        xx += ctx.measureText(p.value).width + 12;
      }
      yy += rowH;
    }
    if (extra) {
      ctx.font = `500 10.5px ${ff}`;
      ctx.fillStyle = theme.textMuted;
      ctx.fillText(this.labels.more.replace("{n}", String(c.events.length - MAX)), x0 + pad + 11, yy - 2);
    }
    ctx.textAlign = "center";
  }
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
