/* Keeps the largest individual trades (for the "big trades" bubbles). Only the biggest `cap` are kept, so memory stays small
   whatever the number of trades. */

export interface Big {
  /** UTC ms */
  t: number;
  p: number;
  v: number;
  /** 1 = market buy (lifted the ask), 0 = market sell */
  b: 0 | 1;
}

export class BigBook {
  private list: Big[] = [];
  private min = 0;
  constructor(private cap = 400) {}

  add(t: number, p: number, v: number, buy: boolean): void {
    if (v < this.min) return;
    this.list.push({ t, p, v, b: buy ? 1 : 0 });
    if (this.list.length > this.cap * 2) this.trim();
  }

  private trim() {
    this.list.sort((a, b) => b.v - a.v);
    this.list.length = this.cap;
    this.min = this.list[this.cap - 1].v;
  }

  /** The `limit` largest trades in [from, to), oldest first. */
  range(from: number, to: number, limit: number): Big[] {
    const hit = this.list.filter((x) => x.t >= from && x.t < to);
    hit.sort((a, b) => b.v - a.v);
    hit.length = Math.min(hit.length, limit);
    hit.sort((a, b) => a.t - b.t);
    return hit;
  }

  get size(): number {
    return this.list.length;
  }
}
