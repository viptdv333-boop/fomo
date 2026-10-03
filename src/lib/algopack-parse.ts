/**
 * Pure parsers / normalisers of ALGOPACK responses (no network, no Next): they turn the documented ISS blocks
 * (`columns` + `data`, see the algopack-* skills) into compact tables the chart client consumes.
 *
 * TIME BASIS. Everything MOEX publishes here is Moscow wall-clock text ("2025-01-10", "10:05:00"). Parsers return `w`:
 * that wall clock read as UTC milliseconds ("wall-as-UTC"), independent of the server's time zone. The chart client
 * converts `w` to its own time with the same offset /api/klines reports (chart time = w - serverTzOffsetMin * 60000),
 * see lib/chart/algopack/store.ts.
 */

import { tableRows } from "./algopack";

export const MIN = 60_000;
export const DAY = 86_400_000;
/** SuperCandles are 5-minute bars */
export const SC_STEP = 5 * MIN;

export interface Tbl {
  cols: string[];
  rows: (number | null)[][];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "2025-01-10" + "10:05:00" (or a full "2025-01-10 10:05:00" in `time`) -> wall-as-UTC ms; NaN when malformed. */
export function wallMs(date: unknown, time?: unknown): number {
  let d = typeof date === "string" ? date.trim() : "";
  let t = typeof time === "string" ? time.trim() : "";
  if (t && /[ T]/.test(t)) {
    const parts = t.split(/[ T]/);
    if (/^\d{4}-\d\d-\d\d$/.test(parts[0])) d = d || parts[0];
    t = parts[parts.length - 1];
  }
  if (/^\d{4}-\d\d-\d\d[ T]/.test(d)) {
    const parts = d.split(/[ T]/);
    d = parts[0];
    if (!t) t = parts[1] ?? "";
  }
  const dm = d.match(/^(\d{4})-(\d\d)-(\d\d)$/);
  if (!dm) return NaN;
  let h = 0;
  let mi = 0;
  let s = 0;
  if (t) {
    const tm = t.match(/^(\d{1,2}):(\d\d)(?::(\d\d))?/);
    if (!tm) return NaN;
    h = +tm[1];
    mi = +tm[2];
    s = tm[3] ? +tm[3] : 0;
  }
  return Date.UTC(+dm[1], +dm[2] - 1, +dm[3], h, mi, s);
}

/** Moscow date (YYYY-MM-DD) of a real instant. */
export function mskDateOf(ms: number): string {
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
}

/* ───────────── SuperCandles ───────────── */

/**
 * Is `tradetime` the START of the 5-minute bar or its END? The docs say rows are published a few seconds after the
 * interval closes and carry `systime` (load time). systime - tradetime is ~5 min for a start stamp and a few seconds for
 * an end stamp. Returns the number of ms to subtract from `tradetime` to get the bar start (0 or SC_STEP), by the median
 * over the rows; 0 (start) when systime is unusable.
 */
export function barStampShift(rows: Record<string, any>[]): { shift: number; basis: "begin" | "end" | "assumed-begin" } {
  const deltas: number[] = [];
  for (const r of rows) {
    const a = wallMs(r.tradedate, r.tradetime);
    const b = wallMs(r.systime);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const d = b - a;
      if (d > -DAY && d < DAY) deltas.push(d);
    }
    if (deltas.length >= 60) break;
  }
  if (deltas.length < 3) return { shift: 0, basis: "assumed-begin" };
  deltas.sort((x, y) => x - y);
  const med = deltas[deltas.length >> 1];
  return med >= 2.5 * MIN ? { shift: 0, basis: "begin" } : { shift: SC_STEP, basis: "end" };
}

const TS_COLS = ["w", "pr_open", "pr_high", "pr_low", "pr_close", "vol", "vol_b", "vol_s", "val", "trades", "trades_b", "trades_s", "disb", "pr_vwap"] as const;
const OS_COLS = [
  "w", "put_orders", "put_orders_b", "put_orders_s", "cancel_orders", "cancel_orders_b", "cancel_orders_s",
  "put_vol", "put_vol_b", "put_vol_s", "cancel_vol", "cancel_vol_b", "cancel_vol_s", "put_val", "cancel_val",
] as const;
const OB_COLS = [
  "w", "spread_bbo", "spread_deep", "spread_big", "imb_vol_bbo", "imb_val_bbo", "imb_vol", "imb_val",
  "vol_b", "vol_s", "levels_b", "levels_s", "mid_price", "micro_price",
] as const;

