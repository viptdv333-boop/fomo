import { ruCaFetch } from "./algopack-tls";
import { getIssJson, type Feed } from "./algopack-feed";
import { mskDate } from "./moex-contracts";
import { buildContinuous, continuousSymbol, nextDay, rollDelta, type ChainBar, type ChainContract, type ChainRequest } from "./continuous-futures";

const ISS = "https://iss.moex.com/iss";
type Block = { columns: string[]; data: unknown[][] };
function records(block: Block): Record<string, unknown>[] {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) throw new Error("Incomplete ISS response");
  return block.data.map((r) => Object.fromEntries(block.columns.map((c, i) => [c.toLowerCase(), r[i]])));
}
async function publicJson(url: string): Promise<any> {
  const res = await ruCaFetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("ISS catalogue unavailable: " + res.status);
  return res.json();
}

const catalogues = new Map<string, { at: number; contracts: ChainContract[] }>();
const cataloguePending = new Map<string, Promise<ChainContract[]>>();
/** Includes expired contracts. Never infer expiry from a month code or use current-contract history as a substitute.
 *  Generic over any FORTS family: the shortname filter ^{asset}-{m}.{yy} isolates the family (excludes minis GOLDM/BRM,
 *  spreads and substring matches like SBRF/SILV), and ASSETCODE confirms it. The dated-secid prefix varies (GD for GOLD, Si, BR…). */
export async function getCatalogue(asset: string): Promise<ChainContract[]> {
  const hit = catalogues.get(asset);
  if (hit && Date.now() - hit.at < 6 * 3600000) return hit.contracts;
  const pend = cataloguePending.get(asset);
  if (pend) return pend;
  const shortnameRe = new RegExp(`^${asset}-\\d{1,2}\\.\\d{2}$`);
  const task = (async () => {
    const ids = new Set<string>();
    let start = 0;
    for (let page = 0; ; page++) {
      if (page >= 50) throw new Error(`${asset} catalogue pagination limit reached`);
      const j = await publicJson(`${ISS}/securities.json?q=${encodeURIComponent(asset)}&engine=futures&market=forts&limit=100&start=${start}&iss.meta=off`);
      const rows = records(j.securities);
      if (!rows.length) break;
      for (const r of rows) {
        if (r.type === "futures" && shortnameRe.test(String(r.shortname))) ids.add(String(r.secid));
      }
      start += rows.length;
    }
    if (!ids.size) throw new Error(`Empty ${asset} catalogue`);
    const queue = [...ids];
    const contracts: ChainContract[] = [];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (;;) {
        const secid = queue.shift();
        if (!secid) break;
        const j = await publicJson(`${ISS}/securities/${secid}.json?iss.meta=off&iss.only=description`);
        const d = Object.fromEntries(records(j.description).map((r) => [String(r.name), String(r.value ?? "")]));
        if (d.ASSETCODE !== asset) continue; // a different family caught by the search: not ours
        // Some expired contracts lack FRSTTRADE in ISS (e.g. GOLD GDM6): skip unusable metadata rather than fail the whole
        // family. The remaining contracts' real trading windows still cover the chain (a later contract's first trade fills the gap).
        if (d.TYPE !== "futures" || !/^\d{4}-\d{2}-\d{2}$/.test(d.LSTTRADE) || !/^\d{4}-\d{2}-\d{2}$/.test(d.FRSTTRADE)) continue;
        contracts.push({ secid, first: d.FRSTTRADE, expiry: d.LSTTRADE });
      }
    }));
    if (!contracts.length) throw new Error(`Empty ${asset} catalogue`);
    contracts.sort((a, b) => a.expiry.localeCompare(b.expiry));
    catalogues.set(asset, { at: Date.now(), contracts });
    return contracts;
  })().finally(() => cataloguePending.delete(asset));
  cataloguePending.set(asset, task);
  return task;
}
/** @deprecated use getCatalogue("NG") */
export async function getNgCatalogue(): Promise<ChainContract[]> {
  return getCatalogue("NG");
}

