import assert from "node:assert/strict";
import { cleanCandles, mergeCandle } from "../src/lib/chart/candles";
import { aggregateChain, buildContinuous, chainSegments, continuousDay, continuousRank, continuousSymbol, nextDay, ngContinuousRank, rollDelta, shiftBar, wallDay, type ChainBar, type ChainContract, type ChainLoader } from "../src/lib/continuous-futures";
import { chainContracts } from "../src/lib/ng-symbols";

const contracts: ChainContract[] = [
  { secid: "NGF6", first: "2025-10-01", expiry: "2026-01-28" },
  { secid: "NGG6", first: "2025-11-01", expiry: "2026-02-25" },
  { secid: "NGH6", first: "2025-12-01", expiry: "2026-03-27" },
  { secid: "NGJ6", first: "2026-01-01", expiry: "2026-04-28" },
];
const bar = (day: string, close: number, volume = 5): ChainBar => ({ timestamp: new Date(day + "T12:00:00").getTime(), open: close - .1, high: close + .2, low: close - .2, close, volume });
const prices: Record<string, ChainBar[]> = {
  NGF6: [bar("2026-01-27", 3), bar("2026-01-28", 3.1)],
  NGG6: [bar("2026-01-27", 4), bar("2026-01-28", 4.1), bar("2026-01-29", 4.2), bar("2026-02-25", 4.3)],
  NGH6: [bar("2026-01-28", 6.1), bar("2026-01-29", 6.2), bar("2026-02-25", 6.3), bar("2026-02-26", 6.4), bar("2026-03-02", 6.5)],
  NGJ6: [bar("2026-02-25", 5.3), bar("2026-02-26", 5.4), bar("2026-03-02", 5.5)],
};
const original = JSON.stringify(prices);
const load: ChainLoader = async (id, _iv, from, till) => prices[id].filter((b) => wallDay(b.timestamp) >= from && wallDay(b.timestamp) <= till);
const delta = async (a: string, b: string, day: string) => rollDelta(prices[a], prices[b], day);
const request = { ticker: "NG1!", interval: "D", limit: 20, adjusted: false, today: "2026-03-02" };

