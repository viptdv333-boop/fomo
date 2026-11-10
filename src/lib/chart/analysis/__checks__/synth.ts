/* Synthetic textbook price paths used by the pattern checks and the demo page. */
import type { SwingCandle } from "../swings";

type Pt = [number, number]; // [bars, price]

export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Piecewise linear closes with noise -> candles (60 quiet lead-in bars first). */
export function build(pts: Pt[], noise = 0.45, start = 100, seed = 12345, withVol = true): SwingCandle[] {
  const rnd = makeRng(seed);
  const out: SwingCandle[] = [];
  let price = start;
  let t = 1_700_000_000_000;
  const push = (c: number, v: number) => {
    const o = price;
    out.push({ t, o, h: Math.max(o, c) + rnd() * noise, l: Math.min(o, c) - rnd() * noise, c, v });
    price = c;
    t += 3_600_000;
  };
  for (let i = 0; i < 60; i++) push(start + (rnd() - 0.5) * noise * 2, 1000);
  for (const [bars, target] of pts) {
    const from = price;
    for (let i = 1; i <= bars; i++) push(from + ((target - from) * i) / bars + (rnd() - 0.5) * noise * 1.2, withVol ? 800 + rnd() * 400 : 0);
  }
  return out;
}

/** Parabola samples (rounding bottom / cup): bars along y = bottom + (rim - bottom) * (2t-1)^2 */
function bowl(bars: number, rim: number, bottom: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= bars; i++) {
    const t = i / bars;
    out.push([1, bottom + (rim - bottom) * (2 * t - 1) ** 2]);
  }
  return out;
}

/** Mirror image of a path around a price (a top becomes a bottom). */
export function mirror(cs: SwingCandle[], around: number): SwingCandle[] {
  return cs.map((k) => ({ t: k.t, o: 2 * around - k.o, h: 2 * around - k.l, l: 2 * around - k.h, c: 2 * around - k.c, v: k.v }));
}

/** Moves the bars [from, to) by `by`: two gaps around them (an island). */
export function shiftBars(cs: SwingCandle[], from: number, to: number, by: number): SwingCandle[] {
  return cs.map((k, i) => (i >= from && i < to ? { ...k, o: k.o + by, h: k.h + by, l: k.l + by, c: k.c + by } : k));
}

const DIAMOND = build([[20, 132], [5, 127], [6, 135.8], [7, 122.6], [8, 141], [8, 117], [7, 136.3], [6, 123], [5, 133], [4, 127], [8, 112], [8, 100]], 0.3, 100);
const BROAD_WEDGE = build([[12, 110], [6, 104], [8, 118], [8, 107], [9, 126], [9, 110], [5, 119], [8, 102], [6, 94]], 0.3, 96);
const BROAD_RA = build([[10, 106], [6, 100], [8, 112], [8, 100.2], [9, 118], [9, 100], [5, 108], [6, 96], [6, 84]], 0.3, 96);
const V_TOP = build([[14, 130], [10, 108], [6, 100]], 0.35, 100);
const ISLAND = shiftBars(build([[20, 120], [5, 120.6], [10, 106]], 0.3, 100), 80, 85, 4);
const DRIVES = build([[8, 100], [12, 120], [8, 108], [12, 123.26], [8, 113.83], [12, 125.83], [8, 108], [8, 100]], 0.3, 104);
const BARR = build([[6, 105], [6, 101.8], [6, 106.8], [6, 103.6], [6, 108.6], [6, 105.4], [10, 122], [4, 123], [4, 121], [10, 106], [8, 98]], 0.3, 100);
const WEDGE_CONT = build([[20, 124], [8, 135], [6, 129.5], [7, 137.5], [6, 133.5], [6, 139], [5, 136.5], [8, 126], [8, 118]], 0.3, 170);
const DT_FLAT = build([[20, 125], [5, 130], [12, 114], [12, 130.5], [14, 102], [10, 96]], 0.45, 150);
const HS_FLAT = build([[18, 112], [5, 120], [8, 108], [10, 132], [10, 108.5], [8, 121], [14, 98], [10, 92]], 0.45, 150);

