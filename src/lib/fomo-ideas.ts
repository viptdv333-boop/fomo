// «Идеи FOMO» on the terminal site (terminal.fomo.spot): the idea board lives on fomo.spot, the terminal instance has its own database
// without ideas, so the terminal's server asks fomo.spot for them (src/app/api/fomo-ideas/route.ts). Pure helpers (no Node, no React, no
// network) shared by the route, the client hook and scripts/check-site-mode.ts.

import { pickBoardInstrument } from "./app-terminal";

/** The idea board's origin. Fixed on purpose: this feature never talks to any other host. */
export const FOMO_ORIGIN = "https://fomo.spot";

/** Tickers are passed on to fomo.spot only when they look like one (the query string never carries anything else). */
export const FOMO_TICKER_RE = /^[A-Za-z0-9._-]{1,20}$/;

/** How long an answer (also "no ideas") is remembered in memory by the server. */
export const FOMO_CACHE_MS = 5 * 60 * 1000;
/** Shorter memory of a failure, so a short outage of fomo.spot does not hide the ideas for five minutes. */
export const FOMO_FAIL_CACHE_MS = 60 * 1000;
/** Timeout of every request to fomo.spot. */
export const FOMO_TIMEOUT_MS = 4000;
export const FOMO_IDEAS_LIMIT = 5;
const MAX_CACHE_ENTRIES = 500;

export interface FomoIdea {
  id: string;
  title: string;
  author: string;
  likes: number;
  createdAt: string;
  /** https://fomo.spot/ideas/<id> */
  url: string;
}

export interface FomoIdeasAnswer {
  /** false: fomo.spot did not answer (the UI shows nothing but the community card) */
  ok: boolean;
  /** number of ideas on the board for the symbol (>= ideas.length) */
  count: number;
  ideas: FomoIdea[];
  /** where «all ideas» leads: the board filtered to the symbol (the whole feed when the board has no such instrument) */
  boardUrl: string;
}

export const FOMO_UNAVAILABLE: FomoIdeasAnswer = { ok: false, count: 0, ideas: [], boardUrl: `${FOMO_ORIGIN}/feed` };

/** A valid ticker, trimmed, or null. */
export function cleanTicker(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return FOMO_TICKER_RE.test(s) ? s : null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function ideaUrl(id: string): string {
  return `${FOMO_ORIGIN}/ideas/${id}`;
}

/** The board link of a symbol; `utm_*` tell fomo.spot where the visitor came from. */
export function boardUrl(instrumentId: string | null): string {
  const utm = "utm_source=terminal&utm_medium=ideas";
  return instrumentId && ID_RE.test(instrumentId) ? `${FOMO_ORIGIN}/feed?instrumentId=${encodeURIComponent(instrumentId)}&${utm}` : `${FOMO_ORIGIN}/feed?${utm}`;
}

/** Link of the «FOMO — сообщество трейдеров» cards and rows. */
export const FOMO_COMMUNITY_URL = `${FOMO_ORIGIN}/?utm_source=terminal&utm_medium=app`;

function text(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The board's `/api/ideas` answer ({ data: [...], total }) as the terminal needs it. Anything unexpected -> no ideas, never a throw. */
export function normalizeIdeas(answer: unknown, limit: number = FOMO_IDEAS_LIMIT): { count: number; ideas: FomoIdea[] } {
  const o = (answer && typeof answer === "object" ? answer : {}) as { data?: unknown; total?: unknown };
  const rows = Array.isArray(o.data) ? o.data : [];
  const ideas: FomoIdea[] = [];
  for (const r of rows) {
    if (ideas.length >= limit) break;
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const id = typeof x.id === "string" && ID_RE.test(x.id) ? x.id : null;
    const title = text(x.title, 140);
    if (!id || !title) continue;
    const author = text((x.author as { displayName?: unknown } | null | undefined)?.displayName, 60);
    const likesRaw = x.voteScore;
    const likes = typeof likesRaw === "number" && Number.isFinite(likesRaw) ? Math.round(likesRaw) : 0;
    const created = typeof x.createdAt === "string" && Number.isFinite(Date.parse(x.createdAt)) ? new Date(x.createdAt).toISOString() : "";
    ideas.push({ id, title, author, likes, createdAt: created, url: ideaUrl(id) });
  }
  const total = typeof o.total === "number" && Number.isFinite(o.total) && o.total >= 0 ? Math.floor(o.total) : ideas.length;
  return { count: Math.max(total, ideas.length), ideas };
}

/** The board's instrument for the first spelling that has one: ticker, then the data ticker. `lists` = the answers of /api/instruments?search=<spelling>, in order. */
export function pickInstrumentId(spellings: string[], lists: unknown[]): string | null {
  for (let i = 0; i < spellings.length; i++) {
    const found = pickBoardInstrument<{ id: string; ticker?: string | null }>(lists[i], spellings[i]);
    if (found && ID_RE.test(found.id)) return found.id;
  }
  return null;
}

/** Small in-memory cache with a time to live and a size cap (the oldest entries go first). Time is passed in, so it is testable. */
export class TtlCache<V> {
  private m = new Map<string, { v: V; until: number }>();
  constructor(private max: number = MAX_CACHE_ENTRIES) {}
  get(key: string, now: number): V | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (e.until <= now) {
      this.m.delete(key);
      return undefined;
    }
    return e.v;
  }
  set(key: string, v: V, ttlMs: number, now: number): void {
    this.m.delete(key);
    this.m.set(key, { v, until: now + ttlMs });
    while (this.m.size > this.max) {
      const first = this.m.keys().next().value;
      if (first === undefined) break;
      this.m.delete(first);
    }
  }
  get size(): number {
    return this.m.size;
  }
}
