"use client";

/* Light mode for weak video cards. The new (macOS) look leans on the GPU: blurred glass, filter shadows, a fixed gradient wallpaper, big soft
   shadows. On an old PC with a "stub" video card that makes every switch and scroll stutter. In light mode `html[data-lite]` (lite.css) turns
   those effects off and makes the translucent surfaces solid; the layout and the colours stay.
   The choice is per device (localStorage): "1" on, "0" off. Without a choice the mode switches itself on only where the video card is clearly weak
   (software rendering or a known entry-level / very old card), so a modern PC never loses the glass by accident. */
import { useSyncExternalStore } from "react";

export const LITE_KEY = "fomo-lite-v1";
const EVENT = "fomo-lite-mode";

/** WebGL renderer names of cards that cannot do blurred translucent layers smoothly (matched case-insensitively). */
const WEAK_GPU: RegExp[] = [
  /swiftshader|llvmpipe|software|basic render|microsoft basic|softpipe|mesa offscreen/,
  /geforce\s*(g\s*|gt\s*|gts\s*)?(2\d\d|3\d\d|4[0-4]\d|5[0-4]\d|6[0-3]\d|7[0-3]\d|8[0-5]\d|9[0-6]\d)(m|\s|\)|\/|$)/, // GeForce 210..960-class old cards
  /geforce\s*(gt|gts)\s*\d/,
  /geforce\s*(7|8|9)\d{3}\s*(gs|gt|gtx)?/,
  /radeon\s*(hd\s*)?([2-6]\d{3})\b/,
  /radeon\s*(r[2-5]\b|r[2-5]\s)/,
  /intel.*(hd graphics\s*(2000|3000|4000|2500|3\d\d)\b|gma|g41|g45|q45|ironlake|sandybridge|ivybridge)/,
  /intel\(r\)\s*hd graphics\s*$/,
  /mali-4|mali-t[1-6]|adreno\s*\(?tm\)?\s*[1-3]\d\d\b|powervr/,
  /\bgt\s*(210|220|240|310|320|330|410|420|430|440|520|610|620|630|710|720|730|1030)\b/,
];

let detected: boolean | null = null;

/** True when the video card looks clearly weak. Cheap: one throw-away WebGL context, read once. */
export function detectWeakGpu(): boolean {
  if (detected !== null) return detected;
  detected = false;
  try {
    const cv = document.createElement("canvas");
    const gl = (cv.getContext("webgl") || cv.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      detected = true; // no WebGL at all: software only
      return detected;
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? "").toLowerCase();
    detected = WEAK_GPU.some((re) => re.test(name));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    detected = false;
  }
  return detected;
}

function choice(): boolean | null {
  try {
    const v = localStorage.getItem(LITE_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

/** Is the light mode on for this device: the user's choice, else the video card's verdict. */
export function liteOn(): boolean {
  return choice() ?? detectWeakGpu();
}

export function setLite(on: boolean): void {
  try {
    localStorage.setItem(LITE_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  applyLite();
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Self-check while the new look is on: the page watches its own frame times during scrolling, clicks and typing. When more than 40 % of the
 * time of an interaction window of 2.5 s goes into frames slower than 45 ms (under ~22 fps), the card cannot carry the glass: the light mode is
 * switched on by itself and remembered. Costs nothing while the user is idle (the frame loop runs only during activity). Returns the stop function.
 */
export function watchPerformance(): () => void {
  const newLookOn = () => !!document.querySelector(".tvmac, .app-mac, .pfmac, [data-mac-look]") || document.documentElement.hasAttribute("data-tvmac");
  let last = 0;
  let until = 0;
  let active = 0;
  let slow = 0;
  let raf = 0;
  let stopped = false;

  const reset = () => {
    last = 0;
    active = 0;
    slow = 0;
  };
  const frame = (t: number) => {
    raf = 0;
    if (stopped || liteOn()) return;
    if (t > until) {
      reset(); // the user went quiet: the loop rests until the next activity
      return;
    }
    if (last > 0 && newLookOn()) {
      const d = t - last;
      if (d < 1000) {
        active += d;
        if (d > 45) slow += d;
      }
      if (active >= 2500) {
        if (slow / active > 0.4) {
          setLite(true);
          stopped = true;
          return;
        }
        active = 0;
        slow = 0;
      }
    }
    last = t;
    raf = requestAnimationFrame(frame);
  };
  const poke = () => {
    if (stopped || document.visibilityState === "hidden") return;
    until = performance.now() + 300;
    if (!raf && !liteOn()) raf = requestAnimationFrame(frame);
  };
  const evs = ["scroll", "wheel", "pointerdown", "pointermove", "keydown", "touchmove"] as const;
  for (const e of evs) window.addEventListener(e, poke, { passive: true, capture: true });
  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    for (const e of evs) window.removeEventListener(e, poke, true);
  };
}

/** Mirrors the mode on <html> (lite.css hangs on it). */
export function applyLite(): void {
  const el = document.documentElement;
  if (liteOn()) el.setAttribute("data-lite", "");
  else el.removeAttribute("data-lite");
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLite(): { on: boolean; set: (v: boolean) => void } {
  const on = useSyncExternalStore(subscribe, liteOn, () => false);
  return { on, set: setLite };
}
