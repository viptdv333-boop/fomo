/**
 * MOEX ALGOPACK REST client (apim.moex.com, "Promo" subscription: online candles / trades / order books, SuperCandles,
 * FUTOI, Mega Alerts, HI2).
 *
 * SECRETS: the key is read from `process.env.ALGOPACK_KEY` at CALL time (never at import), is only ever put into the
 * `Authorization` header and is never logged, returned, cached or written into a URL / error message. Every `reason`
 * string returned by this module is built from fixed words and status codes only.
 *
 * LICENSING: this module knows nothing about users. The caller MUST have checked `algopack-access.ts` (admin only unless
 * ALGOPACK_PUBLIC=1) before it hands anything from here to a client. The in-memory caches below are keyed by the upstream
 * URL and are reachable only through privileged code paths, so delayed (public) and online (privileged) data never mix.
 *
 * Fails soft: `apGet` never throws, it returns `{ ok: false, data: null, reason }`. No key -> `reason: "no-key"` and no
 * network call at all, so without the key the callers behave exactly as before.
 *
 * Resilience: request coalescing (identical in-flight URLs share one request), short TTL caches per endpoint family,
 * a concurrency cap, exponential back-off on 429 / "Too Many Requests", a global cool-down on 401, a per-endpoint-family
 * cool-down on 403 (no entitlement for that product) and a short soft back-off on 5xx / network errors.
 * No Next / DB imports (used by tsx check scripts too).
 */

export const DEFAULT_BASE = "https://apim.moex.com/iss";
export const PUBLIC_ISS = "https://iss.moex.com/iss";

export interface ApResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  /** ok | no-key | cooldown:... | backoff:... | http-NNN | non-json | timeout | network | forbidden ... (never contains the key) */
  reason: string;
  cached?: boolean;
}

export interface ApOptions {
  /** cache the successful answer for this long (0 = no cache, only in-flight coalescing) */
  ttlMs?: number;
  timeoutMs?: number;
  /** endpoint family for the 403 / 5xx cool-downs ("candles", "trades", "orderbook", "tradestats", "futoi" ...) */
  family?: string;
  /** quote long integers at the start of a row before JSON.parse (futures TRADENO exceeds 2^53) */
  quoteBigInts?: boolean;
}

/* ── env ── */

/** True when a key is configured (cheap; the key itself is never exposed). */
export function algopackEnabled(): boolean {
  const k = process.env.ALGOPACK_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

/** ALGOPACK_PUBLIC=1: the owner allows the data for every visitor (own licensing decision). */
export function algopackPublicFlag(): boolean {
  const v = process.env.ALGOPACK_PUBLIC;
  return v === "1" || v === "true";
}

/**
 * Base URL. Only the real gateway or a local mock (http://localhost / 127.0.0.1, used by the UI checks) is accepted from
 * ALGOPACK_BASE: the bearer key must never be sent to an arbitrary host by a typo in the environment.
 */
export function algopackBase(): string {
  const b = (process.env.ALGOPACK_BASE || "").trim().replace(/\/+$/, "");
  if (b && (b === DEFAULT_BASE || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/.test(b))) return b;
  return DEFAULT_BASE;
}

/* ── shared state (survives dev hot reload) ── */

interface Cool {
  until: number;
  reason: string;
  /** consecutive failures, for the exponential back-off */
  n: number;
}
interface State {
  cache: Map<string, { at: number; ttl: number; res: ApResult }>;
  inflight: Map<string, Promise<ApResult>>;
  global: Cool;
  fam: Map<string, Cool>;
  active: number;
  waiters: Array<() => void>;
  stats: { calls: number; ok: number; fail: number };
}
const G = globalThis as unknown as { __fomoAlgopack?: State };
const S: State = (G.__fomoAlgopack ??= {
  cache: new Map(),
  inflight: new Map(),
  global: { until: 0, reason: "", n: 0 },
  fam: new Map(),
  active: 0,
  waiters: [],
  stats: { calls: 0, ok: 0, fail: 0 },
});

const MAX_PAR = 6;
const CACHE_MAX = 600;
const DEFAULT_TIMEOUT = 12_000;

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  while (S.active >= MAX_PAR) await new Promise<void>((r) => S.waiters.push(r));
  S.active++;
  try {
    return await fn();
  } finally {
    S.active--;
    S.waiters.shift()?.();
  }
}

function famCool(family: string): Cool {
  let c = S.fam.get(family);
  if (!c) S.fam.set(family, (c = { until: 0, reason: "", n: 0 }));
  return c;
}

