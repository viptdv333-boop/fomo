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
/** A caption is dropped when keeping it would move the tag this many px farther from its price than dropping it does (the tag must stay near its line). */
const DROP_COST = 36;

/**
 * Stacks the blocks of one price scale: a block keeps its price height unless it would overlap one already placed (lower `prio` first, then by `y`);
 * it then goes to the nearest free slot above or below. A tag whose caption row would not fit near its price loses the caption instead of
 * being pushed away; when the pane is too short for all the captions, the captions of the least important tags go first.
 * Never leaves [lo, hi]; when there is no free slot at all (more tags than room) the block stays at its price height.
 */
export function stackTags(blocks: TagBlock[]): Map<string, TagPlace> {
  const noCap = new Set<string>();
  const order = blocks.slice().sort((a, b) => a.prio - b.prio || a.y - b.y);
  for (;;) {
    const { out, failed } = stackOnce(order, noCap);
    if (!failed) return out;
    const victim = order.slice().reverse().find((b) => b.capH > 0 && !noCap.has(b.id));
    if (!victim) return out;
    noCap.add(victim.id);
  }
}

function stackOnce(order: TagBlock[], noCap: Set<string>): { out: Map<string, TagPlace>; failed: boolean } {
  const out = new Map<string, TagPlace>();
  const placed: { top: number; bottom: number }[] = [];
  let failed = false;
  for (const b of order) {
    let best: { place: TagPlace; cost: number; h: number; ok: boolean } | null = null;
    const canCap = b.capH > 0 && !noCap.has(b.id);
    for (const withCap of canCap ? [true, false] : [false]) {
      const cap = withCap ? b.capH : 0;
      const h = cap + b.bodyH + b.extraH;
      const want = b.y - b.bodyH / 2 - cap; // where the block would sit exactly on its price
      const minTop = b.lo;
      const maxTop = Math.max(b.lo, b.hi - h);
      const clamp = (v: number) => Math.max(minTop, Math.min(maxTop, v));
      const cands = new Set<number>([clamp(want)]);
      for (const p of placed) {
        cands.add(clamp(p.top - GAP - h));
        cands.add(clamp(p.bottom + GAP));
      }
      let top = NaN;
      let cost = Infinity;
      for (const c of cands) {
        if (placed.some((p) => c < p.bottom + GAP && c + h > p.top - GAP)) continue;
        const d = Math.abs(c - want);
        if (d < cost) {
          cost = d;
          top = c;
        }
      }
      let ok = true;
      if (!Number.isFinite(top)) {
        ok = false;
        top = clamp(want); // no room: overlap rather than vanish
        cost = Math.abs(top - want) + 1000;
      }
      const total = cost + (canCap && !withCap ? DROP_COST : 0);
      if (!best || total < best.cost) best = { place: { top, caption: withCap, bodyTop: top + cap, shift: top - want }, cost: total, h, ok };
    }
    if (!best) continue;
    if (!best.ok) failed = true;
    placed.push({ top: best.place.top, bottom: best.place.top + best.h });
    out.set(b.id, best.place);
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
