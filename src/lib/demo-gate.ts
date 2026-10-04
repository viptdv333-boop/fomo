/**
 * Guest demo budget: a visitor who is not signed in gets a time-limited full demo of the terminal, the calendar and the
 * idea board (5 minutes per browser per local day, shared by the three pages). Pure accounting, no React and no DOM:
 * the hook in useDemoGate.ts feeds it the clock and the storage, scripts/check-demo-gate.ts checks it.
 *
 * State is { day: 'YYYY-MM-DD' (the visitor's local date), usedMs }. A new day starts from zero. Anything stored that does
 * not look like a state of today (corrupt JSON, a wrong shape, another or a future day, negative numbers) is a fresh one.
 */

/** The whole demo budget of one browser per day. A single constant on purpose (no env, no query flag). */
export const DEMO_BUDGET_MS = 5 * 60 * 1000;

/** One accounting step never counts more than this, so a sleeping laptop or a throttled background tab cannot burn the budget. */
export const MAX_STEP_MS = 2000;

export const DEMO_STORAGE_KEY = "fomo-demo-gate-v1";

export interface DemoState {
  /** local calendar day the usage belongs to, YYYY-MM-DD */
  day: string;
  /** milliseconds of foreground time used on that day, 0..DEMO_BUDGET_MS */
  usedMs: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The visitor's local date as YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function freshState(day: string): DemoState {
  return { day, usedMs: 0 };
}

/** Defensive normalisation of whatever came out of storage (already JSON.parsed or not). Never throws. */
export function normalizeState(raw: unknown, today: string): DemoState {
  if (!raw || typeof raw !== "object") return freshState(today);
  const o = raw as { day?: unknown; usedMs?: unknown };
  if (typeof o.day !== "string" || !DAY_RE.test(o.day)) return freshState(today);
  // an earlier day is a new day; a day in the future (clock set back, hand-edited storage) is not trusted either
  if (o.day !== today) return freshState(today);
  const u = o.usedMs;
  if (typeof u !== "number" || !isFinite(u) || u < 0) return freshState(today);
  return { day: today, usedMs: Math.min(u, DEMO_BUDGET_MS) };
}

/** Parses the stored string (null / corrupt JSON -> a fresh state of today). */
export function parseState(stored: string | null | undefined, today: string): DemoState {
  if (!stored) return freshState(today);
  try {
    return normalizeState(JSON.parse(stored), today);
  } catch {
    return freshState(today);
  }
}

export function serializeState(s: DemoState): string {
  return JSON.stringify({ day: s.day, usedMs: Math.round(s.usedMs) });
}

/** Clamps one measured step into [0, MAX_STEP_MS]; NaN / Infinity count as nothing. */
export function clampStep(deltaMs: number): number {
  if (typeof deltaMs !== "number" || !isFinite(deltaMs) || deltaMs <= 0) return 0;
  return Math.min(deltaMs, MAX_STEP_MS);
}

/** Adds one step of foreground time. A state of another day is replaced by a fresh one first. Returns a new object. */
export function addUsage(state: DemoState, deltaMs: number, nowDay: string): DemoState {
  const base = normalizeState(state, nowDay);
  return { day: nowDay, usedMs: Math.min(DEMO_BUDGET_MS, base.usedMs + clampStep(deltaMs)) };
}

/** The budget is used up (exactly 5:00 is already used up). Another day's state is never exhausted. */
export function isExhausted(state: DemoState, nowDay: string): boolean {
  const s = normalizeState(state, nowDay);
  return s.usedMs >= DEMO_BUDGET_MS;
}

/** Two views of the same day (this tab and another tab / the storage): the larger usage wins (the same wall time is never counted twice). */
export function mergeStates(a: DemoState, b: DemoState, nowDay: string): DemoState {
  const x = normalizeState(a, nowDay);
  const y = normalizeState(b, nowDay);
  return { day: nowDay, usedMs: Math.max(x.usedMs, y.usedMs) };
}
