/* Tags of the price scale (the coloured boxes on the right edge): what each kind is called and how they are stacked so none sits on another.
   Pure (no DOM): the engine draws them, scripts/check-bar-countdown.ts checks the stacking.

   A tag is a block: an optional CAPTION row on top (what it is: symbol, previous close, alert, indicator), the BODY (the price, centred on the price's
   own height) and an optional EXTRA row below (the countdown to the bar close, last-price tag only). */

export type TagKind = "price" | "prevClose" | "alert" | "compare" | "indicator";

export type CaptionKind = "price" | "prevClose" | "alert";

const CAPTIONS: Record<string, Record<CaptionKind, string>> = {
  ru: { price: "Цена", prevClose: "Закрытие", alert: "Алерт" },
  en: { price: "Price", prevClose: "Prev close", alert: "Alert" },
  zh: { price: "价格", prevClose: "前收", alert: "预警" },
};

/** Caption of a built-in tag kind in a locale ("ru-RU", "en-US", "zh-CN", "cn" ...). */
export function tagCaption(kind: CaptionKind, locale: string): string {
  const k = String(locale || "en").slice(0, 2).toLowerCase();
  return (CAPTIONS[k === "cn" ? "zh" : k] ?? CAPTIONS.en)[kind];
}

/** "ALMA 9 0.85 6 close" -> "ALMA 9"; with several tags per indicator the plot name replaces the number: "BB Upper". */
export function indicatorCaption(title: string, plotKey?: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return plotKey ?? "";
  const num = words.findIndex((w, i) => i > 0 && /^[-+]?\d+(\.\d+)?(\/\d+)*$/.test(w));
  const name = (num > 0 ? words.slice(0, num) : words.slice(0, 1)).join(" ");
  if (plotKey) return `${name} ${plotKey}`.trim();
  return num > 0 ? `${name} ${words[num]}` : name;
}

/** Input of the stacking: the block, anchored to the height `y` of its body's centre. */
export interface TagBlock {
  id: string;
  /** Lower placed first and keeps its place; the others give way. */
  prio: number;
  /** Centre of the body, px. */
  y: number;
  bodyH: number;
  /** Height of the caption row (0: the tag has none). */
  capH: number;
  /** Height of the row below the body (the countdown); 0: none. */
  extraH: number;
  /** Allowed vertical span of the whole block (the pane). */
  lo: number;
  hi: number;
}

export interface TagPlace {
  /** Top of the block (the caption row when it is drawn, else the body). */
  top: number;
  /** The caption row is drawn (it was dropped when keeping it would push the tag far from its price). */
  caption: boolean;
  /** Top of the body. */
  bodyTop: number;
  /** The block had to be moved off its price height (px, signed). */
  shift: number;
}

const GAP = 1;

/**
 * Stacks the blocks of one price scale. The ORDER of the tags always follows the order of their prices (a tag never jumps over another one),
 * and tags that would overlap are spread as a group: the group keeps its centre of gravity on the prices it stands for, so every tag stays as near
 * to its own price as the neighbours allow. A tag whose caption row would not fit loses the caption first (the least important tags first).
 * Never leaves [lo, hi]; when there is no room at all (more tags than height) the tags overlap rather than vanish.
 */
export function stackTags(blocks: TagBlock[]): Map<string, TagPlace> {
  const noCap = new Set<string>();
  const byPrio = blocks.slice().sort((a, b) => a.prio - b.prio || a.y - b.y);
  for (;;) {
    const { out, failed } = stackOnce(blocks, noCap);
    if (!failed) return out;
    const victim = byPrio.slice().reverse().find((b) => b.capH > 0 && !noCap.has(b.id));
    if (!victim) return out;
    noCap.add(victim.id);
  }
}

interface Item {
  b: TagBlock;
  cap: number;
  h: number;
  /** where the block would sit exactly on its price */
  want: number;
}

interface Cluster {
  items: Item[];
  /** sum of the heights (+ gaps) of the items */
  total: number;
  /** top of the cluster */
  top: number;
}

function stackOnce(blocks: TagBlock[], noCap: Set<string>): { out: Map<string, TagPlace>; failed: boolean } {
  const out = new Map<string, TagPlace>();
  const items: Item[] = blocks
    .map((b) => {
      const cap = b.capH > 0 && !noCap.has(b.id) ? b.capH : 0;
      const h = cap + b.bodyH + b.extraH;
      return { b, cap, h, want: b.y - b.bodyH / 2 - cap };
    })
    .sort((x, y) => x.want - y.want || x.b.prio - y.b.prio);

  let failed = false;
  const lo = items.length ? Math.min(...items.map((i) => i.b.lo)) : 0;
  const hi = items.length ? Math.max(...items.map((i) => i.b.hi)) : 0;
  const clusters: Cluster[] = [];
  const place = (c: Cluster) => {
    // the cluster's top that keeps the squared distance of its items from their prices smallest: the mean of (want - offset inside the cluster)
    let off = 0;
    let sum = 0;
    let pinnedTop: number | null = null; // the tag of the last price (prio 0) never leaves its price: the others make room around it
    for (const it of c.items) {
      sum += it.want - off;
      if (pinnedTop === null && it.b.prio <= 0) pinnedTop = it.want - off;
      off += it.h + GAP;
    }
    c.total = off - GAP;
    const top = pinnedTop ?? sum / c.items.length;
    const minTop = Math.max(...c.items.map((i) => i.b.lo), lo);
    const maxTop = Math.min(...c.items.map((i) => i.b.hi), hi) - c.total;
    if (maxTop < minTop) failed = true;
    c.top = Math.max(minTop, Math.min(Math.max(minTop, maxTop), top));
  };
  for (const it of items) {
    let cur: Cluster = { items: [it], total: it.h, top: 0 };
    place(cur);
    // merge with the previous clusters while they touch (the neighbours move as one group)
    for (;;) {
      const prev = clusters[clusters.length - 1];
      if (!prev || prev.top + prev.total + GAP <= cur.top) break;
      clusters.pop();
      cur = { items: [...prev.items, ...cur.items], total: 0, top: 0 };
      place(cur);
    }
    clusters.push(cur);
  }
  for (const c of clusters) {
    let top = c.top;
    for (const it of c.items) {
      out.set(it.b.id, { top, caption: it.cap > 0, bodyTop: top + it.cap, shift: top - it.want });
      top += it.h + GAP;
    }
  }
  return { out, failed };
}

/** A tiny bell (about 9 px) centred on (cx, cy): the mark of an alert level. */
export function drawBell(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + 2.5);
  ctx.quadraticCurveTo(cx - 3.5, cy + 1, cx - 3.2, cy - 1);
  ctx.arc(cx, cy - 1, 3.2, Math.PI, 0);
  ctx.quadraticCurveTo(cx + 3.5, cy + 1, cx + 4, cy + 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + 3.6, 1.2, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}
