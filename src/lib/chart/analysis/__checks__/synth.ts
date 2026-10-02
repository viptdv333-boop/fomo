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

export const SCENARIOS: Record<string, { cs: SwingCandle[]; want: string[]; bias: -1 | 1; required: boolean; upto?: number }> = {
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
  wedge_rising: { cs: build([[20, 130], [6, 124], [8, 135], [6, 129.5], [7, 137.5], [6, 133.5], [6, 139], [5, 136.5], [8, 126], [8, 118]], 0.3, 100), want: ["wedge_rising"], bias: -1, required: true },
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
  rounding_top: { cs: build([[20, 70], ...bowl(50, 70, 100), [8, 62], [8, 52]], 0.35, 100), want: ["rounding_top"], bias: -1, required: false },
};
