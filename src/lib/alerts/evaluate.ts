/**
 * Pure alert evaluation, shared by the server scheduler and the chart overlay.
 * Times are real UTC milliseconds. No I/O here so it is trivially testable.
 */

export type AlertCondition = "cross" | "up" | "down";
export type AlertStatus = "active" | "triggered" | "paused" | "expired";
export type LineTool = "hline" | "hray" | "trend" | "ray" | "extended";

export interface LinePoint {
  t: number;
  p: number;
}

export interface LineSpec {
  tool: LineTool | string;
  p1: LinePoint;
  p2: LinePoint;
}

export interface AlertState {
  kind: string;
  condition: string;
  price: number | null;
  line: LineSpec | null;
  status: string;
  lastSide: number;
  repeat: boolean;
  /** ms since epoch */
  expiresAt: number | null;
  lastTriggerAt: number | null;
  triggerCount: number;
}

/** Fields the scheduler writes back; only the keys that changed are present. */
export interface AlertPatch {
  status?: AlertStatus;
  lastSide?: number;
  triggeredAt?: number;
  lastTriggerAt?: number;
  triggerCount?: number;
}

export interface EvalResult {
  triggered: boolean;
  /** Level the price was compared with (null when the line has no level now). */
  level: number | null;
  patch: AlertPatch | null;
}

/** Cooldown between two firings of a repeating alert. */
export const REPEAT_COOLDOWN_MS = 60_000;

export type LineLevel = { state: "ok"; level: number } | { state: "pending" } | { state: "ended" };

/**
 * Price of a drawn line at real time `now`.
 * - hline: constant. hray: from p1.t onwards.
 * - trend: only inside [p1.t, p2.t]; after it the alert is "ended" (expires), before it "pending".
 * - ray: from p1 in the direction of p2, extrapolated; before the start "pending".
 * - extended: both directions.
 */
export function lineLevelAt(line: LineSpec, now: number): LineLevel {
  const { p1, p2 } = line;
  if (!isFiniteNum(p1?.t) || !isFiniteNum(p1?.p)) return { state: "ended" };
  if (line.tool === "hline") return { state: "ok", level: p1.p };
  if (line.tool === "hray") return now >= p1.t ? { state: "ok", level: p1.p } : { state: "pending" };
  if (!isFiniteNum(p2?.t) || !isFiniteNum(p2?.p) || p2.t === p1.t) return { state: "ended" };

  const slope = (p2.p - p1.p) / (p2.t - p1.t);
  const at = p1.p + slope * (now - p1.t);
  switch (line.tool) {
    case "trend": {
      const lo = Math.min(p1.t, p2.t);
      const hi = Math.max(p1.t, p2.t);
      if (now < lo) return { state: "pending" };
      if (now > hi) return { state: "ended" };
      return { state: "ok", level: at };
    }
    case "ray": {
      const forward = p2.t > p1.t ? 1 : -1;
      return (now - p1.t) * forward >= 0 ? { state: "ok", level: at } : { state: "pending" };
    }
    case "extended":
      return { state: "ok", level: at };
    default:
      return { state: "ended" };
  }
}

/** The level an alert watches right now (fixed price, or the line's current value). */
export function alertLevel(a: Pick<AlertState, "kind" | "price" | "line">, now: number): LineLevel {
  if (a.kind === "line") return a.line ? lineLevelAt(a.line, now) : { state: "ended" };
  return a.price !== null && isFiniteNum(a.price) ? { state: "ok", level: a.price } : { state: "ended" };
}

/**
 * Evaluates one alert against the last price.
 * Only "active" alerts are evaluated. First observation just records the side.
 */
export function evaluateAlert(a: AlertState, price: number, now: number): EvalResult {
  if (a.status !== "active") return { triggered: false, level: null, patch: null };
  if (a.expiresAt !== null && a.expiresAt <= now) return { triggered: false, level: null, patch: { status: "expired" } };

  const lv = alertLevel(a, now);
  if (lv.state === "ended") return { triggered: false, level: null, patch: { status: "expired" } };
  if (lv.state === "pending") return { triggered: false, level: null, patch: null };
  if (!isFiniteNum(price) || price <= 0) return { triggered: false, level: lv.level, patch: null };

  const level = lv.level;
  // Exactly on the level: no side yet, wait for the price to leave it.
  const side = price > level ? 1 : price < level ? -1 : 0;
  if (side === 0 || side === a.lastSide) return { triggered: false, level, patch: null };

  // first observation: remember the side, never fire
  if (a.lastSide === 0) return { triggered: false, level, patch: { lastSide: side } };

  const fires = a.condition === "up" ? side === 1 : a.condition === "down" ? side === -1 : true;
  if (!fires) return { triggered: false, level, patch: { lastSide: side } };

  if (a.repeat) {
    // inside the cooldown the flip is remembered but silent
    if (a.lastTriggerAt !== null && now - a.lastTriggerAt < REPEAT_COOLDOWN_MS) {
      return { triggered: false, level, patch: { lastSide: side } };
    }
    return {
      triggered: true,
      level,
      patch: { lastSide: side, lastTriggerAt: now, triggerCount: a.triggerCount + 1 },
    };
  }
  return {
    triggered: true,
    level,
    patch: { status: "triggered", lastSide: side, triggeredAt: now, lastTriggerAt: now, triggerCount: a.triggerCount + 1 },
  };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Tools an alert can follow (kind = "line"). */
export const ALERT_LINE_TOOLS = ["hline", "trend", "ray", "extended"] as const;

/** Parses the Json column defensively. */
export function parseLineSpec(raw: unknown): LineSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pt = (v: unknown): LinePoint | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    return isFiniteNum(o.t) && isFiniteNum(o.p) ? { t: o.t, p: o.p } : null;
  };
  const p1 = pt(r.p1);
  const p2 = pt(r.p2) ?? p1;
  if (!p1 || !p2 || typeof r.tool !== "string") return null;
  return { tool: r.tool, p1, p2 };
}
