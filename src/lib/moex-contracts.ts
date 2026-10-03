/**
 * FORTS (MOEX derivatives) contracts per underlying, from ISS.
 *
 * ISS lists every tradable futures contract on one board (RFUD). `ASSETCODE` groups the dated contracts of one underlying
 * (MIX -> MXZ6 MXH7 ...), `SECTYPE` is the two letter contract prefix. Perpetual ("вечные") futures are listed on the same
 * board as ordinary rows but carry `LASTTRADEDATE = 2100-01-01` and a SECID of the form <underlying>F (IMOEXF, USDRUBF,
 * SBERF, BTCUSDF ...), their SHORTNAME equals the SECID (dated ones are "MIX-12.26"). Each perpetual is attached to the
 * dated family of the same underlying when there is one (PERP_PARENT), otherwise it is a family of its own.
 *
 * This module has no Next / DB imports: it is used by the API routes, the order flow collector and the alert scheduler.
 * Classification (`buildFamilies`) is pure and unit-testable from a captured ISS response.
 */

const ISS = "https://iss.moex.com/iss";
const FORTS_URL = `${ISS}/engines/futures/markets/forts/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,BOARDID,SHORTNAME,SECNAME,ASSETCODE,LASTTRADEDATE,SECTYPE,LOTVOLUME,DECIMALS,MINSTEP`;

export type ContractKind = "perpetual" | "quarterly" | "monthly" | "weekly";
export type Lang = "ru" | "en" | "cn";

export interface FortsRaw {
  secid: string;
  board: string;
  shortname: string;
  secname: string;
  asset: string;
  sectype: string;
  /** YYYY-MM-DD, "" when unknown */
  lastTrade: string;
  lot: number;
  decimals: number;
  minstep: number;
}

export interface FortsContract {
  secid: string;
  board: string;
  shortname: string;
  /** underlying code the contract is grouped by (ASSETCODE of the family) */
  asset: string;
  sectype: string;
  kind: ContractKind;
  /** YYYY-MM-DD, null for a perpetual */
  expiry: string | null;
  /** 1 = front (current), 2 = next ... among dated contracts of the family; 0 for a perpetual */
  order: number;
  /** calendar days to the last trade day (Moscow date), null for a perpetual */
  daysLeft: number | null;
  lot: number;
  decimals: number;
  minstep: number;
}

export interface ContractFamily {
  /** ASSETCODE of the dated contracts (or the perpetual's own SECID for a standalone perpetual) */
  asset: string;
  /** base name from the SHORTNAME, "MIX" for "MIX-12.26" */
  name: string;
  /** the terminal ticker meaning "auto front month" for this underlying (curated name or "<ASSET>.F") */
  auto: string;
  /** dated contracts by expiry, the perpetual (if any) last */
  contracts: FortsContract[];
}

/* ── generic (auto front month) tickers ── */

/** Generic terminal tickers whose underlying code differs from the ticker. Everything else generic equals the ASSETCODE. */
const GENERIC_ALIAS: Record<string, string> = { CU: "COPPER", CR: "CNY", BTCF: "BTC", KC: "COFFEE" };
/** Generic tickers of the curated terminal list (kept working as "auto front month"). */
export const GENERIC_FUTURES = new Set([
  "BR", "GOLD", "SILV", "PLT", "PLD", "NG", "WHEAT", "COCOA", "SUGAR", "CU", "Si", "Eu", "CR", "NASD", "SPYF", "MIX", "RTS", "BTCF", "KC",
]);
/** perpetual SECID -> ASSETCODE of the dated family of the same underlying */
export const PERP_PARENT: Record<string, string> = {
  IMOEXF: "MIX", USDRUBF: "Si", EURRUBF: "Eu", CNYRUBF: "CNY", GLDRUBF: "GL", SLVRUBF: "SL", SBERF: "SBRF", GAZPF: "GAZR",
  RGBIF: "RGBI", BTCUSDF: "BTC", ETHUSDF: "ETH", SOLUSDF: "SOL", XRPUSDF: "XRP", TRXUSDF: "TRX", SP500F: "SPYF", QQQF: "NASD",
};
const AUTO_SUFFIX = ".F";

