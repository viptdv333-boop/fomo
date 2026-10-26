import { isStaleBuildError, recoverStaleShell } from "./stale-build";

// After a deploy, a page that was already open asks for JS files of the previous build, which
// no longer exist. That surfaces as a chunk-load error (or a missing Server Action); a reload fetches the new build.
// The rules (what counts, the loop guard, what is dropped) live in stale-build.ts and are checked by scripts/check-sw-cache.ts.
export function isChunkError(error: { name?: string; message?: string } | null | undefined): boolean {
  return isStaleBuildError(error);
}

/** Drops the stored shell and reloads once for a stale-build error. Returns true when the error was one (a reload is started unless the guard refuses). */
export function reloadOnceForChunkError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!isStaleBuildError(error)) return false;
  void recoverStaleShell("error: " + String(error?.message ?? error?.name ?? "").slice(0, 120));
  return true;
}