export const SCENARIOS: Record<string, { cs: SwingCandle[]; want: string[]; bias: -1 | 1; required: boolean; upto?: number; role?: "reversal" | "continuation" }> = {
  double_top: { cs: build([[25, 130], [12, 114], [12, 130.5], [14, 102], [10, 96]]), want: ["double_top"], bias: -1, required: true },
  double_bottom: { cs: build([[25, 70], [12, 86], [12, 69.5], [14, 98], [10, 106]]), want: ["double_bottom"], bias: 1, required: true },
  triple_top: { cs: build([[22, 130], [8, 116], [8, 130.3], [8, 116.4], [8, 129.8], [12, 100], [8, 94]]), want: ["triple_top"], bias: -1, required: false },
  hs: { cs: build([[18, 120], [8, 108], [10, 132], [10, 108.5], [8, 121], [14, 98], [10, 92]]), want: ["hs"], bias: -1, required: true },
  ihs: { cs: build([[18, 80], [8, 92], [10, 68], [10, 91.5], [8, 79], [14, 102], [10, 108]]), want: ["ihs"], bias: 1, required: true },
  tri_asc: { cs: build([[25, 100], [8, 90], [8, 100], [8, 93.5], [7, 100], [6, 96.5], [5, 100], [4, 98], [8, 108], [8, 114]], 0.35, 75), want: ["tri_asc"], bias: 1, required: true },
  tri_desc: { cs: build([[25, 60], [8, 70], [8, 60], [8, 67], [7, 60], [6, 63.5], [5, 60], [4, 62], [8, 52], [8, 46]], 0.35, 85), want: ["tri_desc"], bias: -1, required: false },
  tri_sym: { cs: build([[25, 120], [8, 100], [8, 118], [8, 106], [7, 114], [6, 109], [6, 113], [8, 122], [8, 128]], 0.35, 90), want: ["tri_sym"], bias: 1, required: false },
  flag_bull: { cs: build([[14, 140], [4, 135], [5, 139], [4, 134.2], [5, 138], [4, 133.5], [5, 137], [3, 134], [8, 146], [8, 156]], 0.3, 100), want: ["flag_bull", "pennant_bull"], bias: 1, required: true },
  flag_bear: { cs: build([[14, 60], [4, 65], [5, 61], [4, 65.8], [5, 62], [4, 66.5], [5, 63], [3, 66], [8, 54], [8, 44]], 0.3, 100), want: ["flag_bear", "pennant_bear"], bias: -1, required: false },
  pennant: { cs: build([[14, 140], [4, 131], [4, 138], [4, 133], [4, 136.8], [4, 134], [3, 136], [8, 146], [8, 156]], 0.25, 100), want: ["pennant_bull", "flag_bull"], bias: 1, required: false },
  wedge_rising: { cs: build([[20, 130], [6, 124], [8, 135], [6, 129.5], [7, 137.5], [6, 133.5], [6, 139], [5, 136.5], [8, 126], [8, 118]], 0.3, 100), want: ["wedge_rising"], bias: -1, required: true, role: "reversal" },
  wedge_falling: { cs: build([[20, 70], [6, 76], [8, 66], [6, 70.5], [7, 62.5], [6, 66.5], [6, 61], [5, 63.5], [8, 74], [8, 82]], 0.3, 100), want: ["wedge_falling"], bias: 1, required: false },
  rectangle: { cs: build([[25, 100], [8, 110], [8, 100.5], [8, 110], [8, 100.5], [8, 109.8], [8, 101], [6, 112], [8, 122]], 0.3, 75), want: ["rectangle"], bias: 1, required: true },
  channel_up: { cs: build([[10, 104], [8, 100], [10, 112], [8, 108], [10, 120], [8, 116], [10, 128], [8, 124], [8, 136], [10, 118], [6, 108]], 0.3, 96), want: ["channel_up"], bias: -1, required: false },
  broadening: { cs: build([[10, 106], [8, 98], [10, 112], [8, 92], [10, 118], [8, 86], [8, 112], [8, 95]], 0.35, 100), want: ["broadening"], bias: 1, required: false },
  cup: {
    cs: build([[20, 130], ...bowl(50, 130, 100), [6, 123], [6, 129.5], [8, 138], [8, 150]], 0.35, 100),
    want: ["cup", "rounding_bottom"],
    bias: 1,
    required: false,
  },
  // a rounding top is a reversal: it needs an advance in front of it
  rounding_top: { cs: build([[14, 76], [5, 70], ...bowl(50, 70, 100), [8, 62], [8, 52]], 0.35, 50), want: ["rounding_top"], bias: -1, required: false },
  rounding_bottom: { cs: mirror(build([[14, 76], [5, 70], ...bowl(50, 70, 100), [8, 62], [8, 52]], 0.35, 50), 100), want: ["rounding_bottom"], bias: 1, required: false },
  cup_inv: { cs: mirror(build([[20, 130], ...bowl(50, 130, 100), [6, 123], [6, 129.5], [8, 138], [8, 150]], 0.35, 100), 100), want: ["cup_inv"], bias: -1, required: true },
  diamond_top: { cs: DIAMOND, want: ["diamond_top"], bias: -1, required: true },
  diamond_bottom: { cs: mirror(DIAMOND, 100), want: ["diamond_bottom"], bias: 1, required: true },
  broad_wedge_asc: { cs: BROAD_WEDGE, want: ["broad_wedge_asc"], bias: -1, required: true },
  broad_wedge_desc: { cs: mirror(BROAD_WEDGE, 100), want: ["broad_wedge_desc"], bias: 1, required: true },
  broad_ra_asc: { cs: BROAD_RA, want: ["broad_ra_asc"], bias: -1, required: true },
  broad_ra_desc: { cs: mirror(BROAD_RA, 100), want: ["broad_ra_desc"], bias: 1, required: true },
  v_top: { cs: V_TOP, want: ["v_top"], bias: -1, required: true },
  v_bottom: { cs: mirror(V_TOP, 100), want: ["v_bottom"], bias: 1, required: true },
  island_top: { cs: ISLAND, want: ["island_top"], bias: -1, required: true },
  island_bottom: { cs: mirror(ISLAND, 100), want: ["island_bottom"], bias: 1, required: true },
  drives_top: { cs: DRIVES, want: ["drives_top"], bias: -1, required: true },
  drives_bottom: { cs: mirror(DRIVES, 100), want: ["drives_bottom"], bias: 1, required: true },
  barr_top: { cs: BARR, want: ["barr_top"], bias: -1, required: true },
  barr_bottom: { cs: mirror(BARR, 100), want: ["barr_bottom"], bias: 1, required: true },
  // wedges as continuation: a rising wedge inside a decline, a falling wedge inside an advance
  wedge_rising_cont: { cs: WEDGE_CONT, want: ["wedge_rising"], bias: -1, required: true, role: "continuation" },
  wedge_falling_cont: { cs: mirror(WEDGE_CONT, 130), want: ["wedge_falling"], bias: 1, required: true, role: "continuation" },
};

/** Shapes that must NOT be reported: reversal figures without the trend they are supposed to reverse. */
export const NEGATIVES: Record<string, { cs: SwingCandle[]; never: string[] }> = {
  double_top_no_uptrend: { cs: DT_FLAT, never: ["double_top"] },
  double_bottom_no_downtrend: { cs: mirror(DT_FLAT, 100), never: ["double_bottom"] },
  triple_top_no_uptrend: { cs: build([[20, 126], [4, 130], [8, 116], [8, 130.3], [8, 116.4], [8, 129.8], [12, 100], [8, 94]], 0.45, 150), never: ["triple_top"] },
  hs_no_uptrend: { cs: HS_FLAT, never: ["hs"] },
  ihs_no_downtrend: { cs: mirror(HS_FLAT, 100), never: ["ihs"] },
  rounding_top_no_uptrend: { cs: build([[20, 70], ...bowl(50, 70, 100), [8, 62], [8, 52]], 0.35, 100), never: ["rounding_top"] },
};
