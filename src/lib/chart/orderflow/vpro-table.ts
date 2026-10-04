import type { ChartTheme } from "../types";
import { formatPrice } from "../format";
import { indT } from "../indicators/ind-text";
import { SIZE_PX, type VpCfg, type VpView } from "../indicators/vpro-def";
import { fmtVolShort } from "../analysis/vprofile";

/* The statistics table of the configurable volume profile (canvas, main pane): Profile High, Value Area High, Point of Control,
   Value Area Low, Profile Low, total volume, average volume per bar, volume MA, number of bars, where the data comes from, delta
   and buy % (real trades only). Pure painting; the overlay layer decides when and where. */

/** Width kept free on the left of a top-right table for the indicator legend, px. */
const LEGEND_ROOM = 440;

export interface TableRow {
  label: string;
  value: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function dataFromText(v: VpView): string {
  const st = v.stats;
  if (st.kind === "approx") return indT("vp.d.approx", "≈ candle estimate");
  const src = st.source === "bybit" ? indT("vp.d.bybit", "Bybit") : st.source === "moex" ? indT("vp.d.moex", "MOEX") : "";
  if (st.kind === "real") return indT("vp.d.real", "real trades {src}", { src }).trim();
  return indT("vp.d.mixed", "trades in {pct}% of bars, rest ≈", { pct: Math.round(st.realPct) });
}

export function tableRows(cfg: VpCfg, v: VpView, locale: string): TableRow[] {
  const out: TableRow[] = [];
  const f = (x: number) => formatPrice(x, v.dec, locale);
  const r = cfg.rows;
  const L = v.levels;
  const st = v.stats;
  if (r.High) out.push({ label: indT("vp.t.high", "Profile High"), value: f(L.high) });
  if (r.Vah) out.push({ label: indT("vp.t.vah", "Value Area High"), value: f(L.vah) });
  if (r.Poc) out.push({ label: indT("vp.t.poc", "Point of Control"), value: f(L.poc) });
  if (r.Val) out.push({ label: indT("vp.t.val", "Value Area Low"), value: f(L.val) });
  if (r.Low) out.push({ label: indT("vp.t.low", "Profile Low"), value: f(L.low) });
  if (r.Total) out.push({ label: indT("vp.t.total", "Total Volume in VP Range"), value: fmtVolShort(st.total, locale) });
  if (r.Avg) out.push({ label: indT("vp.t.avg", "Avg Volume/Bar"), value: fmtVolShort(st.avg, locale) });
  if (r.Ma) out.push({ label: indT("vp.t.ma", "Volume MA ({n})", { n: cfg.maLen }), value: fmtVolShort(st.ma, locale) });
  if (r.Bars) out.push({ label: indT("vp.t.bars", "Number of Bars"), value: String(st.bars) });
  if (r.From) out.push({ label: indT("vp.t.from", "Data From"), value: dataFromText(v) });
  if (st.kind !== "approx") {
    if (r.Delta) out.push({ label: indT("vp.t.delta", "Delta"), value: (st.delta > 0 ? "+" : "") + fmtVolShort(st.delta, locale) });
    if (r.Buy && isFinite(st.buyPct)) out.push({ label: indT("vp.t.buy", "Buy %"), value: st.buyPct.toFixed(1) + "%" });
  }
  return out;
}

function isDark(bg: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(bg);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.5;
}

function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface TableColors {
  bg: string;
  text: string;
  muted: string;
  border: string;
  sep: string;
  /** Header strip fill (design v3 soft card); empty = no strip. */
  head?: string;
  /** Soft rounded card with a shadow instead of a hard frame (the automatic theme only). */
  soft?: boolean;
}

export function tableColors(cfg: VpCfg, theme: ChartTheme): TableColors {
  if (cfg.tblAuto) {
    const dark = isDark(theme.bg);
    return dark
      ? { bg: rgba("#1c1c1e", Math.max(cfg.tblAlpha, 0.9)), text: "#f2f2f7", muted: "#8e8e93", border: "#2c2c2e", sep: "rgba(255,255,255,0.07)", head: "rgba(255,255,255,0.06)", soft: true }
      : { bg: rgba("#ffffff", Math.max(cfg.tblAlpha, 0.9)), text: "#1c1c1e", muted: "#8e8e93", border: "#e5e5ea", sep: "#f0f0f4", head: "rgba(242,242,247,0.9)", soft: true };
  }
  return { bg: rgba(cfg.c.vpTblBg, cfg.tblAlpha), text: cfg.c.vpTblText, muted: cfg.c.vpTblText, border: cfg.c.vpTblBorder, sep: rgba(cfg.c.vpTblText, 0.14) };
}

export interface TablePlace {
  /** Plot size. */
  W: number;
  H: number;
  /** Space kept free at the top (indicator legend) for the left corner; px. */
  insetTop: number;
  /** Space already used in the same corner by earlier tables; px. */
  stack: number;
}

/**
 * Paints the table (or, collapsed, its header chip) and returns its rectangle. `title` is the header text.
 * Layout follows the TradingView table: label on the left, value on the right, a thin line between rows.
 */
export function paintTable(ctx: CanvasRenderingContext2D, theme: ChartTheme, fontFamily: string, cfg: VpCfg, rows: TableRow[], title: string, place: TablePlace): Rect {
  const fs = SIZE_PX[cfg.tblSize];
  const col = tableColors(cfg, theme);
  const compact = cfg.tblCompact;
  const rowH = Math.round(fs * (compact ? 1.55 : 2.05));
  const padX = compact ? 5 : 8;
  const gap = compact ? 8 : 14;
  const head = `${cfg.tblCollapsed ? "▸" : "▾"} ${title}`;
  ctx.save();
  ctx.font = `600 ${fs}px ${fontFamily}`;
  const headW = ctx.measureText(head).width;
  ctx.font = `${fs}px ${fontFamily}`;
  let lw = 0;
  let vw = 0;
  const showRows = cfg.tblCollapsed ? [] : rows;
  for (const r of showRows) {
    lw = Math.max(lw, ctx.measureText(r.label).width);
  }
  ctx.font = `600 ${fs}px ${fontFamily}`;
  for (const r of showRows) vw = Math.max(vw, ctx.measureText(r.value).width);
  const w = Math.ceil(Math.max(headW + padX * 2, padX * 2 + lw + gap + vw));
  const h = rowH * (1 + showRows.length);
  const m = 8;
  const right = cfg.tblPos === "tr" || cfg.tblPos === "br";
  const bottom = cfg.tblPos === "br" || cfg.tblPos === "bl";
  const x = Math.round(right ? place.W - w - m : m);
  // the legend of the indicators lives at the top left: a table that would reach over it goes below it
  const belowLegend = !bottom && (!right || place.W - w - m < LEGEND_ROOM);
  const y = Math.round(bottom ? place.H - h - m - place.stack : (belowLegend ? place.insetTop : m) + place.stack);
  // background and frame
  if (col.soft && typeof ctx.roundRect === "function") {
    // design v3: white rounded card, soft shadow, grey header strip
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = col.bg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.restore();
    if (col.head) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.clip();
      ctx.fillStyle = col.head;
      ctx.fillRect(x, y, w, rowH);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = col.bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  ctx.textBaseline = "middle";
  // header
  ctx.font = `600 ${fs}px ${fontFamily}`;
  ctx.fillStyle = col.soft ? col.text : col.muted;
  ctx.textAlign = "left";
  ctx.fillText(head, x + padX, y + rowH / 2 + 0.5);
  // rows
  for (let i = 0; i < showRows.length; i++) {
    const ry = y + rowH * (i + 1);
    ctx.strokeStyle = col.sep;
    ctx.beginPath();
    ctx.moveTo(x + (col.soft ? 8 : 1), ry + 0.5);
    ctx.lineTo(x + w - (col.soft ? 8 : 1), ry + 0.5);
    ctx.stroke();
    ctx.font = `${fs}px ${fontFamily}`;
    ctx.fillStyle = col.soft ? col.muted : col.text;
    ctx.textAlign = "left";
    ctx.fillText(showRows[i].label, x + padX, ry + rowH / 2 + 0.5);
    ctx.font = `600 ${fs}px ${fontFamily}`;
    ctx.fillStyle = col.text;
    ctx.textAlign = "right";
    ctx.fillText(showRows[i].value, x + w - padX, ry + rowH / 2 + 0.5);
  }
  ctx.restore();
  return { x, y, w, h };
}