function toTable(cols: readonly string[], rows: Record<string, any>[], pick: (r: Record<string, any>) => Record<string, number | null>): { tbl: Tbl; basis: string } {
  const out: (number | null)[][] = [];
  const { shift: sh, basis } = barStampShift(rows);
  for (const r of rows) {
    const w = wallMs(r.tradedate, r.tradetime) - sh;
    if (!Number.isFinite(w)) continue;
    const v = pick(r);
    out.push(cols.map((c) => (c === "w" ? w : (v[c] ?? null))));
  }
  out.sort((a, b) => (a[0] as number) - (b[0] as number));
  // one row per bar: a re-published bar replaces the earlier one
  const dedup: (number | null)[][] = [];
  for (const r of out) {
    if (dedup.length && dedup[dedup.length - 1][0] === r[0]) dedup[dedup.length - 1] = r;
    else dedup.push(r);
  }
  return { tbl: { cols: [...cols], rows: dedup }, basis };
}

const direct = (cols: readonly string[]) => (r: Record<string, any>) => {
  const o: Record<string, number | null> = {};
  for (const c of cols) if (c !== "w") o[c] = num(r[c]);
  return o;
};

export function normTradestats(payload: any): { tbl: Tbl; basis: string } {
  return toTable(TS_COLS, tableRows(payload, "data"), direct(TS_COLS));
}

export function normOrderstats(payload: any): { tbl: Tbl; basis: string } {
  return toTable(OS_COLS, tableRows(payload, "data"), direct(OS_COLS));
}

/** (b - s) / (b + s), null when there is no depth. */
export function imbalance(b: number | null, s: number | null): number | null {
  if (b === null || s === null) return null;
  const t = b + s;
  return t > 0 ? (b - s) / t : null;
}

/** The deepest cumulative level present in an FO/FX row for `prefix` ("vol_b_l" -> vol_b_l20 ... vol_b_l1). */
function deepest(r: Record<string, any>, prefix: string): { n: number; v: number } | null {
  for (let n = 20; n >= 1; n--) {
    const v = num(r[`${prefix}${n}`]);
    if (v !== null) return { n, v };
  }
  return null;
}

export function normObstats(payload: any): { tbl: Tbl; basis: string } {
  const pick = (r: Record<string, any>): Record<string, number | null> => {
    // EQ rows carry imbalance_* and spread_bbo / lv10 / 1mio; FO / FX rows carry spread_l1..l20 and cumulative depth vol_b_l1..l20
    const fo = num(r.spread_l1) !== null || deepest(r, "vol_b_l") !== null;
    let imbVolBbo = num(r.imbalance_vol_bbo);
    let imbValBbo = num(r.imbalance_val_bbo);
    let imbVol = num(r.imbalance_vol);
    let imbVal = num(r.imbalance_val);
    let volB = num(r.vol_b);
    let volS = num(r.vol_s);
    if (fo) {
      if (imbVolBbo === null) imbVolBbo = imbalance(num(r.vol_b_l1), num(r.vol_s_l1));
      if (imbValBbo === null) imbValBbo = imbalance(num(r.val_b_l1), num(r.val_s_l1));
      const db = deepest(r, "vol_b_l");
      const ds = deepest(r, "vol_s_l");
      if (imbVol === null && db) imbVol = imbalance(db.v, num(r[`vol_s_l${db.n}`]));
      const vb = deepest(r, "val_b_l");
      if (imbVal === null && vb) imbVal = imbalance(vb.v, num(r[`val_s_l${vb.n}`]));
      if (volB === null && db) volB = db.v;
      if (volS === null && ds) volS = ds.v;
    }
    return {
      spread_bbo: num(r.spread_bbo) ?? num(r.spread_l1),
      spread_deep: num(r.spread_lv10) ?? num(r.spread_l10),
      spread_big: num(r.spread_1mio) ?? num(r.spread_l20),
      imb_vol_bbo: imbVolBbo,
      imb_val_bbo: imbValBbo,
      imb_vol: imbVol,
      imb_val: imbVal,
      vol_b: volB,
      vol_s: volS,
      levels_b: num(r.levels_b),
      levels_s: num(r.levels_s),
      mid_price: num(r.mid_price),
      micro_price: num(r.micro_price),
    };
  };
  return toTable(OB_COLS, tableRows(payload, "data"), pick);
}

