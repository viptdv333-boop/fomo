import { isOnline } from "./offline/online";

// "Обновить приложение": drops the service worker and every cache it kept, then
// reloads from the network. An installed PWA otherwise keeps running whatever
// bundle it loaded until it is fully closed, so users who still see an old bug
// have no way to pick up the fix.
async function serverAnswers(): Promise<boolean> {
  try {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), 4000);
    const res = await fetch("/api/version", { cache: "no-store", signal: ctl?.signal });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function forceUpdate(): Promise<void> {
  // Offline there is nothing to update to, and the reload below would land on a dead page after throwing away the saved copy of the app.
  // navigator.onLine is not enough (a dead Wi-Fi says "online"): the server must really answer before anything is deleted.
  if (!isOnline() || !(await serverAnswers())) return;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Best effort — reload below still fetches a fresh page.
  }
  window.location.reload();
}
