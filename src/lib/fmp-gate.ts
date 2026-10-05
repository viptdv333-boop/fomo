/**
 * One door to Financial Modeling Prep (server only), shared by everything that spends the FMP key on behalf of the terminal:
 * US futures / stock candles (fmp-futures.ts), the single and batch quotes (/api/quote, quotes.ts) and the forex layer (forex.ts).
 *
 * What it remembers, in the memory of the Node process (it survives dev hot reloads):
 *   limit    HTTP 429 «Limit Reach». A cooldown with a ladder: 60 s, then 5 min, 30 min, then until the next UTC midnight (the free plan
 *            is 250 calls a DAY, a paid plan limits per MINUTE: the first 429 of a paid key costs a minute, a dead free key costs a day).
 *            A body that says «daily» goes straight to the next UTC midnight. A successful answer resets the ladder. While the cooldown
 *            lasts NO request leaves the server: a limit-exhausted key is not hammered by every chart refresh and watchlist poll.
 *   plan     HTTP 402 / 403 «Premium Query Parameter» (this symbol is not in the plan: remembered 6 h for that symbol and endpoint kind)
 *            or «Restricted / Special Endpoint» (the whole endpoint kind: 6 h); HTTP 401 / a missing key (everything: 15 min).
 *            A restricted symbol therefore costs ONE call, not one per request.
 *   network  a timeout / DNS / TLS / 5xx: a short back-off (5 s, 15 s, 60 s) so a dead upstream is not retried by every request.
 *
 * Callers get a typed failure ({ error: "limit" | "plan" | "network", detail }) and decide what to show; the key and the URL are never
 * part of a failure, a log line or a thrown message.
 */

export type FmpErrorKind = "limit" | "plan" | "network";
/** quote: /quote; intraday: /historical-chart/*; eod: /historical-price-eod/* */
export type FmpEndpoint = "quote" | "intraday" | "eod";

export interface FmpFailure {
  ok: false;
  error: FmpErrorKind;
  /** short machine-readable reason ("429", "premium-symbol", "restricted-endpoint", "auth", "no-key", "timeout", "http-502", "cooldown" ...) */
  detail: string;
  status?: number;
  /** seconds until a retry makes sense (cooldown / back-off left) */
  retryAfterSec?: number;
  /** true: nothing was sent, the memory below answered */
  blocked?: boolean;
}
export type FmpResponse = { ok: true; json: unknown } | FmpFailure;

export const FMP_BASE = "https://financialmodelingprep.com/stable";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TIMEOUT_MS = 10 * SEC;

interface GateState {
  limitUntil: number;
  limitStreak: number;
  netUntil: number;
  netStreak: number;
  /** "kind|symbol" | "kind|*" | "*|*" -> until, detail */
  denied: Map<string, { until: number; detail: string }>;
}
const G = globalThis as unknown as { __fomoFmpGate?: GateState };
const S: GateState = (G.__fomoFmpGate ??= { limitUntil: 0, limitStreak: 0, netUntil: 0, netStreak: 0, denied: new Map() });

/** The cooldown ladder of a 429 (index = consecutive limit answers); FMP_LIMIT_COOLDOWN_MS replaces the first step. */
function limitStep(streak: number, daily: boolean, now: number): number {
  const midnight = Math.floor(now / DAY) * DAY + DAY - now;
  if (daily) return midnight;
  const first = Number(process.env.FMP_LIMIT_COOLDOWN_MS) || MIN;
  const ladder = [first, 5 * MIN, 30 * MIN];
  return streak < ladder.length ? ladder[streak] : midnight;
}

/** Forget everything (tests). */
export function fmpGateReset(): void {
  S.limitUntil = 0;
  S.limitStreak = 0;
  S.netUntil = 0;
  S.netStreak = 0;
  S.denied.clear();
}

/** What is switched off right now (diagnostics, the check script): seconds left per memory slot. */
export function fmpGateStatus(): { limitSec: number; netSec: number; denied: Record<string, number> } {
  const now = Date.now();
  const denied: Record<string, number> = {};
  for (const [k, v] of S.denied) if (v.until > now) denied[k] = Math.round((v.until - now) / SEC);
  return { limitSec: Math.max(0, Math.round((S.limitUntil - now) / SEC)), netSec: Math.max(0, Math.round((S.netUntil - now) / SEC)), denied };
}

/** Why a request would not be sent right now, or null. */
export function fmpGateCheck(kind: FmpEndpoint, symbol: string): FmpFailure | null {
  const now = Date.now();
  if (S.limitUntil > now) return { ok: false, error: "limit", detail: "cooldown", blocked: true, retryAfterSec: Math.ceil((S.limitUntil - now) / SEC) };
  for (const k of ["*|*", `${kind}|*`, `${kind}|${symbol}`]) {
    const d = S.denied.get(k);
    if (d && d.until > now) return { ok: false, error: "plan", detail: d.detail, blocked: true, retryAfterSec: Math.ceil((d.until - now) / SEC) };
  }
  if (S.netUntil > now) return { ok: false, error: "network", detail: "backoff", blocked: true, retryAfterSec: Math.ceil((S.netUntil - now) / SEC) };
  return null;
}

