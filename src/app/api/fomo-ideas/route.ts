// «Идеи FOMO» for the terminal site (terminal.fomo.spot): GET /api/fomo-ideas?ticker=SBER[&alt=SBER2]
// The terminal instance has its own database without ideas; the idea board is on fomo.spot. This route asks fomo.spot SERVER-SIDE
// (the browser never talks to it, no CORS, no cookies are forwarded): /api/instruments?search=<ticker> -> the board's instrument ->
// /api/ideas?instrumentId=<id>&limit=5, and answers { ok, count, ideas: [{ id, title, author, likes, createdAt, url }], boardUrl }.
// Answers (also "no ideas" and "fomo.spot is down") are cached in memory for ~5 min (a failure for 1 min), every request times out
// after 4 s, and a failure is a quiet { ok: false } (the UI then shows nothing). Terminal site only (404 on fomo.spot itself) and
// only for a signed-in user. Pure helpers: src/lib/fomo-ideas.ts.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isTerminalSite } from "@/lib/site-mode";
import {
  FOMO_CACHE_MS,
  FOMO_FAIL_CACHE_MS,
  FOMO_IDEAS_LIMIT,
  FOMO_ORIGIN,
  FOMO_TIMEOUT_MS,
  FOMO_UNAVAILABLE,
  TtlCache,
  boardUrl,
  cleanTicker,
  normalizeIdeas,
  pickInstrumentId,
  type FomoIdeasAnswer,
} from "@/lib/fomo-ideas";

export const dynamic = "force-dynamic";

const cache = new TtlCache<FomoIdeasAnswer>();

/** One GET to fomo.spot: JSON on success, null on any failure (timeout, network, status, junk). No cookies, no credentials. */
async function getJson(path: string): Promise<unknown | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FOMO_TIMEOUT_MS);
  try {
    const r = await fetch(`${FOMO_ORIGIN}${path}`, {
      signal: ctl.signal,
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", "User-Agent": "FOMO-Terminal/1" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function load(spellings: string[]): Promise<{ answer: FomoIdeasAnswer; reachable: boolean }> {
  const lists = await Promise.all(spellings.map((q) => getJson(`/api/instruments?search=${encodeURIComponent(q)}`)));
  if (lists.every((l) => l === null)) return { answer: FOMO_UNAVAILABLE, reachable: false };
  const id = pickInstrumentId(spellings, lists);
  if (!id) return { answer: { ok: true, count: 0, ideas: [], boardUrl: boardUrl(null) }, reachable: true };
  const ideas = await getJson(`/api/ideas?instrumentId=${encodeURIComponent(id)}&limit=${FOMO_IDEAS_LIMIT}`);
  if (ideas === null) return { answer: FOMO_UNAVAILABLE, reachable: false };
  const n = normalizeIdeas(ideas, FOMO_IDEAS_LIMIT);
  return { answer: { ok: true, count: n.count, ideas: n.ideas, boardUrl: boardUrl(id) }, reachable: true };
}

export async function GET(request: NextRequest) {
  // fomo.spot has its own board: this proxy exists on the terminal instance only
  if (!isTerminalSite()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const ticker = cleanTicker(sp.get("ticker"));
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  const altRaw = sp.get("alt");
  const alt = altRaw ? cleanTicker(altRaw) : null;
  if (altRaw && !alt) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  const spellings = [...new Set([ticker, ...(alt ? [alt] : [])].map((s) => s.toUpperCase()))];

  const key = spellings.join("|");
  const hit = cache.get(key, Date.now());
  const headers = { "Cache-Control": "private, max-age=60" };
  if (hit) return NextResponse.json(hit, { headers });

  const { answer, reachable } = await load(spellings);
  cache.set(key, answer, reachable ? FOMO_CACHE_MS : FOMO_FAIL_CACHE_MS, Date.now());
  return NextResponse.json(answer, { headers });
}
