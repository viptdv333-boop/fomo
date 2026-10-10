import { forceUpdate } from "./force-update";
import { isOnline } from "./offline/online";

// After a deploy, a page that was already open asks for JS files of the previous build, which
// no longer exist. That surfaces as a chunk-load error; a reload fetches the new build.
export function isChunkError(error: { name?: string; message?: string } | null | undefined): boolean {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    `${error?.name ?? ""} ${error?.message ?? ""}`
  );
}

/** Reloads once (with caches dropped) for a chunk error. Returns true when a reload was started. */
export function reloadOnceForChunkError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!isChunkError(error)) return false;
  // offline: a chunk that is not stored cannot be fetched by a reload either, and forceUpdate would wipe the offline copy
  if (!isOnline()) return false;
  try {
    const last = Number(sessionStorage.getItem("chunk-reload-at") || 0);
    // A second failure right after a reload is a real problem, not a stale build: do not loop.
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem("chunk-reload-at", String(Date.now()));
  } catch {}
  forceUpdate();
  return true;
}