/** the terminal ticker that means "auto front month" of an underlying */
export function autoTicker(asset: string): string {
  for (const [g, a] of Object.entries(GENERIC_ALIAS)) if (a === asset) return g;
  return GENERIC_FUTURES.has(asset) ? asset : asset + AUTO_SUFFIX;
}

/* ── pure classification ── */

export function parseFortsRows(columns: string[], data: unknown[][]): FortsRaw[] {
  const ix = (n: string) => columns.indexOf(n);
  const c = { id: ix("SECID"), board: ix("BOARDID"), sn: ix("SHORTNAME"), nm: ix("SECNAME"), as: ix("ASSETCODE"), lt: ix("LASTTRADEDATE"), st: ix("SECTYPE"), lot: ix("LOTVOLUME"), dec: ix("DECIMALS"), ms: ix("MINSTEP") };
  const out: FortsRaw[] = [];
  for (const r of data) {
    const secid = String(r[c.id] ?? "");
    if (!secid) continue;
    out.push({
      secid,
      board: String(r[c.board] ?? "RFUD"),
      shortname: String(r[c.sn] ?? secid),
      secname: String(r[c.nm] ?? ""),
      asset: String(r[c.as] ?? ""),
      sectype: String(r[c.st] ?? ""),
      lastTrade: r[c.lt] ? String(r[c.lt]).slice(0, 10) : "",
      lot: Number(r[c.lot]) || 1,
      decimals: Number(r[c.dec]) || 0,
      minstep: Number(r[c.ms]) || 0,
    });
  }
  return out;
}

