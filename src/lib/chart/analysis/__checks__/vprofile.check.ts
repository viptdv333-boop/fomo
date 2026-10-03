/* Checks of the configurable volume profile maths: POC / value area on distributions with known answers, the 70 % containment
   property, rows by ticks, ranges (last N bars, fixed, session, anchor), real trades vs candle approximation, empty / flat / NaN data,
   speed on 20 000 candles.
   Run: npx tsx src/lib/chart/analysis/__checks__/vprofile.check.ts */
import type { Candle } from "../../types";
import type { FlowBar } from "../../orderflow/types";
import {
  DEFAULT_VP_OPTS,
  buildVp,
  developingVp,
  fmtVolShort,
  formatChartTime,
  highVolumeZones,
  lowVolumeGaps,
  makeGrid,
  parseChartTime,
  profileLevels,
  resolveVpRange,
  valueAreaOf,
  volumeMa,
  type VpFlow,
  type VpOpts,
  type VpRangeSpec,
} from "../vprofile";

let failed = 0;
function expect(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failed++;
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

const T0 = 1_699_999_980_000; // minute aligned
const HOUR = 3_600_000;
const o = (p: Partial<VpOpts> = {}): VpOpts => ({ ...DEFAULT_VP_OPTS, ...p });

/** One candle inside every price cell [100+k, 101+k): all its volume lands in that single row. */
function cellCandles(vols: number[], base = 100): Candle[] {
  return vols.map((v, k) => ({ t: T0 + k * HOUR, o: base + k + 0.2, h: base + k + 0.9, l: base + k + 0.1, c: base + k + 0.8, v }));
}

/* ── known answer: POC, value area, levels ── */
{
  const vols = [10, 20, 40, 80, 100, 60, 30, 20, 10, 5];
  const cs = cellCandles(vols);
  const p = buildVp(cs, 0, cs.length - 1, null, o({ rowMode: "ticks", tickSize: 1, rowTicks: 1, valueArea: 70 }));
  expect("profile built", !!p);
  if (p) {
    expect("10 rows of 1 tick", p.rows.length === 10 && near(p.grid.step, 1), `rows=${p.rows.length} step=${p.grid.step}`);
    expect("row volumes are the candle volumes", vols.every((v, k) => near(p.tot[k], v)));
    expect("volume is conserved", near(p.total, 375) && near(p.volume, 375), `total=${p.total}`);
    expect("POC is row 4 (the 100-volume cell)", p.poc === 4, `poc=${p.poc}`);
    expect("value area (70 %) = rows 2..5", p.vaLo === 2 && p.vaHi === 5, `va=${p.vaLo}..${p.vaHi}`);
    const L = profileLevels(p);
    expect("POC price 104.5", near(L.poc, 104.5), String(L.poc));
    expect("VAL 102 / VAH 106", near(L.val, 102) && near(L.vah, 106), `${L.val} / ${L.vah}`);
    expect("Profile Low / High are the candle extremes", near(L.low, 100.1) && near(L.high, 109.9), `${L.low} / ${L.high}`);
    expect("all candles approximated (no trades)", p.approxBars === 10 && p.realBars === 0);
    const va100 = buildVp(cs, 0, cs.length - 1, null, o({ rowMode: "ticks", tickSize: 1, valueArea: 100 }))!;
    expect("value area 100 % = every row", va100.vaLo === 0 && va100.vaHi === 9);
    const va1 = buildVp(cs, 0, cs.length - 1, null, o({ rowMode: "ticks", tickSize: 1, valueArea: 10 }))!;
    expect("tiny value area = the POC row only", va1.vaLo === 4 && va1.vaHi === 4);
  }
}

/* ── containment: the value area holds >= pct % of the volume and is minimal ── */
{
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let ok = true;
  let minimal = true;
  let cnt = 0;
  for (let trial = 0; trial < 200; trial++) {
    const n = 5 + Math.floor(rnd() * 60);
    const tot = Array.from({ length: n }, () => Math.floor(rnd() * 100) + 1);
    let poc = 0;
    for (let i = 1; i < n; i++) if (tot[i] > tot[poc]) poc = i;
    for (const pct of [50, 68, 70, 80, 95]) {
      const [lo, hi] = valueAreaOf(tot, poc, pct);
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += tot[i];
      const all = tot.reduce((s, x) => s + x, 0);
      if (!(lo <= poc && poc <= hi)) ok = false;
      if (sum < (all * pct) / 100 - 1e-9) ok = false;
      // minimal: the row added last is an edge; without it the area would fall short
      const cuts: number[] = [];
      if (lo !== poc) cuts.push(sum - tot[lo]);
      if (hi !== poc) cuts.push(sum - tot[hi]);
      if (cuts.length && Math.min(...cuts) >= (all * pct) / 100 - 1e-9) minimal = false;
      cnt++;
    }
  }
  expect(`value area contains >= pct % (${cnt} cases)`, ok);
  expect("value area is not larger than needed", minimal);
}

/* ── rows by ticks / by price / by percent / by count ── */
{
  const cs: Candle[] = [{ t: T0, o: 100, h: 101, l: 100, c: 100.5, v: 100 }];
  const g = makeGrid(100, 101, o({ rowMode: "ticks", tickSize: 0.25, rowTicks: 1 }), 100.5);
  expect("0.25 tick rows over 100..101 = 4 rows", g.n === 4 && near(g.step, 0.25) && near(g.lo, 100), JSON.stringify(g));
  const g2 = makeGrid(100.05, 100.95, o({ rowMode: "ticks", tickSize: 0.25, rowTicks: 2 }), 100.5);
  expect("2 ticks rows are aligned to the grid", near(g2.step, 0.5) && near(g2.lo, 100) && g2.n === 2, JSON.stringify(g2));
  const g3 = makeGrid(100, 110, o({ rowMode: "price", rowPrice: 2.5 }), 105);
  expect("row price 2.5 over 10 = 4 rows", g3.n === 4 && near(g3.step, 2.5));
  const g4 = makeGrid(100, 110, o({ rowMode: "percent", rowPct: 1 }), 100);
  expect("row 1 % of 100 = step 1 -> 10 rows", g4.n === 10 && near(g4.step, 1), JSON.stringify(g4));
  const g5 = makeGrid(100, 110, o({ rowMode: "rows", rows: 40 }), 100);
  expect("40 rows", g5.n === 40 && near(g5.step, 0.25));
  const g6 = makeGrid(0, 100000, o({ rowMode: "ticks", tickSize: 0.01 }), 100);
  expect("too many tick rows are coarsened to <= 1000", g6.n <= 1000 && g6.n > 100, JSON.stringify(g6));
  const p = buildVp(cs, 0, 0, null, o({ rowMode: "ticks", tickSize: 0.25 }))!;
  expect("one candle spread evenly over its 4 rows", p.rows.length === 4 && p.rows.every((r) => near(r.up + r.down, 25)), p.rows.map((r) => r.up + r.down).join(","));
}

/* ── polarity of the candle approximation ── */
{
  const up: Candle[] = [{ t: T0, o: 100, h: 110, l: 100, c: 108, v: 100 }];
  const bar = buildVp(up, 0, 0, null, o({ rows: 10, polarity: "bar" }))!;
  const part = buildVp(up, 0, 0, null, o({ rows: 10, polarity: "portion" }))!;
  const sum = (p: typeof bar, k: "up" | "down") => p.rows.reduce((s, r) => s + r[k], 0);
  expect("bar polarity: an up bar is all up volume", near(sum(bar, "up"), 100) && near(sum(bar, "down"), 0));
  expect("bar portion: close at 80 % of the bar -> 80 up / 20 down", near(sum(part, "up"), 80) && near(sum(part, "down"), 20), `${sum(part, "up")} / ${sum(part, "down")}`);
  const dn: Candle[] = [{ t: T0, o: 108, h: 110, l: 100, c: 100, v: 50 }];
  const d = buildVp(dn, 0, 0, null, o({ rows: 5 }))!;
  expect("a down bar is all down volume", near(sum(d, "down"), 50) && near(sum(d, "up"), 0));
}

/* ── real trades ── */
{
  const cs = cellCandles([1000, 1000, 1000]);
  const bars = new Map<number, FlowBar>();
  // bar 0: trades at 100.0 (sell 30, buy 10) and 101.0 (sell 5, buy 55) on a 1.0 grid; bars 1 and 2 stay approximated
  bars.set(cs[0].t, { t: cs[0].t, lv: [100, 30, 10, 101, 5, 55], bid: 35, ask: 65, dh: 0, dl: 0, real: true });
  const flow: VpFlow = { tick: 1, real: (t) => bars.get(t) ?? null };
  const p = buildVp(cs, 0, 2, flow, o({ rowMode: "ticks", tickSize: 1 }))!;
  expect("one real bar + two approximated", p.realBars === 1 && p.approxBars === 2, `${p.realBars}/${p.approxBars}`);
  expect("real bar: buy / sell are the aggressor split", near(p.realBuy, 65) && near(p.realSell, 35));
  expect("real volume sits at its trade prices (row 0: 40, row 1: 60 + approx 1000)", near(p.rows[0].down, 30) && near(p.rows[0].up, 10), `${p.rows[0].down}/${p.rows[0].up}`);
  const noFlow = buildVp(cs, 0, 2, flow, o({ rowMode: "ticks", tickSize: 1, useFlow: false }))!;
  expect("useFlow=false ignores the trades", noFlow.realBars === 0 && noFlow.approxBars === 3);
}

/* ── ranges ── */
{
  const cs = cellCandles(Array.from({ length: 50 }, () => 10));
  const spec = (p: Partial<VpRangeSpec>): VpRangeSpec => ({
    mode: "lastN",
    lastN: 20,
    fromBack: 10,
    toBack: 0,
    fromIso: "",
    toIso: "",
    session: "day",
    anchorTime: 0,
    visFrom: 5,
    visTo: 15,
    wallShift: 0,
    ...p,
  });
  const lastN = resolveVpRange(cs, spec({}))!;
  expect("last 20 bars = 30..49", lastN[0] === 30 && lastN[1] === 49, String(lastN));
  expect("last N larger than the data = everything", JSON.stringify(resolveVpRange(cs, spec({ lastN: 5000 }))) === "[0,49]");
  const prof = buildVp(cs, lastN[0], lastN[1], null, o({ rows: 10 }))!;
  expect("profile of last N has N bars", prof.bars === 20 && near(prof.volume, 200));
  expect("visible range", JSON.stringify(resolveVpRange(cs, spec({ mode: "visible" }))) === "[5,15]");
  expect("fixed range from bars back (10 .. 0)", JSON.stringify(resolveVpRange(cs, spec({ mode: "fixed" }))) === "[39,49]");
  expect("fixed range, from 30 back to 20 back", JSON.stringify(resolveVpRange(cs, spec({ mode: "fixed", fromBack: 30, toBack: 20 }))) === "[19,29]");
  expect("fixed range with swapped ends still works", JSON.stringify(resolveVpRange(cs, spec({ mode: "fixed", fromBack: 3, toBack: 12 }))) === "[37,46]");
  const iso = formatChartTime(cs[10].t);
  const isoTo = formatChartTime(cs[20].t);
  expect("ISO text round-trips to the minute", parseChartTime(iso) === Math.floor(cs[10].t / 60000) * 60000);
  expect("fixed range by time text", JSON.stringify(resolveVpRange(cs, spec({ mode: "fixed", fromIso: iso, toIso: isoTo }))) === "[10,20]", JSON.stringify(resolveVpRange(cs, spec({ mode: "fixed", fromIso: iso, toIso: isoTo }))));
  expect("garbage time text falls back to bars back", JSON.stringify(resolveVpRange(cs, spec({ mode: "fixed", fromIso: "nope" }))) === "[39,49]");
  expect("anchor not placed yet -> no range", resolveVpRange(cs, spec({ mode: "anchor", anchorTime: 0 })) === null);
  expect("anchor at a bar time", JSON.stringify(resolveVpRange(cs, spec({ mode: "anchor", anchorTime: cs[33].t }))) === "[33,49]");
  expect("anchor between two bars starts at the next one", JSON.stringify(resolveVpRange(cs, spec({ mode: "anchor", anchorTime: cs[33].t + 1 }))) === "[34,49]");
  expect("anchor in the future -> no range", resolveVpRange(cs, spec({ mode: "anchor", anchorTime: cs[49].t + 10 * HOUR })) === null);
  const day = resolveVpRange(cs, spec({ mode: "session", session: "day" }))!;
  const startOfDay = Math.floor(cs[49].t / 86_400_000) * 86_400_000;
  expect("session starts at the first bar of the last day", cs[day[0]].t >= startOfDay && (day[0] === 0 || cs[day[0] - 1].t < startOfDay), String(day));
}

/* ── nodes, zones ── */
{
  const vols = [2, 3, 50, 4, 1, 2, 90, 60, 3, 2, 1, 1];
  const cs = cellCandles(vols);
  const p = buildVp(cs, 0, cs.length - 1, null, o({ rowMode: "ticks", tickSize: 1 }))!;
  const gaps = lowVolumeGaps(p, 7); // <= 6.3
  expect("the gaps are the thin rows between traded prices (3,4,5 and 8..11 are not all interior)", gaps.length >= 1 && gaps.every((z) => z.r0 > 2 && z.r1 < 9), JSON.stringify(gaps.map((z) => [z.r0, z.r1])));
  expect("rows 3..5 form one gap", gaps.some((z) => z.r0 === 3 && z.r1 === 5), JSON.stringify(gaps.map((z) => [z.r0, z.r1])));
  const hv = highVolumeZones(p, 40); // >= 54
  expect("high-volume zone = rows 6..7 (90, 60)", hv.length === 1 && hv[0].r0 === 6 && hv[0].r1 === 7, JSON.stringify(hv.map((z) => [z.r0, z.r1])));
  expect("zone prices follow the rows", near(hv[0].lo, 106) && near(hv[0].hi, 108));
  expect("0 % threshold = the POC row only", highVolumeZones(p, 0).length === 1 && highVolumeZones(p, 0)[0].r0 === 6);
}

/* ── smoothing keeps the volume, lowers the peak ── */
{
  const cs = cellCandles([1, 1, 100, 1, 1, 1, 1, 1]);
  const raw = buildVp(cs, 0, 7, null, o({ rowMode: "ticks", tickSize: 1 }))!;
  const sm = buildVp(cs, 0, 7, null, o({ rowMode: "ticks", tickSize: 1, smooth: 2 }))!;
  expect("smoothing keeps the total", near(sm.total, raw.total, 1e-9), `${sm.total} vs ${raw.total}`);
  expect("smoothing lowers the peak", sm.max < raw.max && sm.poc === raw.poc);
}

/* ── developing POC ── */
{
  const vols = [10, 20, 40, 80, 100, 60, 30, 20, 10, 5];
  const cs = cellCandles(vols);
  const opts = o({ rowMode: "ticks", tickSize: 1 });
  const p = buildVp(cs, 0, 9, null, opts)!;
  const d = developingVp(cs, 0, 9, null, p.grid, opts, true);
  expect("developing POC of the first bar is its own row", near(d.poc[0], 100.5));
  expect("the last developing POC / VA equal the final ones", near(d.poc[9], 104.5) && near(d.vah[9], 106) && near(d.val[9], 102), `${d.poc[9]} ${d.vah[9]} ${d.val[9]}`);
  expect("developing POC moves with the volume (bar 3 -> 103.5)", near(d.poc[3], 103.5), String(d.poc[3]));
}

/* ── stats helpers ── */
{
  expect("213784 -> 213.784K", fmtVolShort(213784) === "213.784K", fmtVolShort(213784));
  expect("594 -> 594", fmtVolShort(594) === "594", fmtVolShort(594));
  expect("1.25M", fmtVolShort(1_250_000) === "1.250M");
  expect("NaN -> dash", fmtVolShort(NaN) === "—");
  const cs = cellCandles([10, 20, 30, 40, 50]);
  expect("volume MA(3) at the last bar = 40", near(volumeMa(cs, 4, 3), 40));
  expect("volume MA(21) with fewer bars averages what exists", near(volumeMa(cs, 4, 21), 150 / 21 === 0 ? 0 : (10 + 20 + 30 + 40 + 50) / 5));
}

/* ── empty / flat / NaN: never throws ── */
{
  expect("empty data -> null", buildVp([], 0, 10, null, o()) === null);
  expect("inverted range -> null", buildVp(cellCandles([1, 2, 3]), 2, 0, null, o()) === null);
  expect("range outside the data is clamped", buildVp(cellCandles([5, 5, 5]), -10, 100, null, o({ rows: 4 }))!.bars === 3);
  expect("no resolve on empty data", resolveVpRange([], { mode: "lastN", lastN: 10, fromBack: 0, toBack: 0, fromIso: "", toIso: "", session: "day", anchorTime: 0, visFrom: 0, visTo: 0, wallShift: 0 }) === null);
  const flat: Candle[] = Array.from({ length: 5 }, (_, i) => ({ t: T0 + i * HOUR, o: 50, h: 50, l: 50, c: 50, v: 10 }));
  const fp = buildVp(flat, 0, 4, null, o())!;
  expect("flat market -> one row holding all the volume", !!fp && fp.rows.length === 1 && near(fp.total, 50) && fp.poc === 0 && fp.vaLo === 0 && fp.vaHi === 0);
  const lv = profileLevels(fp);
  expect("flat market levels are finite and ordered", [lv.high, lv.vah, lv.poc, lv.val, lv.low].every(Number.isFinite) && lv.val <= lv.poc && lv.poc <= lv.vah);
  expect("no volume at all -> null", buildVp(flat.map((c) => ({ ...c, v: 0 })), 0, 4, null, o()) === null);
  const bad: Candle[] = [
    { t: T0, o: NaN, h: NaN, l: NaN, c: NaN, v: NaN },
    { t: T0 + HOUR, o: 10, h: 12, l: 9, c: 11, v: 100 },
    { t: T0 + 2 * HOUR, o: 10, h: Infinity, l: 9, c: 11, v: 100 },
    { t: T0 + 3 * HOUR, o: 10, h: 12, l: 9, c: 11, v: -5 },
  ];
  const bp = buildVp(bad, 0, 3, null, o({ rows: 6 }));
  expect("NaN / Infinity / negative volume bars are skipped", !!bp && near(bp.volume, 100) && bp.rows.every((r) => Number.isFinite(r.up) && Number.isFinite(r.down)));
  expect("every output number is finite", !!bp && Number.isFinite(bp.total) && Number.isFinite(bp.max) && Number.isFinite(bp.lo) && Number.isFinite(bp.hi));
  const dv = developingVp(bad, 0, 3, null, bp!.grid, o(), true);
  expect("developing series on bad data does not throw", dv.poc.length === 4);
}

/* ── speed: 20 000 candles ── */
{
  let seed = 99;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cs: Candle[] = [];
  let px = 100;
  for (let i = 0; i < 20000; i++) {
    const oo = px;
    px += (rnd() - 0.5) * 0.4;
    cs.push({ t: T0 + i * 60_000, o: oo, h: Math.max(oo, px) + rnd() * 0.1, l: Math.min(oo, px) - rnd() * 0.1, c: px, v: 100 + rnd() * 900 });
  }
  const t0 = Date.now();
  const p = buildVp(cs, 0, cs.length - 1, null, o({ rows: 100 }))!;
  const t1 = Date.now();
  const d = developingVp(cs, 0, cs.length - 1, null, p.grid, o({ rows: 100 }), true);
  const t2 = Date.now();
  expect("20k candles / 100 rows profile in < 120 ms", t1 - t0 < 120, `${t1 - t0} ms`);
  expect("20k candles developing POC + VA in < 800 ms", t2 - t1 < 800, `${t2 - t1} ms`);
  expect("developing final == profile", near(d.poc[19999], profileLevels(p).poc));
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