async function check() {
  assert.equal(ngContinuousRank("NG1!"), 1);
  assert.equal(ngContinuousRank("NG2!"), 2);
  assert.equal(ngContinuousRank("NGZ6"), null);
  assert.equal(ngContinuousRank("NG"), null);
  assert.equal(chainSegments(contracts, 1, "2026-01-28").at(-1)?.contract.secid, "NGF6");
  assert.equal(chainSegments(contracts, 1, "2026-01-29").at(-1)?.contract.secid, "NGG6");
  assert.equal(chainSegments(contracts, 2, "2026-01-28").at(-1)?.contract.secid, "NGG6");
  assert.equal(chainSegments(contracts, 2, "2026-01-29").at(-1)?.contract.secid, "NGH6");
  assert.equal(chainSegments(contracts, 1, "2026-03-28").at(-1)?.contract.secid, "NGJ6", "Friday expiry rolls on the following day, even on a weekend");
  const raw = await buildContinuous(contracts, request, load, delta);
  assert.deepEqual(raw.map((b) => b.close), [3, 3.1, 4.2, 4.3, 6.4, 6.5]);
  const adjusted = await buildContinuous(contracts, { ...request, adjusted: true }, load, delta);
  assert.deepEqual(adjusted.map((b) => b.close), [6, 6.1, 6.2, 6.3, 6.4, 6.5]);
  assert.deepEqual(adjusted.map((b) => b.volume), raw.map((b) => b.volume));
  assert.deepEqual(adjusted.at(-1), raw.at(-1), "Current contract prices never move");
  const second = await buildContinuous(contracts, { ...request, ticker: "NG2!" }, load, delta);
  assert.deepEqual(second.map((b) => b.close), [4, 4.1, 6.2, 6.3, 5.4, 5.5]);
  const secondAdj = await buildContinuous(contracts, { ...request, ticker: "NG2!", adjusted: true }, load, delta);
  assert.deepEqual(secondAdj.map((b) => b.close), [5, 5.1, 5.2, 5.3, 5.4, 5.5], "Second contract rolls use the FRONT expiry, not its own expiry");
  const to = new Date("2026-01-29T23:59:59").getTime();
  const page = await buildContinuous(contracts, { ...request, adjusted: true, to, limit: 2 }, load, delta);
  assert.deepEqual(page, adjusted.filter((b) => b.timestamp <= to).slice(-2), "Historical page stays anchored to today's chain");
  const nextPage = await buildContinuous(contracts, { ...request, adjusted: true, to: page[0].timestamp - 1, limit: 2 }, load, delta);
  assert.deepEqual([...nextPage, ...page], adjusted.filter((b) => b.timestamp <= to));
  const monthly = await buildContinuous(contracts, { ...request, adjusted: true, interval: "M" }, load, delta);
  assert.deepEqual(monthly.map((b) => [b.open, b.close, b.volume]), [[5.9, 6.2, 15], [6.2, 6.4, 10], [6.4, 6.5, 5]]);
  const weekly = aggregateChain(raw, "W");
  assert.equal(weekly[0].volume, 15, "No duplicated bars or volume at a midweek roll");
  assert.equal(weekly[0].high, 4.4);
  assert.equal(rollDelta([bar("2026-01-27", 3)], [bar("2026-01-27", 4), bar("2026-01-28", 9)], "2026-01-28"), 1, "Use last COMMON daily close");
  assert.throws(() => rollDelta([bar("2026-01-27", 3)], [bar("2026-01-28", 4)], "2026-01-28"));
  assert.equal(shiftBar(bar("2026-01-27", 3), -5).close, -2, "Backward adjustment can legitimately make historical prices negative");
  const zero = { t: 1, o: -.1, h: .2, l: -.2, c: 0, v: 5 };
  assert.deepEqual(cleanCandles([zero], true), [zero], "Adjusted zero close is a legitimate price");
  assert.equal(cleanCandles([zero]).length, 0, "Raw-feed zero validation remains unchanged");
  const zeroHistory = [{ ...zero, t: 0, c: .1 }];
  mergeCandle(zeroHistory, zero, true);
  assert.deepEqual(zeroHistory.at(-1), zero);
  assert.equal(JSON.stringify(prices), original, "Real dated contracts remain unchanged");
  await assert.rejects(() => buildContinuous(contracts, request, async () => { throw new Error("offline"); }, delta), /offline/);
  console.log("PASS: NG1/NG2 expiry roll, additive B-ADJ, page consistency, calendar OHLCV, immutable real contracts, missing data");

  if (process.argv.includes("--live")) {
    const { installRuCaFetch } = await import("../src/lib/algopack-tls");
    installRuCaFetch();
    const { getNgCatalogue, loadNgBars, getNgContinuous } = await import("../src/lib/moex-continuous");
    const catalogue = await getNgCatalogue();
    const endDay = nextDay(continuousDay(), -1);
    const outgoing = catalogue.filter((c) => c.expiry <= endDay).at(-1)!;
    assert.ok(outgoing);
    const feed = () => ({ ap: false, apHits: 0, apMiss: 0, apReason: "" });
    // Closed days only: the exchange must not change a forming bar between assertions.
    const req = { ticker: "NG1!", interval: "D", limit: 45, adjusted: false, to: new Date(endDay + "T23:59:59").getTime() };
    const rawLive = await getNgContinuous(req, feed());
    const adjLive = await getNgContinuous({ ...req, adjusted: true }, feed());
    const rank2 = await getNgContinuous({ ...req, ticker: "NG2!" }, feed());
    assert.equal(rawLive.length, 45);
    assert.equal(adjLive.length, 45);
    assert.equal(rank2.length, 45);
    assert.ok(rawLive.some((b, i) => b.close !== adjLive[i].close));
    const pageLive = await getNgContinuous({ ...req, adjusted: true, to: adjLive[25].timestamp - 1, limit: 10 }, feed());
    assert.deepEqual(pageLive, adjLive.slice(15, 25));
    const oldDaily = await loadNgBars(outgoing.secid, 24, outgoing.expiry, outgoing.expiry);
    const atRoll = rawLive.find((b) => wallDay(b.timestamp) === outgoing.expiry);
    assert.ok(atRoll && oldDaily.length, "The latest expiry is covered by actual daily bars");
    assert.deepEqual(atRoll, oldDaily[0], "Real last-day candle survives unadjusted chain");
    const hourly = await getNgContinuous({ ...req, interval: "60", limit: 80, adjusted: true }, feed());
    const minute = await getNgContinuous({ ...req, interval: "5", limit: 50, adjusted: true }, feed());
    assert.equal(hourly.length, 80);
    assert.equal(minute.length, 50);
    console.log(JSON.stringify({ live: "PASS", catalogue: catalogue.length, first: catalogue[0], expiryChecked: outgoing.expiry, daily: rawLive.length, hourly: hourly.length, fiveMinute: minute.length }));
  }
}
// --- multi-asset generalization: continuous symbols/chains are not gas-specific
assert.deepEqual(continuousSymbol("NG1!"), { asset: "NG", rank: 1 });
assert.deepEqual(continuousSymbol("GOLD2!"), { asset: "GOLD", rank: 2 });
assert.deepEqual(continuousSymbol("BR1!"), { asset: "BR", rank: 1 });
assert.deepEqual(continuousSymbol("Si1!"), { asset: "Si", rank: 1 });
assert.deepEqual(continuousSymbol("MIX2!"), { asset: "MIX", rank: 2 });
assert.equal(continuousSymbol("NGZ6"), null); // a dated contract, not continuous
assert.equal(continuousSymbol("GOLD"), null); // the family itself, not continuous
assert.equal(continuousRank("GOLD1!"), 1);
assert.equal(ngContinuousRank("BR2!"), 2); // deprecated alias still general
const goldChain = chainContracts("GOLD", "Золото", "ru");
assert.deepEqual(goldChain.map((c) => c.ticker), ["GOLD1!", "GOLD2!"]);
assert.ok(goldChain.every((c) => c.kind === "continuous" && c.expiry === null));
assert.equal(goldChain[0].shortname, "Золото · склейка 1");
// the chain builder is asset-agnostic: a GOLD1! request over the same chain stitches like NG1!
(async () => {
  const today = "2026-03-02";
  const ng = await buildContinuous(contracts, { ticker: "NG1!", interval: "D", limit: 6, adjusted: false, today }, load, delta);
  const gold = await buildContinuous(contracts, { ticker: "GOLD1!", interval: "D", limit: 6, adjusted: false, today }, load, delta);
  assert.deepEqual(gold, ng, "continuous stitching does not depend on the asset code");
  assert.ok(gold.length > 0);
  console.log("multi-asset: PASS (NG/GOLD/BR/Si/MIX symbols, GOLD chain contracts, asset-agnostic stitching)");
})();
check().catch((e) => { console.error(e); process.exitCode = 1; });