function bump(c: Cool, baseMs: number, maxMs: number, reason: string, now: number) {
  c.n = Math.min(c.n + 1, 10);
  c.until = now + Math.min(maxMs, baseMs * 2 ** (c.n - 1));
  c.reason = reason;
}

/** Snapshot for diagnostics (check script / status): no secrets. */
export function algopackState() {
  const now = Date.now();
  return {
    enabled: algopackEnabled(),
    globalCooldownMs: Math.max(0, S.global.until - now),
    globalReason: S.global.until > now ? S.global.reason : "",
    families: Object.fromEntries([...S.fam].filter(([, c]) => c.until > now).map(([k, c]) => [k, { ms: c.until - now, reason: c.reason }])),
    ...S.stats,
  };
}

/** Forget all cool-downs and caches (tests). */
export function algopackReset(): void {
  S.cache.clear();
  S.inflight.clear();
  S.global = { until: 0, reason: "", n: 0 };
  S.fam.clear();
  S.stats = { calls: 0, ok: 0, fail: 0 };
}

/* ── URL helpers ── */

export function apUrl(path: string, query?: Record<string, string | number | undefined | null>): string {
  const base = algopackBase();
  // `path` is "/iss/..." (as in the docs) or already relative to the base ("/datashop/...")
  const rel = path.startsWith("/iss/") ? path.slice(4) : path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const q = qs.toString();
  return `${base}${rel.startsWith("/") ? rel : `/${rel}`}${q ? (rel.includes("?") ? "&" : "?") + q : ""}`;
}

/** https://iss.moex.com/iss/... -> the same path on the authenticated gateway. */
export function publicToApim(url: string): string {
  return url.startsWith(PUBLIC_ISS) ? algopackBase() + url.slice(PUBLIC_ISS.length) : url;
}

/** Strips query string and the instrument id: "/datashop/algopack/eq/tradestats/SBER.json?x" -> "datashop/algopack/eq/tradestats" */
export function familyOf(url: string): string {
  const p = url.replace(/^https?:\/\/[^/]+/i, "").split("?")[0].replace(/^\/iss/, "");
  const m = p.match(/\/(candles|trades|orderbook)\.json$/);
  if (m) return m[1];
  const parts = p.split("/").filter(Boolean);
  if (parts[0] === "datashop") return parts.slice(0, 4).join("/");
  if (parts[0] === "analyticalproducts") return parts.slice(0, 2).join("/");
  return parts.slice(0, 2).join("/") || "iss";
}

/* ── the request ── */

function failRes(reason: string, status = 0): ApResult {
  return { ok: false, status, data: null, reason };
}

/** Is a request allowed right now? Returns the reason when not. */
export function apBlocked(family?: string): string | null {
  const now = Date.now();
  if (S.global.until > now) return `cooldown:${S.global.reason}`;
  const f = family ? S.fam.get(family) : undefined;
  if (f && f.until > now) return `cooldown:${family}:${f.reason}`;
  return null;
}

