"use client";

import { useEffect, useState } from "react";
import { forceUpdate } from "@/lib/force-update";
import { useT } from "@/lib/i18n/client";
import { autoUpdateDecision, buildMismatch, isBuildAssetUrl, isStaleBuildError, recoverStaleShell } from "@/lib/stale-build";

const CHECK_EVERY_MS = 5 * 60 * 1000;

function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/**
 * Errors that mean «this page is from another release than the server»: a failed chunk / stylesheet under /_next/static, a failed dynamic import, a
 * missing Server Action, or the service worker telling that a build file it asked for is gone. The page drops the stored shell and reloads once
 * (loop guard in stale-build.ts). Production only: in `next dev` chunks come and go on every edit.
 */
function useStaleErrors() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const heal = (why: string) => void recoverStaleShell(why);
    // capture phase: a failed <script> / <link> does not bubble to window
    const onError = (e: Event) => {
      const t = e.target as (HTMLElement & { src?: string; href?: string }) | null;
      if (t && t !== (window as unknown) && (t.tagName === "SCRIPT" || t.tagName === "LINK")) {
        if (isBuildAssetUrl(t.src || t.href)) heal("asset " + (t.src || t.href));
        return;
      }
      const ee = e as ErrorEvent;
      if (isStaleBuildError(ee.error ?? ee.message)) heal("error " + String(ee.message).slice(0, 100));
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleBuildError(e.reason as { name?: string; message?: string } | string)) heal("rejection " + String((e.reason as { message?: string })?.message ?? e.reason).slice(0, 100));
    };
    const onSw = (e: MessageEvent) => {
      if (e.data && e.data.type === "fomo-stale-assets") heal("sw: a build file is gone");
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    navigator.serviceWorker?.addEventListener("message", onSw);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
      navigator.serviceWorker?.removeEventListener("message", onSw);
    };
  }, []);
}

// Tells an already-open app (typically an installed PWA that is never fully
// closed) that a newer release is live. A page that has only just opened (nothing typed yet) or an app that comes back from the
// background updates by itself (drops the stored shell, reloads once); otherwise a one-tap card is shown.
export default function UpdateBanner() {
  const { t } = useT();
  const [outdated, setOutdated] = useState(false);
  const [busy, setBusy] = useState(false);
  useStaleErrors();

  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!mine || mine === "dev") return;

    let stopped = false;
    const started = Date.now();
    let interacted = false;
    let hiddenAt = 0;
    const touch = () => {
      interacted = true;
    };
    async function check(hiddenForMs = 0) {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = await res.json();
        if (stopped || !buildMismatch(mine, id)) return;
        const d = autoUpdateDecision({ mismatch: true, pageAgeMs: Date.now() - started, interacted, hiddenForMs, editing: isEditing() });
        if (d === "now") {
          // a silent reload; when the guard refuses (a reload just happened, offline) the card is shown instead
          if (await recoverStaleShell(`build ${mine} -> ${id}`)) return;
        }
        if (!stopped) setOutdated(true);
      } catch {
        // Offline or server restarting — try again next time.
      }
    }

    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      void check(away);
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", touch, true);
    document.addEventListener("keydown", touch, true);
    // the service worker saw a newer release in a response (sw.js noteBuild): compare with /api/version right away
    const onBuild = () => void check();
    window.addEventListener("fomo-build-changed", onBuild);
    return () => {
      window.removeEventListener("fomo-build-changed", onBuild);
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", touch, true);
      document.removeEventListener("keydown", touch, true);
    };
  }, []);

  if (!outdated) return null;

  return (
    <div data-app-lift className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[60] bg-white dark:bg-gray-900 border border-green-600 rounded-xl shadow-lg p-3 flex items-center gap-3">
      <span className="text-sm text-gray-800 dark:text-gray-100 flex-1">{t("common.update.available")}</span>
      <button
        onClick={() => {
          setBusy(true);
          void forceUpdate().finally(() => setBusy(false)); // offline it does nothing (see force-update.ts)
        }}
        disabled={busy}
        className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
      >
        {busy ? "…" : t("common.update.button")}
      </button>
    </div>
  );
}