/* ───────────── FUTOI ───────────── */

export const FUTOI_COLS = ["w", "fiz_pos", "fiz_long", "fiz_short", "fiz_ln", "fiz_sn", "yur_pos", "yur_long", "yur_short", "yur_ln", "yur_sn"] as const;

/**
 * FUTOI: one row per (snapshot, clgroup). Pivots to one row per snapshot with FIZ and YUR side by side.
 * `pos_short` can be negative in the raw feed: the gross short is returned as a positive number; net = long - short
 * (the feed's own `pos` when present).
 */
export function normFutoi(payload: any): Tbl {
  const rows = tableRows(payload, "futoi");
  const by = new Map<number, Record<string, number | null>>();
  for (const r of rows) {
    const w = wallMs(r.tradedate, r.tradetime);
    if (!Number.isFinite(w)) continue;
    const g = String(r.clgroup ?? "").toUpperCase();
    if (g !== "FIZ" && g !== "YUR") continue;
    const k = g.toLowerCase();
    const long = num(r.pos_long);
    const sh = num(r.pos_short);
    const short = sh === null ? null : Math.abs(sh);
    let pos = num(r.pos);
    if (pos === null && long !== null && short !== null) pos = long - short;
    const o = by.get(w) ?? { w };
    o[`${k}_pos`] = pos;
    o[`${k}_long`] = long;
    o[`${k}_short`] = short;
    o[`${k}_ln`] = num(r.pos_long_num);
    o[`${k}_sn`] = num(r.pos_short_num);
    by.set(w, o);
  }
  const out = [...by.values()].sort((a, b) => (a.w as number) - (b.w as number));
  return { cols: [...FUTOI_COLS], rows: out.map((o) => FUTOI_COLS.map((c) => o[c] ?? null)) };
}

/**
 * The FUTOI "ticker" of an instrument: the underlying code ("Si", "RI", "MX", "BR"), which for a dated contract SECID is the
 * first two letters (SiZ6 -> Si, RIH7 -> RI, MXZ6 -> MX). Returns candidates, best first; the server picks the first one the
 * FUTOI securities list knows.
 */
export function futoiCandidates(secid: string, asset?: string): string[] {
  const out: string[] = [];
  const m = secid.match(/^([A-Za-z0-9]{2,3}?)[FGHJKMNQUVXZ]\d$/);
  if (m) out.push(m[1]);
  if (asset) out.push(asset);
  out.push(secid);
  const two = secid.slice(0, 2);
  if (two.length === 2) out.push(two);
  return [...new Set(out)];
}

/* ───────────── Mega Alerts ───────────── */

export interface AlertRow {
  /** wall-as-UTC ms of the alert minute */
  w: number;
  type: string;
  /** +1 up / buy side, -1 down / sell side, 0 neutral */
  dir: 1 | -1 | 0;
  thr: number | null;
  val: number | null;
  /** price near the alert (close of the 5-minute bar containing it), when known */
  price?: number | null;
  /** historical post-alert context: price change % after 5m / 15m / 30m / 1h as [avg up, avg down, n up, n down] */
  ref?: Partial<Record<"m5" | "m15" | "m30" | "h1", (number | null)[]>>;
}

/** Direction of an alert type (see the mega-alerts reference). */
export function alertDirection(type: string): 1 | -1 | 0 {
  const t = type.toLowerCase();
  if (t.endsWith("+")) return 1;
  if (t.endsWith("-")) return -1;
  if (t.startsWith("pr_high")) return 1;
  if (t.startsWith("pr_low")) return -1;
  if (/_b_/.test(t)) return 1;
  if (/_s_/.test(t)) return -1;
  if (t === "net_vol_max" || t === "pr_change_max") return 1;
  if (t === "net_vol_min" || t === "pr_change_min") return -1;
  return 0;
}

