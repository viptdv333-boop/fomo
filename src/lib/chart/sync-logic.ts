/**
 * Pure rules of the chart-state account sync (no DOM, no fetch): which copy wins, how an item is wrapped for the
 * account, size caps and the key mapping. The I/O side lives in account-sync.ts.
 */

/** userdata kinds that carry the chart itself (the settings dialog `chart_settings/default` and the layout `chart_settings/multi` have their own sync). */
export const KIND_PREFS = "chart_prefs";
export const KIND_INDICATORS = "chart_indicators";
export const KIND_DRAWINGS = "chart_drawings";
export const KIND_LAST = "terminal_last";

/** The newest N symbols keep their drawings on the account (the server evicts the oldest, see the userdata route). */
export const MAX_DRAWING_ITEMS = 200;
/** Per symbol: at most this many drawings and this many characters are pushed (the local copy is never trimmed). */
export const MAX_DRAWINGS_PER_SYMBOL = 500;
export const MAX_DRAWINGS_CHARS = 380_000;
/** Debounce of a push, spacing between two PUTs (the route allows 120 per minute per user, we stay around 85) and the revisit throttle. */
export const PUSH_DEBOUNCE_MS = 1000;
export const MIN_GAP_MS = 700;
export const RECHECK_MS = 60_000;

/* ───────────── key mapping (1:1 with the local storage ids) ───────────── */

const ACCOUNT_KEY_RE = /^[A-Za-z0-9_.:-]{1,110}$/;

/** Pane id: the main chart is "main", the panes of a multi-chart grid are their storageId ("p1" ...). */
export function paneKey(storageId?: string): string | null {
  const k = storageId || "main";
  return ACCOUNT_KEY_RE.test(k) ? k : null;
}

/** `<source>:<ticker>`, the same pair that suffixes the local `fomo-chart-drawings:` key. */
export function drawingsKey(source: string, ticker: string): string | null {
  const k = `${source}:${ticker}`;
  return ACCOUNT_KEY_RE.test(k) ? k : null;
}

/* ───────────── envelope ───────────── */

export interface Remote {
  /** ms timestamp of the last user change. 0 when missing. */
  at: number;
  /** The payload serialized the same way the local copy is. */
  json: string;
}

/** What goes to the account: `{ v:1, at, data: <parsed local payload> }`. null when the payload is not JSON. */
export function packRemote(at: number, json: string): { v: 1; at: number; data: unknown } | null {
  try {
    return { v: 1, at, data: JSON.parse(json) };
  } catch {
    return null;
  }
}

/** Reads an account item; anything that is not an envelope (or has no payload) is ignored. A missing/garbage `at` counts as 0. */
export function parseRemote(raw: unknown): Remote | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { at?: unknown; data?: unknown };
  if (o.data === undefined) return null;
  const at = typeof o.at === "number" && Number.isFinite(o.at) && o.at > 0 ? o.at : 0;
  try {
    return { at, json: JSON.stringify(o.data) };
  } catch {
    return null;
  }
}

/** Key-sorted JSON: the account database (jsonb) does not keep the key order, so copies are compared in this form. */
export function canonJson(json: string): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = sort(o[k]);
      return out;
    }
    return v;
  };
  try {
    return JSON.stringify(sort(JSON.parse(json)));
  } catch {
    return json;
  }
}

/* ───────────── which copy wins ───────────── */

export interface LocalState {
  /** Something was stored on this device for the item (an absent key is not the same as an empty state). */
  exists: boolean;
  /** ms timestamp of the last change made here; 0 for data written by older versions. */
  at: number;
  /** No indicators / no drawings. Prefs and the last symbol are never empty. */
  empty: boolean;
}

export interface RemoteState {
  at: number;
  empty: boolean;
}

export type Decision = "pull" | "push" | "none";

/**
 * Whole-object last-write-wins.
 *  - no account copy: push whatever this device has;
 *  - nothing here: take the account copy;
 *  - same content: nothing to do;
 *  - older data without a timestamp loses to a stamped copy, except that it is never replaced by an EMPTY account copy;
 *  - newer wins; on a tie an empty state never wipes a non-empty one, two differing non-empty states stay as they are.
 */
export function decide(local: LocalState, remote: RemoteState | null, sameContent: boolean): Decision {
  if (!remote) return local.exists && (!local.empty || local.at > 0) ? "push" : "none";
  if (sameContent) return "none";
  if (!local.exists) return "pull";
  if (local.at === 0 && !local.empty && remote.empty) return "push";
  if (remote.at > local.at) return "pull";
  if (remote.at < local.at) return "push";
  if (local.empty && !remote.empty) return "pull";
  if (!local.empty && remote.empty) return "push";
  return "none";
}

/** Local copy that belongs to another account: it must not take part in the comparison nor be pushed. */
export function isForeign(localUid: string | undefined, uid: string): boolean {
  return !!localUid && localUid !== uid;
}

/** The next visibility re-check is allowed once per minute. */
export function recheckDue(now: number, last: number, gap = RECHECK_MS): boolean {
  return now - last >= gap;
}

/* ───────────── drawings: size caps ───────────── */

export function isEmptyDrawings(json: string): boolean {
  if (!json) return true;
  try {
    const o = JSON.parse(json) as { drawings?: unknown };
    return !Array.isArray(o.drawings) || o.drawings.length === 0;
  } catch {
    return true;
  }
}

/**
 * Fits a serialized drawings payload (`{v:1,drawings:[...]}`) into the per-symbol caps by dropping the OLDEST drawings
 * (the front of the list). Returns the payload unchanged when it already fits, null when it is not a drawings payload.
 */
export function fitDrawings(json: string, maxItems = MAX_DRAWINGS_PER_SYMBOL, maxChars = MAX_DRAWINGS_CHARS): string | null {
  let o: { drawings?: unknown } & Record<string, unknown>;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || !Array.isArray(o.drawings)) return null;
  if (o.drawings.length <= maxItems && json.length <= maxChars) return json;
  let list = o.drawings as unknown[];
  if (list.length > maxItems) list = list.slice(list.length - maxItems);
  // drop from the front until it fits (in chunks, the payload can be large)
  let out = JSON.stringify({ ...o, drawings: list });
  while (out.length > maxChars && list.length > 1) {
    list = list.slice(Math.max(1, Math.ceil(list.length * 0.1)));
    out = JSON.stringify({ ...o, drawings: list });
  }
  // one drawing that alone does not fit: no push (an empty list would wipe the account copy)
  return out.length > maxChars ? null : out;
}

/* ───────────── prefs ───────────── */

export function isEmptyIndicators(json: string): boolean {
  if (!json) return true;
  try {
    const a = JSON.parse(json);
    return !Array.isArray(a) || a.length === 0;
  } catch {
    return true;
  }
}

/* ───────────── push scheduling ───────────── */

/** Backoff (ms) before retrying a push that failed: rate limit waits longer than a network error; null = give up (the next load re-pushes). */
export function retryDelay(status: number, attempt: number): number | null {
  if (status === 401 || status === 400 || status === 409 || status === 413) return null;
  if (attempt >= 4) return null;
  return status === 429 ? 30_000 * (attempt + 1) : 5_000 * (attempt + 1);
}

/** When the next PUT may go: not before it is due and not sooner than MIN_GAP after the previous one. */
export function nextSendAt(due: number, lastSent: number, gap = MIN_GAP_MS): number {
  return Math.max(due, lastSent + gap);
}