async function doFetch(url: string, family: string, opts: ApOptions): Promise<ApResult> {
  const key = process.env.ALGOPACK_KEY?.trim();
  if (!key) return failRes("no-key");
  S.stats.calls++;
  const now = Date.now();
  try {
    const res = await slot(() =>
      fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT),
      }),
    );
    const status = res.status;
    if (status === 401) {
      bump(S.global, 10 * 60_000, 30 * 60_000, "unauthorized", now);
      S.stats.fail++;
      return failRes("http-401", 401);
    }
    if (status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      bump(S.global, Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 : 5000, 120_000, "rate-limited", now);
      S.stats.fail++;
      return failRes("http-429", 429);
    }
    if (status === 403) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 400);
      } catch {}
      // "Too Many Requests" arrives as a 403 from the network protection: slow everything down; otherwise the plan has no such product
      if (/too many/i.test(body)) bump(S.global, 30_000, 5 * 60_000, "rate-limited", now);
      else bump(famCool(family), 5 * 60_000, 30 * 60_000, "forbidden", now);
      S.stats.fail++;
      return failRes("http-403", 403);
    }
    if (status >= 500) {
      bump(famCool(family), 3000, 60_000, `http-${status}`, now);
      S.stats.fail++;
      return failRes(`http-${status}`, status);
    }
    if (!res.ok) {
      S.stats.fail++;
      return failRes(`http-${status}`, status);
    }
    let text = await res.text();
    if (opts.quoteBigInts) text = text.replace(/\[(\d{15,}),/g, '["$1",');
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // a documented endpoint that answers text/html is a route mismatch, not data
      S.stats.fail++;
      return failRes("non-json", status);
    }
    // success resets the back-off ladders
    S.global.n = 0;
    const f = S.fam.get(family);
    if (f) f.n = 0;
    S.stats.ok++;
    return { ok: true, status, data, reason: "ok" };
  } catch (e) {
    const name = (e as Error)?.name;
    bump(famCool(family), 2000, 30_000, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network", now);
    S.stats.fail++;
    return failRes(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
}

/**
 * GET an ALGOPACK / authenticated-ISS URL. `urlOrPath` is a full apim URL, a "/iss/..." path or a public ISS URL.
 * Never throws.
 */
export async function apGet<T = any>(urlOrPath: string, query?: Record<string, string | number | undefined | null>, opts: ApOptions = {}): Promise<ApResult<T>> {
  if (!algopackEnabled()) return failRes("no-key");
  // the bearer key goes only to the gateway (or the public ISS host, which is rewritten to it): never to any other host
  if (/^https?:\/\//.test(urlOrPath) && !urlOrPath.startsWith(PUBLIC_ISS) && !urlOrPath.startsWith(algopackBase())) return failRes("bad-host");
  const url = /^https?:\/\//.test(urlOrPath)
    ? (() => {
        const u = publicToApim(urlOrPath);
        if (!query) return u;
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        const q = qs.toString();
        return q ? `${u}${u.includes("?") ? "&" : "?"}${q}` : u;
      })()
    : apUrl(urlOrPath, query);
  const family = opts.family ?? familyOf(url);
  const blocked = apBlocked(family);
  if (blocked) return failRes(blocked);

  const ttl = opts.ttlMs ?? 0;
  const now = Date.now();
  if (ttl > 0) {
    const hit = S.cache.get(url);
    if (hit && now - hit.at < hit.ttl) return { ...hit.res, cached: true } as ApResult<T>;
  }
  let p = S.inflight.get(url);
  if (!p) {
    p = doFetch(url, family, opts)
      .then((res) => {
        if (res.ok && ttl > 0) {
          if (S.cache.size >= CACHE_MAX) {
            // oldest first
            let oldest: string | null = null;
            for (const [k, v] of S.cache) if (oldest === null || v.at < S.cache.get(oldest)!.at) oldest = k;
            if (oldest) S.cache.delete(oldest);
          }
          S.cache.set(url, { at: Date.now(), ttl, res });
        }
        return res;
      })
      .finally(() => S.inflight.delete(url));
    S.inflight.set(url, p);
  }
  return (await p) as ApResult<T>;
}

/**
 * All pages of a paginated block: `start` advances by the returned row count until a page comes back empty (docs: do not
 * assume a page size). Rows are normalised (lower-case column names). Stops at `maxPages`; `truncated` tells if it did.
 */
export async function apRows(
  path: string,
  query: Record<string, string | number | undefined | null>,
  block: string,
  opts: ApOptions & { maxPages?: number } = {},
): Promise<{ ok: boolean; rows: Record<string, any>[]; reason: string; truncated: boolean }> {
  const rows: Record<string, any>[] = [];
  const maxPages = opts.maxPages ?? 8;
  let start = 0;
  let reason = "ok";
  for (let page = 0; page < maxPages; page++) {
    const r = await apGet(path, { ...query, start: start || undefined }, opts);
    if (!r.ok) {
      reason = r.reason;
      // a failure on the first page is a failure; later pages keep what was read
      if (page === 0) return { ok: false, rows, reason, truncated: false };
      return { ok: true, rows, reason, truncated: true };
    }
    const part = tableRows(r.data, block);
    if (part.length === 0) return { ok: true, rows, reason, truncated: false };
    rows.push(...part);
    start += part.length;
  }
  return { ok: true, rows, reason, truncated: true };
}

/** ISS block {columns, data} -> row objects with lower-case keys. Block by name, else "data", else the first block that has columns. */
export function tableRows(payload: any, block?: string): Record<string, any>[] {
  if (!payload || typeof payload !== "object") return [];
  let b: any = block ? payload[block] : undefined;
  if (!b || !Array.isArray(b.columns)) b = payload.data && Array.isArray(payload.data.columns) ? payload.data : undefined;
  if (!b) {
    for (const v of Object.values(payload)) {
      if (v && typeof v === "object" && Array.isArray((v as any).columns) && Array.isArray((v as any).data)) {
        b = v;
        break;
      }
    }
  }
  if (!b || !Array.isArray(b.columns) || !Array.isArray(b.data)) return [];
  const cols: string[] = b.columns.map((c: unknown) => String(c).toLowerCase());
  const out: Record<string, any>[] = [];
  for (const r of b.data) {
    if (!Array.isArray(r)) continue;
    const o: Record<string, any> = {};
    for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i];
    out.push(o);
  }
  return out;
}