/** `reference` is a JSON string holding a one-element list (or an object): keep the four horizons we show. */
export function parseReference(ref: unknown): AlertRow["ref"] | undefined {
  if (typeof ref !== "string" || !ref.trim()) return undefined;
  try {
    let j: any = JSON.parse(ref);
    if (Array.isArray(j)) j = j[0];
    if (!j || typeof j !== "object") return undefined;
    const o: NonNullable<AlertRow["ref"]> = {};
    const pick = (k: string) => (Array.isArray(j[k]) ? (j[k] as unknown[]).map(num) : undefined);
    const m5 = pick("m_5");
    const m15 = pick("m_15");
    const m30 = pick("m_30");
    const h1 = pick("h_1");
    if (m5) o.m5 = m5;
    if (m15) o.m15 = m15;
    if (m30) o.m30 = m30;
    if (h1) o.h1 = h1;
    return Object.keys(o).length ? o : undefined;
  } catch {
    return undefined;
  }
}

export function normAlerts(payload: any): AlertRow[] {
  const out: AlertRow[] = [];
  for (const r of tableRows(payload, "data")) {
    const w = wallMs(r.tradedate, r.tradetime);
    const type = typeof r.alert_type === "string" ? r.alert_type : "";
    if (!Number.isFinite(w) || !type) continue;
    const row: AlertRow = { w, type, dir: alertDirection(type), thr: num(r.threshold), val: num(r.value) };
    const ref = parseReference(r.reference);
    if (ref) row.ref = ref;
    out.push(row);
  }
  out.sort((a, b) => a.w - b.w);
  return out;
}

/** Adds `price` = close of the 5-minute bar containing each alert (ts = normalised tradestats). */
export function attachAlertPrices(alerts: AlertRow[], ts: Tbl | null): void {
  if (!ts || ts.rows.length === 0) return;
  const iw = ts.cols.indexOf("w");
  const ic = ts.cols.indexOf("pr_close");
  if (iw < 0 || ic < 0) return;
  for (const a of alerts) {
    // last bar that began at or before the alert (binary search), inside the 5-minute step
    let lo = 0;
    let hi = ts.rows.length - 1;
    let found = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if ((ts.rows[m][iw] as number) <= a.w) {
        found = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    if (found >= 0 && a.w - (ts.rows[found][iw] as number) < SC_STEP) a.price = ts.rows[found][ic];
  }
}

/* ───────────── HI2 ───────────── */

export interface Hi2Table {
  metrics: string[];
  /** [w of the trading day start, metric index, value] */
  rows: [number, number, number][];
}

export function normHi2(payload: any): Hi2Table {
  const metrics: string[] = [];
  const rows: [number, number, number][] = [];
  for (const r of tableRows(payload, "data")) {
    const w = wallMs(r.tradedate);
    const metric = typeof r.metric === "string" ? r.metric : "";
    const v = num(r.value);
    if (!Number.isFinite(w) || !metric || v === null) continue;
    let mi = metrics.indexOf(metric);
    if (mi < 0) mi = metrics.push(metric) - 1;
    rows.push([w, mi, v]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return { metrics, rows };
}

/** Interpretation band of an HI2 value (reference: < 1500 low, 1500-2500 moderate, > 2500 high). */
export function hi2Band(v: number): "low" | "moderate" | "high" {
  return v < 1500 ? "low" : v <= 2500 ? "moderate" : "high";
}

/* ───────────── order book ───────────── */

export interface BookSide {
  p: number;
  q: number;
}
export interface Book {
  bids: BookSide[];
  asks: BookSide[];
  /** UPDATETIME of the snapshot as sent (Moscow wall clock, "HH:MM:SS"), when present */
  upd?: string;
}

/** ISS `orderbook` block: rows BUYSELL ("B" bid / "S" ask), PRICE, QUANTITY. Bids sorted high -> low, asks low -> high. */
export function parseBook(payload: any): Book {
  const bids: BookSide[] = [];
  const asks: BookSide[] = [];
  let upd: string | undefined;
  for (const r of tableRows(payload, "orderbook")) {
    const p = num(r.price);
    const q = num(r.quantity);
    if (p === null || q === null || !(p > 0) || !(q > 0)) continue;
    const side = String(r.buysell ?? "").toUpperCase();
    if (side === "B") bids.push({ p, q });
    else if (side === "S") asks.push({ p, q });
    if (typeof r.updatetime === "string" && r.updatetime) upd = r.updatetime;
  }
  bids.sort((a, b) => b.p - a.p);
  asks.sort((a, b) => a.p - b.p);
  return { bids, asks, upd };
}