/** Moscow calendar date "YYYY-MM-DD" of an instant. */
export function mskDate(ms: number = Date.now()): string {
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function isPerpetual(r: { lastTrade: string }): boolean {
  return !r.lastTrade || r.lastTrade >= "2090-01-01";
}

/** "MIX-12.26" -> "MIX" */
export function baseName(shortname: string): string {
  return shortname.replace(/-\d{1,2}\.\d{2}$/, "");
}

export function buildFamilies(rows: FortsRaw[], today: string = mskDate()): ContractFamily[] {
  const dated = new Map<string, FortsRaw[]>();
  const perps: FortsRaw[] = [];
  for (const r of rows) {
    if (isPerpetual(r)) perps.push(r);
    else if (r.lastTrade >= today) {
      const key = r.asset || r.sectype;
      let l = dated.get(key);
      if (!l) dated.set(key, (l = []));
      l.push(r);
    }
  }
  const families = new Map<string, ContractFamily>();
  for (const [asset, list] of dated) {
    list.sort((a, b) => a.lastTrade.localeCompare(b.lastTrade) || a.secid.localeCompare(b.secid));
    const months = list.map((r) => +r.lastTrade.slice(5, 7));
    const quarterly = months.every((m) => m % 3 === 0);
    let minGap = Infinity;
    for (let i = 1; i < list.length; i++) minGap = Math.min(minGap, dayDiff(list[i - 1].lastTrade, list[i].lastTrade));
    const cadence: ContractKind = minGap <= 10 ? "weekly" : quarterly ? "quarterly" : "monthly";
    families.set(asset, {
      asset,
      name: baseName(list[0].shortname),
      auto: autoTicker(asset),
      contracts: list.map((r, i) => ({
        secid: r.secid, board: r.board, shortname: r.shortname, asset, sectype: r.sectype, kind: cadence,
        expiry: r.lastTrade, order: i + 1, daysLeft: dayDiff(today, r.lastTrade), lot: r.lot, decimals: r.decimals, minstep: r.minstep,
      })),
    });
  }
  for (const r of perps) {
    const parent = PERP_PARENT[r.secid];
    const fam = parent ? families.get(parent) : undefined;
    const contract: FortsContract = {
      secid: r.secid, board: r.board, shortname: r.shortname, asset: fam?.asset ?? r.secid, sectype: r.sectype, kind: "perpetual",
      expiry: null, order: 0, daysLeft: null, lot: r.lot, decimals: r.decimals, minstep: r.minstep,
    };
    if (fam) fam.contracts.push(contract);
    else families.set(r.secid, { asset: r.secid, name: r.shortname, auto: autoTicker(r.secid), contracts: [contract] });
  }
  return [...families.values()].sort((a, b) => a.asset.localeCompare(b.asset));
}

/** Family of an exact contract SECID, of a generic ticker ("MIX", "CU", "SBRF.F") or of an underlying code. */
export function findFamily(families: ContractFamily[], input: string, loose = false): ContractFamily | null {
  const s = input.trim();
  if (!s) return null;
  for (const f of families) if (f.contracts.some((c) => c.secid === s)) return f;
  let asset: string | null = null;
  if (s.endsWith(AUTO_SUFFIX)) asset = s.slice(0, -AUTO_SUFFIX.length);
  else if (GENERIC_FUTURES.has(s)) asset = GENERIC_ALIAS[s] ?? s;
  if (asset) return families.find((f) => f.asset === asset) ?? families.find((f) => f.asset.toLowerCase() === asset!.toLowerCase()) ?? null;
  if (!loose) return null;
  const low = s.toLowerCase();
  return (
    families.find((f) => f.asset.toLowerCase() === low) ??
    families.find((f) => f.contracts.some((c) => c.secid.toLowerCase() === low)) ??
    families.find((f) => f.name.toLowerCase() === low) ??
    null
  );
}

/** The contract a ticker stands for: an exact SECID as is, a generic ticker -> the front (current) contract. */
export function resolveContract(families: ContractFamily[], input: string): { contract: FortsContract; family: ContractFamily; auto: boolean } | null {
  const s = input.trim();
  for (const f of families) {
    const c = f.contracts.find((x) => x.secid === s);
    if (c) return { contract: c, family: f, auto: false };
  }
  const f = findFamily(families, s);
  if (!f) return null;
  const front = f.contracts.find((c) => c.order === 1) ?? f.contracts[0];
  return front ? { contract: front, family: f, auto: true } : null;
}

/* ── labels ── */

const MONTHS: Record<Lang, string[]> = {
  ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  cn: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
};
const ORD: Record<Lang, (n: number) => string> = {
  ru: (n) => (n === 1 ? "текущий" : n === 2 ? "следующий" : `${n}-й`),
  en: (n) => (n === 1 ? "current" : n === 2 ? "next" : `#${n}`),
  cn: (n) => (n === 1 ? "当前" : n === 2 ? "次月" : `第${n}个`),
};
const PERP: Record<Lang, string> = { ru: "вечный", en: "perpetual", cn: "永续" };
const LEFT: Record<Lang, (d: number) => string> = {
  ru: (d) => `осталось ${d} дн.`,
  en: (d) => `${d} d left`,
  cn: (d) => `剩余${d}天`,
};

/** Short badge text: "текущий", "следующий", "3-й", "вечный". */
export function contractBadge(c: Pick<FortsContract, "kind" | "order">, lang: Lang = "ru"): string {
  return c.kind === "perpetual" ? PERP[lang] : ORD[lang](c.order);
}

/** «MIX дек-26 · MXZ6 · текущий (осталось 74 дн.)», «MIXF · вечный». */
export function contractLabel(c: FortsContract, familyName: string, lang: Lang = "ru"): string {
  if (c.kind === "perpetual") return `${c.shortname} · ${c.secid !== c.shortname ? c.secid + " · " : ""}${PERP[lang]}`;
  const [y, m] = (c.expiry ?? "").split("-");
  const month = MONTHS[lang][(+m || 1) - 1];
  const when = c.kind === "weekly" ? c.expiry : `${month}-${(y ?? "").slice(2)}`;
  return `${familyName} ${when} · ${c.secid} · ${ORD[lang](c.order)}${c.daysLeft !== null ? ` (${LEFT[lang](c.daysLeft)})` : ""}`;
}

/* ── cached loader ── */

interface Cache {
  at: number;
  families: ContractFamily[];
  bySecid: Map<string, FortsContract>;
}
const G = globalThis as unknown as { __fomoForts?: { cache: Cache | null; inflight: Promise<Cache | null> | null } };
const S = (G.__fomoForts ??= { cache: null, inflight: null });
const TTL_MS = 3_600_000;
const RETRY_MS = 60_000;
let failedAt = 0;

async function fetchForts(): Promise<Cache | null> {
  try {
    const res = await fetch(FORTS_URL, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const rows = parseFortsRows(data?.securities?.columns ?? [], data?.securities?.data ?? []);
    if (rows.length === 0) return null;
    const families = buildFamilies(rows);
    const bySecid = new Map<string, FortsContract>();
    for (const f of families) for (const c of f.contracts) bySecid.set(c.secid, c);
    return { at: Date.now(), families, bySecid };
  } catch {
    return null;
  }
}

/** All families. Cached for an hour; when ISS fails the stale copy keeps being served. Never throws. */
export async function getFortsFamilies(): Promise<ContractFamily[]> {
  const c = S.cache;
  if (c && Date.now() - c.at < TTL_MS) return c.families;
  if (c && Date.now() - failedAt < RETRY_MS) return c.families;
  if (!S.inflight) {
    S.inflight = fetchForts()
      .then((fresh) => {
        if (fresh) S.cache = fresh;
        else failedAt = Date.now();
        return fresh;
      })
      .finally(() => {
        S.inflight = null;
      });
  }
  const fresh = await S.inflight;
  return (fresh ?? S.cache)?.families ?? [];
}

/** Days to expiry go stale inside a cached build: recompute them against the current date. */
export function refreshDays(f: ContractFamily): ContractFamily {
  const today = mskDate();
  return { ...f, contracts: f.contracts.map((c) => (c.expiry ? { ...c, daysLeft: dayDiff(today, c.expiry) } : c)) };
}

/** Exact contract by SECID (undefined if it is not a current FORTS contract). */
export async function getContract(secid: string): Promise<FortsContract | undefined> {
  await getFortsFamilies();
  return S.cache?.bySecid.get(secid);
}

/** A ticker (exact SECID / generic ticker / "<ASSET>.F") -> the SECID to request data for. */
export async function resolveFuturesTicker(ticker: string): Promise<{ secid: string; auto: boolean; board: string } | null> {
  const families = await getFortsFamilies();
  // an expired front can sit in the cached build until the next refresh: skip dated contracts that are already past
  const r = resolveContract(families, ticker);
  if (!r) return null;
  if (r.auto && r.contract.expiry && r.contract.expiry < mskDate()) {
    const next = r.family.contracts.find((c) => c.expiry && c.expiry >= mskDate()) ?? r.family.contracts.find((c) => c.kind === "perpetual");
    if (next) return { secid: next.secid, auto: true, board: next.board };
  }
  return { secid: r.contract.secid, auto: r.auto, board: r.contract.board };
}

/** Front contract SECID of a generic ticker (null when the ticker is not a generic futures ticker or ISS is unreachable). */
export async function frontSecid(ticker: string): Promise<string | null> {
  if (!GENERIC_FUTURES.has(ticker) && !ticker.endsWith(AUTO_SUFFIX)) return null;
  const r = await resolveFuturesTicker(ticker);
  return r?.secid ?? null;
}
