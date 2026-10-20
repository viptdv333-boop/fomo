/**
 * Which of the ALGOPACK tabs («Стакан», «ALGOPACK») the terminal shows. Pure (no React / Next), checked by scripts/check-algopack-tabs.ts.
 * The server decides (GET /api/algopack/status -> { allowed }): no key on the server, ALGOPACK_PUBLIC=0 for a regular user, or a
 * visitor without a session = the two tabs are not shown at all (never a tab that can only say «нет доступа»). While the answer is
 * unknown (null) they are not shown either, so nothing flickers in and out.
 */

export const ALGOPACK_TABS = ["orderbook", "algo"] as const;
export type AlgopackTab = (typeof ALGOPACK_TABS)[number];

export function isAlgopackTab(id: string): id is AlgopackTab {
  return (ALGOPACK_TABS as readonly string[]).includes(id);
}

/** `allowed`: the server's answer (true / false) or null while unknown / failed. */
export function filterTabs<T extends { id: string }>(tabs: readonly T[], allowed: boolean | null): T[] {
  return allowed === true ? [...tabs] : tabs.filter((t) => !isAlgopackTab(t.id));
}

/** The tab to show: a saved ALGOPACK tab is only left once the server has said no (while unknown the panel paints its own loading state). */
export function effectiveTab<T extends string>(tab: T, allowed: boolean | null, fallback: T): T {
  return isAlgopackTab(tab) && allowed === false ? fallback : tab;
}

/** Reads the status answer: only an explicit `allowed: true` opens the tabs. */
export function allowedFromStatus(status: number, body: unknown): boolean {
  if (status !== 200 || !body || typeof body !== "object") return false;
  const b = body as { ok?: unknown; allowed?: unknown };
  return b.ok === true && b.allowed === true;
}
