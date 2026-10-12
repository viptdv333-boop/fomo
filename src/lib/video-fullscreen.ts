// Pure helpers of the shared video player (src/components/shared/VideoPlayer.tsx). No React, no DOM access: scripts/check-app-ui.ts runs them.
// Why: the Android WebView of app builds before 1.0.3 has no onShowCustomView, so the fullscreen button of a plain <video controls> is absent
// (the video plays as a small rectangle). The player therefore has its own button: real fullscreen where it works, an in-page overlay otherwise.

export type VideoFsMode =
  /** requestFullscreen on the <video> (a browser, the desktop app, or an app build whose WebView shows custom views: FomoApp.appFeatures().videoFullscreen) */
  | "api"
  /** an in-page black layer (an old app build / a browser without the Fullscreen API) */
  | "overlay";

export interface VideoFsEnv {
  /** inside the Android app (bridge or UA marker) */
  native: boolean;
  /** the installed app build reports videoFullscreen (WebChromeClient.onShowCustomView exists) */
  nativeVideoFs: boolean;
  /** the Fullscreen API (or the iOS webkitEnterFullscreen) can take this <video> */
  apiAvailable: boolean;
}

/**
 * Which path the ⛶ button takes. In the Android app the capability flag decides (an old WebView may report a Fullscreen API it cannot show);
 * everywhere else the API is used whenever the browser can do it.
 */
export function videoFullscreenPlan(e: VideoFsEnv): VideoFsMode {
  if (e.native) return e.nativeVideoFs ? "api" : "overlay";
  return e.apiAvailable ? "api" : "overlay";
}

/** What the overlay hands to the second <video> so playback goes on where the inline one stopped. */
export interface VideoResume {
  time: number;
  playing: boolean;
  rate: number;
  volume: number;
  muted: boolean;
}

function fin(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

/** A tolerant snapshot of a media element (any shape, junk-safe). */
export function videoResumeFrom(v: { currentTime?: unknown; paused?: unknown; ended?: unknown; playbackRate?: unknown; volume?: unknown; muted?: unknown } | null | undefined): VideoResume {
  const o = v ?? {};
  return {
    time: Math.max(0, fin(o.currentTime, 0)),
    playing: o.paused === false && o.ended !== true,
    rate: Math.min(4, Math.max(0.25, fin(o.playbackRate, 1))),
    volume: Math.min(1, Math.max(0, fin(o.volume, 1))),
    muted: o.muted === true,
  };
}

/** The time to seek to once metadata is known: inside the clip (a hair before its end so an ended video does not restart blank), never negative. */
export function resumeTime(time: number, duration: number): number {
  const t = Math.max(0, fin(time, 0));
  if (!Number.isFinite(duration) || duration <= 0) return t;
  return Math.min(t, Math.max(0, duration - 0.05));
}
