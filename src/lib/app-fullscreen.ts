// Pure helpers of the full-screen chart of the app-only Terminal (src/components/app/AppTerminal.tsx). No React, no DOM access:
// scripts/check-app-ui.ts runs them. The chart opens in the orientation the device is in (it never forces or rotates it);
// Android's immersive mode hides the system bars, everywhere else the Fullscreen API or a plain CSS layer does the job.

/** Key of the marker the page puts into history.state while the chart is full screen, so the system Back button (and the browser's) closes it. */
export const FS_HISTORY_KEY = "fomoChartFs";

/** Marker present in a history.state value (any shape, junk-safe). */
export function isFsHistoryState(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as Record<string, unknown>)[FS_HISTORY_KEY] === true;
}

/** The history.state to push when the chart goes full screen: the current state (Next.js keeps its router data there) plus the marker. */
export function fsPushState(current: unknown): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  return { ...base, [FS_HISTORY_KEY]: true };
}

export interface FullscreenEnv {
  /** inside the Android app (bridge or UA marker) */
  native: boolean;
  /** the installed app build has FomoApp.setImmersive */
  nativeImmersive: boolean;
  /** document.documentElement.requestFullscreen exists (false in the Android WebView, which has no custom-view support) */
  apiAvailable: boolean;
}

export interface FullscreenPlan {
  /** hide the Android system bars through the bridge */
  immersive: boolean;
  /** ask the browser for real full screen */
  api: boolean;
}

/**
 * What entering full screen should do besides showing the CSS layer (which always happens):
 * the new app hides its system bars, an old app has nothing (its WebView ignores the Fullscreen API), a browser / PWA uses the API when it can.
 */
export function fullscreenPlan(e: FullscreenEnv): FullscreenPlan {
  if (e.native) return { immersive: e.nativeImmersive, api: false };
  return { immersive: false, api: e.apiAvailable };
}

/** A popstate while the chart is full screen closes it as soon as the entry we pushed is gone. */
export function collapseOnPop(expanded: boolean, state: unknown): boolean {
  return expanded && !isFsHistoryState(state);
}
