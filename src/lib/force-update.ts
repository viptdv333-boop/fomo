// Refresh the installed web/PWA bundle only after confirming that the server responds.
// The previous version also trusted a cached "offline" flag and silently returned,
// which made the profile action appear broken after connectivity recovered.
async function serverAnswers(): Promise<boolean> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 5000);
  try {
    const res = await fetch(`/api/version?check=${Date.now()}`, { cache: "no-store", signal: ctl?.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function forceUpdate(): Promise<boolean> {
  if (!(await serverAnswers())) return false;
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
    // Best effort: a reload still requests a new document from the server.
  }
  window.location.reload();
  return true;
}
