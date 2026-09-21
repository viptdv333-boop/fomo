// "Обновить приложение": drops the service worker and every cache it kept, then
// reloads from the network. An installed PWA otherwise keeps running whatever
// bundle it loaded until it is fully closed, so users who still see an old bug
// have no way to pick up the fix.
export async function forceUpdate(): Promise<void> {
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