// Public history only. Bounded to roughly 4 MB of raw numbers, including overhead well below a full chart cache.
const barCache = new Map<string, { at: number; rows: ChainBar[] }>();
const barPending = new Map<string, Promise<ChainBar[]>>();
let cachedBarCount = 0;
export async function loadNgBars(secid: string, interval: number, from: string, till: string, feed?: Feed): Promise<ChainBar[]> {
  if (feed?.ap) return fetchNgBars(secid, interval, from, till, feed);
  const key = `${secid}|${interval}|${from}|${till}`;
  const ttl = till < mskDate() ? 3600000 : 10000;
  const hit = barCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.rows;
  const pending = barPending.get(key);
  if (pending) return pending;
  const task = fetchNgBars(secid, interval, from, till, feed).then((rows) => {
    const old = barCache.get(key);
    if (old) { cachedBarCount -= old.rows.length; barCache.delete(key); }
    if (rows.length <= 10000) {
      barCache.set(key, { at: Date.now(), rows });
      cachedBarCount += rows.length;
      while (barCache.size > 128 || cachedBarCount > 40000) {
        const first = barCache.keys().next().value!;
        cachedBarCount -= barCache.get(first)!.rows.length;
        barCache.delete(first);
      }
    }
    return rows;
  }).finally(() => barPending.delete(key));
  barPending.set(key, task);
  return task;
}

async function fetchNgBars(secid: string, interval: number, from: string, till: string, feed?: Feed): Promise<ChainBar[]> {
  if (!/^[A-Za-z]{1,6}[FGHJKMNQUVXZ]\d{1,2}$/.test(secid)) throw new Error("Invalid dated FORTS contract: " + secid);
  const out: ChainBar[] = [];
  let start = 0;
  for (let page = 0; ; page++) {
    if (page >= 40) throw new Error("NG candle pagination limit reached");
    const url = `${ISS}/engines/futures/markets/forts/boards/RFUD/securities/${secid}/candles.json?interval=${interval}&from=${from}&till=${till}&start=${start}&iss.meta=off`;
    const j = feed ? await getIssJson(url, feed) : await publicJson(url);
    if (!j?.candles) throw new Error("NG candle data unavailable: " + secid);
    const rows = records(j.candles);
    if (!rows.length) break;
    for (const r of rows) {
      const b = { timestamp: new Date(String(r.begin).replace(" ", "T")).getTime(), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume ?? 0) };
      if ([r.open, r.high, r.low, r.close].some((v) => v == null) || !Object.values(b).every(Number.isFinite)) throw new Error("Invalid NG candle: " + secid);
      out.push(b);
    }
    start += rows.length;
  }
  return out;
}

// Tiny immutable roll differences only, not entire minute histories. Public daily closes are sufficient.
const deltas = new Map<string, { at: number; value: number }>();
const deltaPending = new Map<string, Promise<number>>();
async function getDelta(oldId: string, newId: string, expiry: string): Promise<number> {
  const key = `${oldId}|${newId}|${expiry}`;
  const hit = deltas.get(key);
  if (hit && Date.now() - hit.at < 86400000) return hit.value;
  const pending = deltaPending.get(key);
  if (pending) return pending;
  const task = (async () => {
    const [a, b] = await Promise.all([loadNgBars(oldId, 24, nextDay(expiry, -31), expiry), loadNgBars(newId, 24, nextDay(expiry, -31), expiry)]);
    const value = rollDelta(a, b, expiry);
    if (deltas.size > 512) deltas.clear();
    deltas.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => deltaPending.delete(key));
  deltaPending.set(key, task);
  return task;
}

export async function getContinuous(request: Omit<ChainRequest, "today">, feed: Feed): Promise<ChainBar[]> {
  const sym = continuousSymbol(request.ticker);
  if (!sym) throw new Error("Not a continuous symbol");
  return buildContinuous(await getCatalogue(sym.asset), { ...request, today: mskDate() }, (id, iv, from, till) => loadNgBars(id, iv, from, till, feed), getDelta);
}
/** @deprecated use getContinuous */
export async function getNgContinuous(request: Omit<ChainRequest, "today">, feed: Feed): Promise<ChainBar[]> {
  return getContinuous(request, feed);
}
