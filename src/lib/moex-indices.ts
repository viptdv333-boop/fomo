/**
 * MOEX indices of the «Индексы» chip of the instrument search: the ISS index market (engines/stock/markets/index) on its two index boards
 * (SNDX: MOEX Russia indices, RTSI: RTS / sector / thematic indices; the INAV board is fund NAVs, not indices).
 * Charts and quotes for them already work through the generic MOEX path (moex-resolve: the primary board -> ISS candles / marketdata).
 * The parsing, the search ranking and the curated «popular» order are pure (scripts/check-instrument-search.ts); the loader caches the list for an hour
 * and falls back to the curated one when ISS is unreachable. No foreign indices: there is no licensed source for them.
 */

import type { MarketItem } from "./market-types";

const ISS = "https://iss.moex.com/iss";
const INDEX_URL = `${ISS}/engines/stock/markets/index/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,BOARDID,SHORTNAME,NAME&marketdata.columns=SECID,BOARDID,VALTODAY`;

/** boards of the index market that hold indices */
export const INDEX_BOARDS = ["SNDX", "RTSI"];

/** Indices people actually look at, in this order (the «popular» list of the chip). */
export const INDEX_PRIORITY = ["IMOEX", "RTSI", "MOEXBMI", "MOEXBC", "MOEXOG", "MOEXFN", "MOEXMM", "MOEXCN", "MOEXIT", "MOEXEU", "MOEXTL", "MOEXTN", "MOEXCH", "MOEXRE", "RGBI", "RGBITR", "RUCBICP", "MCFTR", "RVI", "IMOEXCNY"];

/** [secid, board, name]: the curated fallback (names as ISS gives them) */
const STATIC: [string, string, string][] = [
  ["IMOEX", "SNDX", "Индекс МосБиржи"], ["RTSI", "RTSI", "Индекс РТС"], ["MOEXBMI", "SNDX", "Индекс МосБиржи широкого рынка"], ["MOEXBC", "RTSI", "Индекс МосБиржи голубых фишек"],
  ["MOEXOG", "SNDX", "Индекс МосБиржи нефти и газа"], ["MOEXFN", "SNDX", "Индекс МосБиржи финансов"], ["MOEXMM", "SNDX", "Индекс МосБиржи металлов и добычи"],
  ["MOEXCN", "SNDX", "Индекс МосБиржи потребительского сектора"], ["MOEXIT", "RTSI", "Индекс МосБиржи информационно-коммуникационных технологий"],
  ["MOEXEU", "SNDX", "Индекс МосБиржи электроэнергетики"], ["MOEXTL", "SNDX", "Индекс МосБиржи телекоммуникаций"], ["MOEXTN", "SNDX", "Индекс МосБиржи транспорта"],
  ["MOEXCH", "SNDX", "Индекс МосБиржи химии и нефтехимии"], ["MOEXRE", "RTSI", "Индекс МосБиржи недвижимости"], ["RGBI", "SNDX", "Индекс Мосбиржи государственных облигаций ценовой"],
  ["RGBITR", "SNDX", "Индекс Мосбиржи государственных облигаций"], ["RUCBICP", "SNDX", "Индекс Мосбиржи корпоративных облигаций ценовой"],
  ["MCFTR", "RTSI", "Индекс МосБиржи полной доходности «брутто»"], ["RVI", "RTSI", "Индекс волатильности RVI"], ["IMOEXCNY", "RTSI", "Индекс МосБиржи в юанях"],
];

export interface IndexRow {
  secid: string;
  board: string;
  name: string;
  /** today's turnover (0 when unknown) */
  turnover: number;
}

export function indexItem(r: IndexRow): MarketItem {
  return { secid: r.secid, ticker: r.secid, name: r.name || r.secid, group: "index", source: "moex", engine: "stock", market: "index", board: r.board };
}

/** The curated fallback as rows. */
export function staticIndexRows(): IndexRow[] {
  return STATIC.map(([secid, board, name]) => ({ secid, board, name, turnover: 0 }));
}

