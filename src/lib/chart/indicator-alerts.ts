/**
 * Alerts on the value of an indicator (RSI crosses 20, a moving average crosses a level ...). They belong to the TERMINAL, not to the server:
 * the data provider, the indicators and their settings differ from one terminal to another, so each terminal watches its own alerts on the
 * values it computes itself (they fire while that terminal is open). Stored on this device. Pure rules here, no DOM except the store.
 */

export type IndCondition = "cross" | "up" | "down";

export interface IndAlert {
  id: string;
  /** the symbol the chart showed when the alert was made (the alert watches the indicator only while this symbol is on the chart) */
  source: string;
  dataTicker: string;
  ticker: string;
  /** indicator definition id ("rsi") and the name of the plot that is watched, as the scale flag calls it ("RSI 14") */
  indId: string;
  plot: string;
  /** instance title for the lists ("RSI 14 close") */
  title: string;
  level: number;
  condition: IndCondition;
  message: string;
  repeat: boolean;
  status: "active" | "triggered";
  /** side of the level the last checked value was on: 1 above, -1 below, 0 not seen yet */
  lastSide: number;
  lastFiredAt: number | null;
  createdAt: number;
}

export const IND_ALERT_COOLDOWN_MS = 60_000;

export interface StepResult {
  triggered: boolean;
  patch: Partial<Pick<IndAlert, "lastSide" | "status" | "lastFiredAt">> | null;
}

/** One check of an alert against the current value of its plot. The first sight of a value only records the side, like the price alerts do. */
export function stepIndAlert(a: Pick<IndAlert, "level" | "condition" | "repeat" | "status" | "lastSide" | "lastFiredAt">, value: number, now: number): StepResult {
  if (a.status !== "active" || !Number.isFinite(value) || !Number.isFinite(a.level)) return { triggered: false, patch: null };
  const side = value > a.level ? 1 : value < a.level ? -1 : 0;
  if (side === 0) return { triggered: false, patch: null }; // exactly on the level: wait for the value to leave it
  if (a.lastSide === 0) return { triggered: false, patch: { lastSide: side } };
  if (side === a.lastSide) return { triggered: false, patch: null };
  const hit = a.condition === "cross" || (a.condition === "up" && side === 1) || (a.condition === "down" && side === -1);
  if (!hit) return { triggered: false, patch: { lastSide: side } };
  if (a.repeat && a.lastFiredAt !== null && now - a.lastFiredAt < IND_ALERT_COOLDOWN_MS) return { triggered: false, patch: { lastSide: side } };
  return { triggered: true, patch: { lastSide: side, lastFiredAt: now, status: a.repeat ? "active" : "triggered" } };
}

/* ───────────── store (this device) ───────────── */

const KEY = "fomo-ind-alerts-v1";
const EVENT = "fomo-ind-alerts";

export function loadIndAlerts(): IndAlert[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((a): a is IndAlert => !!a && typeof a.id === "string" && Number.isFinite(a.level)) : [];
  } catch {
    return [];
  }
}

function save(list: IndAlert[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* storage unavailable: the alerts live until reload */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addIndAlert(a: Omit<IndAlert, "id" | "status" | "lastSide" | "lastFiredAt" | "createdAt">): IndAlert {
  const full: IndAlert = { ...a, id: `ind:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, status: "active", lastSide: 0, lastFiredAt: null, createdAt: Date.now() };
  save([full, ...loadIndAlerts()]);
  return full;
}

export function updateIndAlert(id: string, patch: Partial<IndAlert>): void {
  save(loadIndAlerts().map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function removeIndAlert(id: string): void {
  save(loadIndAlerts().filter((a) => a.id !== id));
}

export function subscribeIndAlerts(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
