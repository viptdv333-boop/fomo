/**
 * Which per-user terminal data follows the ACCOUNT across the two sites (fomo.spot <-> terminal.fomo.spot), and how two copies are compared.
 * Pure: no Next, no Prisma (unit-checked by scripts/check-userdata-sync.ts). The transport is the account mirror (account-mirror*.ts, op "userdata").
 *
 * Every edit of one of these blobs on one site is copied to the other site at once (the same signed server-to-server channel as the account).
 * The newer copy wins (`updatedAt`, the user's own write and its copy carry the same instant), so a repeated or reordered message is harmless
 * and no message ever bounces back. Notification devices stay per site on purpose. The MAIN watchlist (table TerminalWatchItem) travels in its own
 * message (op "watchlist": the whole list, its instant is the `createdAt` its rows carry on both sites).
 */

/** Settings, indicators, drawings, templates, layouts, scripts, favourites, last symbol, calendar and terminal preferences, extra watchlists. */
export const MIRRORED_KINDS: readonly string[] = [
  "chart_settings",
  "chart_prefs",
  "chart_indicators",
  "chart_drawings",
  "chart_template",
  "drawing_template",
  "layout",
  "indicator_script",
  "indicator_favorites",
  "terminal_last",
  "terminal_prefs",
  "terminal_watchlists", // the EXTRA watchlists (the main list is a table of its own: op "watchlist")
  "calendar_prefs",
];
const KINDS = new Set(MIRRORED_KINDS);
export function isMirroredKind(kind: string): boolean {
  return KINDS.has(kind);
}

/** A message that does not fit the mirror body limit (64 KB with the envelope) is not sent; the periodic reconcile script covers such a row. */
export const MIRROR_DATA_MAX_JSON = 56 * 1024;

/** The incoming copy replaces ours only when it is strictly newer (equal = the same write, older = stale). */
export function incomingWins(localAtMs: number | null | undefined, incomingAtMs: number): boolean {
  return localAtMs === null || localAtMs === undefined || incomingAtMs > localAtMs;
}

export type SyncRow = { kind: string; key: string; at: number };
/** For the reconcile script: which side holds the newer copy of one row. */
export function newerSide(a: number | null, b: number | null): "a" | "b" | "same" {
  if (a === null && b === null) return "same";
  if (a === null) return "b";
  if (b === null) return "a";
  return a > b ? "a" : b > a ? "b" : "same";
}