/** securities + marketdata blocks of the ISS index market -> rows of the two index boards (first occurrence of an id wins). Tolerant: garbage gives []. */
export function parseIndexList(body: unknown): IndexRow[] {
  const b = body as { securities?: { columns?: string[]; data?: unknown[][] }; marketdata?: { columns?: string[]; data?: unknown[][] } } | null;
  const sc = b?.securities?.columns;
  if (!sc || !Array.isArray(b?.securities?.data)) return [];
  const [iId, iBoard, iShort, iName] = ["SECID", "BOARDID", "SHORTNAME", "NAME"].map((n) => sc.indexOf(n));
  if (iId < 0 || iBoard < 0) return [];
  const turn = new Map<string, number>();
  const mc = b?.marketdata?.columns;
  if (mc && Array.isArray(b?.marketdata?.data)) {
    const [mId, mBoard, mVal] = ["SECID", "BOARDID", "VALTODAY"].map((n) => mc.indexOf(n));
    if (mId >= 0 && mBoard >= 0 && mVal >= 0) for (const r of b!.marketdata!.data!) turn.set(`${r[mId]}|${r[mBoard]}`, typeof r[mVal] === "number" ? (r[mVal] as number) : 0);
  }
  const out: IndexRow[] = [];
  const seen = new Set<string>();
  for (const r of b!.securities!.data!) {
    const secid = String(r[iId] ?? "");
    const board = String(r[iBoard] ?? "");
    if (!secid || !INDEX_BOARDS.includes(board) || seen.has(secid)) continue;
    seen.add(secid);
    out.push({ secid, board, name: String((iName >= 0 ? r[iName] : "") || (iShort >= 0 ? r[iShort] : "") || secid), turnover: turn.get(`${secid}|${board}`) ?? 0 });
  }
  return out;
}

/** The «popular» order: the curated indices first (those that are listed), then the rest by turnover. */
export function popularIndexRows(rows: IndexRow[]): IndexRow[] {
  const by = new Map(rows.map((r) => [r.secid, r]));
  const out: IndexRow[] = [];
  for (const id of INDEX_PRIORITY) {
    const r = by.get(id);
    if (r) out.push(r);
  }
  const rest = rows.filter((r) => !INDEX_PRIORITY.includes(r.secid) && r.turnover > 0).sort((a, b) => b.turnover - a.turnover || a.secid.localeCompare(b.secid));
  return [...out, ...rest];
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Ranks the indices for a query: the exact id, the id prefix, the words of the name (every query word must be found). Ties keep the list order. */
export function searchIndexRows(rows: IndexRow[], q: string, limit = 60): IndexRow[] {
  const n = norm(q.trim());
  if (!n) return [];
  const words = n.split(/\s+/).filter(Boolean);
  const scored: { s: number; i: number; r: IndexRow }[] = [];
  rows.forEach((r, i) => {
    const id = norm(r.secid);
    const name = norm(r.name);
    let s = 0;
    if (id === n) s = 100;
    else if (n.length >= 2 && id.startsWith(n)) s = 80;
    else if (n.length >= 3 && words.every((w) => name.split(/[\s«»"().,-]+/).some((x) => x.startsWith(w)))) s = 60;
    else if (n.length >= 3 && id.includes(n)) s = 45;
    else if (n.length >= 3 && name.includes(n)) s = 40;
    if (s) scored.push({ s, i, r });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.slice(0, limit).map((x) => x.r);
}

/* ── cached loader (server) ── */

const TTL_MS = 3_600_000;
const RETRY_MS = 60_000;
const G = globalThis as unknown as { __fomoIndices?: { at: number; rows: IndexRow[]; failedAt: number; inflight: Promise<void> | null } };
const S = (G.__fomoIndices ??= { at: 0, rows: [], failedAt: 0, inflight: null });

/** Indices of the ISS index market (cached an hour); the curated list when ISS cannot be reached. Never throws. */
export async function getIndexRows(): Promise<IndexRow[]> {
  if (S.rows.length && Date.now() - S.at < TTL_MS) return S.rows;
  if (Date.now() - S.failedAt < RETRY_MS) return S.rows.length ? S.rows : staticIndexRows();
  if (!S.inflight) {
    S.inflight = (async () => {
      try {
        const res = await fetch(INDEX_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        const rows = res.ok ? parseIndexList(await res.json()) : [];
        if (rows.length >= 5) {
          S.rows = rows;
          S.at = Date.now();
        } else S.failedAt = Date.now();
      } catch {
        S.failedAt = Date.now();
      }
    })().finally(() => {
      S.inflight = null;
    });
  }
  await S.inflight;
  return S.rows.length ? S.rows : staticIndexRows();
}
