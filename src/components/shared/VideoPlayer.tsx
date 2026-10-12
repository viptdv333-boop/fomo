"use client";

import { useCallback, useEffect, useRef, useState, type VideoHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { canNativeVideoFullscreen, isNativeApp } from "@/lib/native-app";
import { resumeTime, videoFullscreenPlan, videoResumeFrom, type VideoResume } from "@/lib/video-fullscreen";
import { useBackLayer } from "@/components/app/useBackLayer";

type FsVideo = HTMLVideoElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
  webkitEnterFullscreen?: () => void;
};

/** Can this <video> be taken full screen by the browser (the Fullscreen API, or the iPhone's own player)? */
function apiAvailable(v: FsVideo): boolean {
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  if ((document.fullscreenEnabled || d.webkitFullscreenEnabled) && (typeof v.requestFullscreen === "function" || typeof v.webkitRequestFullscreen === "function")) return true;
  return typeof v.webkitEnterFullscreen === "function";
}

/** Asks the browser for real full screen; resolves false when it refused (the caller then opens the overlay). Never throws. */
async function requestApi(v: FsVideo): Promise<boolean> {
  try {
    if (typeof v.requestFullscreen === "function") {
      await v.requestFullscreen();
      return true;
    }
    if (typeof v.webkitRequestFullscreen === "function") {
      await v.webkitRequestFullscreen();
      return true;
    }
    if (typeof v.webkitEnterFullscreen === "function") {
      v.webkitEnterFullscreen();
      return true;
    }
  } catch {
    /* refused: fall back to the overlay */
  }
  return false;
}

interface Props extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "controls" | "poster"> {
  src: string;
  /** classes of the wrapper (layout in the post: "w-full" for a full-width video); the <video> keeps `className` */
  wrapClassName?: string;
}

/**
 * <video controls> with a ⛶ button that always works. Inline: the native controls. ⛶: the browser's real fullscreen where it works (a browser, the
 * desktop app, an app build that reports FomoApp.appFeatures().videoFullscreen - its WebView then shows the video natively, rotated), otherwise an
 * in-page black layer over the whole screen (an older app build): a second <video> continues at the same time / volume / speed, ✕ and the Android
 * Back button (window.FomoBack, a registered layer) close it and the inline video catches up. No swipe between tabs while it is open.
 */
export default function VideoPlayer({ src, className, wrapClassName, preload = "metadata", playsInline = true, ...rest }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const [overlay, setOverlay] = useState<VideoResume | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const open = useCallback(async () => {
    const v = ref.current as FsVideo | null;
    if (!v) return;
    const mode = videoFullscreenPlan({ native: isNativeApp(), nativeVideoFs: canNativeVideoFullscreen(), apiAvailable: apiAvailable(v) });
    if (mode === "api" && (await requestApi(v))) return;
    const snap = videoResumeFrom(v);
    v.pause();
    setOverlay(snap);
  }, []);

  const close = useCallback((state: VideoResume | null) => {
    setOverlay(null);
    const v = ref.current;
    if (!v || !state) return;
    v.muted = state.muted;
    v.volume = state.volume;
    v.playbackRate = state.rate;
    try {
      v.currentTime = resumeTime(state.time, v.duration);
    } catch {
      /* metadata not loaded: keep the old position */
    }
    if (state.playing) v.play().catch(() => {});
  }, []);

  return (
    <div className={`relative ${wrapClassName ?? "w-fit max-w-full"}`} data-noopen>
      <video ref={ref} src={src} controls controlsList="nofullscreen" playsInline={playsInline} preload={preload} className={className} {...rest} />
      <button
        type="button"
        className="absolute top-2 right-2 z-[1] flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-90 hover:opacity-100 active:scale-95"
        aria-label={t("common.video.fullscreen")}
        title={t("common.video.fullscreen")}
        data-video-fs
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void open();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
      {mounted && overlay && createPortal(<VideoOverlay src={src} start={overlay} onClose={close} label={t("common.close")} />, document.body)}
    </div>
  );
}

function VideoOverlay({ src, start, onClose, label }: { src: string; start: VideoResume; onClose: (state: VideoResume | null) => void; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const closing = useRef(false);
  const finish = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const v = ref.current;
    onClose(v ? videoResumeFrom(v) : start);
  }, [onClose, start]);

  // Android Back (window.FomoBack) closes the layer first, like any sheet of the app
  useBackLayer(true, finish);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [finish]);

  const onMeta = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = start.muted;
    v.volume = start.volume;
    v.playbackRate = start.rate;
    try {
      v.currentTime = resumeTime(start.time, v.duration);
    } catch {
      /* ignore */
    }
    if (start.playing) v.play().catch(() => {});
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-no-swipe
      data-video-overlay
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingRight: "env(safe-area-inset-right, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingLeft: "env(safe-area-inset-left, 0px)" }}
    >
      <video ref={ref} src={src} controls controlsList="nofullscreen" playsInline preload="auto" autoPlay={start.playing} onLoadedMetadata={onMeta} className="h-full w-full bg-black object-contain" />
      <button
        type="button"
        onClick={finish}
        aria-label={label}
        title={label}
        data-video-close
        className="absolute flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)", right: "calc(env(safe-area-inset-right, 0px) + 8px)" }}
      >
        ✕
      </button>
    </div>
  );
}