/** An answer arrived: the body of an error answer is short text / JSON, kept only for classification. */
function bodyText(text: string): string {
  return text.length > 400 ? text.slice(0, 400) : text;
}

/**
 * Classifies an HTTP answer and updates the memory. null: not a failure (a 200 with data). `text` is the raw body.
 * Also used by forex.ts, which has its own request code and failure vocabulary.
 */
export function fmpGateReport(kind: FmpEndpoint, symbol: string, status: number, text: string): FmpFailure | null {
  const now = Date.now();
  const body = bodyText(text);
  const limitNow = (): FmpFailure => {
    // concurrent requests that all got the same 429 count as one step of the ladder
    if (now >= S.limitUntil) {
      const daily = /daily|per day|day limit/i.test(body);
      S.limitUntil = now + limitStep(S.limitStreak, daily, now);
      S.limitStreak++;
    }
    return { ok: false, error: "limit", detail: "429", status, retryAfterSec: Math.ceil((S.limitUntil - now) / SEC) };
  };
  const planNow = (wide: boolean, detail: string, ms = 6 * HOUR): FmpFailure => {
    S.denied.set(wide ? `${kind}|*` : `${kind}|${symbol}`, { until: now + ms, detail });
    return { ok: false, error: "plan", detail, status, retryAfterSec: Math.ceil(ms / SEC) };
  };
  const authNow = (): FmpFailure => {
    S.denied.set("*|*", { until: now + 15 * MIN, detail: "auth" });
    return { ok: false, error: "plan", detail: "auth", status, retryAfterSec: 15 * 60 };
  };

  if (status === 429) return limitNow();
  if (status === 401) return authNow();
  if (status === 402 || status === 403) {
    // «Restricted Endpoint» / «Special Endpoint»: the whole endpoint kind is not in the plan; «Premium Query Parameter»: this symbol is not
    const wide = /Restricted Endpoint|Special Endpoint|Exclusive Endpoint/i.test(body);
    if (/Invalid API KEY/i.test(body)) return authNow();
    return planNow(wide, wide ? "restricted-endpoint" : "premium-symbol");
  }
  if (status === 404) return null; // an unknown symbol: an empty answer, not a failure of the account
  if (status >= 500 || status === 408) {
    const steps = [5 * SEC, 15 * SEC, 60 * SEC];
    S.netUntil = now + steps[Math.min(S.netStreak, steps.length - 1)];
    S.netStreak++;
    return { ok: false, error: "network", detail: `http-${status}`, status, retryAfterSec: Math.ceil((S.netUntil - now) / SEC) };
  }
  if (status !== 200) return { ok: false, error: "network", detail: `http-${status}`, status };
  // a 200 can still carry an error object ({"Error Message": "..."}): older endpoints answer limits and plan problems that way
  const m = /^\s*\{\s*"Error Message"\s*:\s*"([^"]*)"/.exec(body);
  if (m) {
    if (/limit/i.test(m[1])) return limitNow();
    if (/Invalid API KEY/i.test(m[1])) return authNow();
    if (/premium|subscription|upgrade|restricted|special|not available/i.test(m[1])) return planNow(/Restricted|Special/i.test(m[1]), "premium-symbol");
    return { ok: false, error: "network", detail: "error-message", status };
  }
  // success: the ladders start over
  S.limitStreak = 0;
  S.netStreak = 0;
  S.netUntil = 0;
  return null;
}

/** A transport failure (no answer at all). */
export function fmpGateNetworkError(detail: string): FmpFailure {
  const now = Date.now();
  const steps = [5 * SEC, 15 * SEC, 60 * SEC];
  if (now >= S.netUntil) {
    S.netUntil = now + steps[Math.min(S.netStreak, steps.length - 1)];
    S.netStreak++;
  }
  return { ok: false, error: "network", detail, retryAfterSec: Math.ceil((S.netUntil - now) / SEC) };
}

/** A harmless description of a thrown fetch error (never the URL, which carries the key). */
function describeFetchError(e: unknown): string {
  const err = e as { name?: string; cause?: { code?: string }; code?: string };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timeout";
  return String(err?.cause?.code ?? err?.code ?? "fetch-failed").replace(/[^\w.-]/g, "").slice(0, 40) || "fetch-failed";
}

/**
 * GET {FMP_BASE}{path} (path: "/..." with its query string, WITHOUT the key) through the memory: nothing is sent while
 * a cooldown / denial applies; the answer is classified; JSON is parsed. `symbol` keys the per-symbol denial.
 */
export async function fmpRequest(kind: FmpEndpoint, symbol: string, path: string): Promise<FmpResponse> {
  const key = process.env.FMP_API_KEY || "";
  if (!key) return { ok: false, error: "plan", detail: "no-key", blocked: true };
  const block = fmpGateCheck(kind, symbol);
  if (block) return block;
  let status = 0;
  let text = "";
  try {
    const res = await fetch(`${FMP_BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    status = res.status;
    text = await res.text();
  } catch (e) {
    return fmpGateNetworkError(describeFetchError(e));
  }
  const fail = fmpGateReport(kind, symbol, status, text);
  if (fail) return fail;
  if (status === 404 || text.trim() === "") return { ok: true, json: [] };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, error: "network", detail: "bad-json", status };
  }
}
