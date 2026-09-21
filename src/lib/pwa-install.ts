"use client";

// Module-level singleton: `beforeinstallprompt` fires once per page load and
// only to listeners already attached at that moment. Capturing it here (as
// soon as this module is imported, independent of which component mounts
// first/last) means an "Install app" button placed anywhere — header menu,
// landing page, mounted late inside a dropdown — can still trigger it later,
// instead of each component racing to attach its own listener in time.
let deferredPrompt: any = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    installed ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ Safari reports itself as a Mac; a touch screen gives it away.
  const ipadAsMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return (/iPad|iPhone|iPod/.test(navigator.userAgent) || ipadAsMac) && !(window as any).MSStream;
}

// The iOS "how to add to Home Screen" dialog lives here rather than in the
// button component: the button sits inside dropdown menus that close (and
// unmount) on click, which took the dialog's state down with them, so on an
// iPhone tapping "Установить приложение" appeared to do nothing.
let iosStepsOpen = false;

export function isIosStepsOpen(): boolean {
  return iosStepsOpen;
}

export function openIosSteps(): void {
  iosStepsOpen = true;
  notify();
}

export function closeIosSteps(): void {
  iosStepsOpen = false;
  notify();
}

export function isIOSNonSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return /CriOS|FxiOS|EdgiOS|YaBrowser|OPiOS|GSA\//.test(navigator.userAgent);
}

export function canPromptInstall(): boolean {
  return Boolean(deferredPrompt);
}

export function subscribePwaInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function triggerInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}
