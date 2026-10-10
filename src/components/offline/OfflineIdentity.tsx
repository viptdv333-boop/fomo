"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { homePath } from "@/lib/site-mode";
import { announceIdentity, OFFLINE_MODE_EVENT } from "@/lib/offline/sw-bridge";
import { isOnline, subscribeOnline } from "@/lib/offline/online";
import { runWarmup, WARMUP_EVERY_MS, WARMUP_NOW_EVENT, type WarmCtx } from "@/lib/offline/warmup";
import { outboxCounts, setOutboxUser } from "@/lib/outbox/outbox";
import { setPendingCounter } from "@/lib/offline/fetch-guard";

/**
 * Inside the (main) layout (it has the session): tells the service worker WHO is signed in (its caches are per user), starts the outbox for
 * that user (loads the saved queue, sends it), and runs the background warm-up (see src/lib/offline/warmup.ts): after the first paint,
 * when the app comes back to the foreground, when the network returns and at most every 10 minutes.
 */
export default function OfflineIdentity() {
  const { data: session, status } = useSession();
  const { locale } = useT();
  const router = useRouter();
  const uid = session?.user?.id || "";
  const ctx = useRef<WarmCtx>({ uid, locale });
  ctx.current = { uid, locale, prefetch: (h: string) => router.prefetch(h) };

  useEffect(() => {
    setPendingCounter(() => outboxCounts().pending + outboxCounts().failed);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (uid) announceIdentity(uid, locale, homePath());
    void setOutboxUser(uid);
  }, [uid, status, locale]);

  useEffect(() => {
    if (status === "loading") return;
    const run = (force: boolean) => void runWarmup(ctx.current, force).catch(() => {});
    const first = setTimeout(() => run(false), 4000);
    const onVis = () => document.visibilityState === "visible" && run(false);
    const onNow = () => run(true);
    const iv = setInterval(() => run(false), WARMUP_EVERY_MS);
    const unsub = subscribeOnline(() => isOnline() && run(false));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(WARMUP_NOW_EVENT, onNow);
    window.addEventListener(OFFLINE_MODE_EVENT, onNow); // the switch was flipped: warm up at once (a no-op while it is off)
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(WARMUP_NOW_EVENT, onNow);
      window.removeEventListener(OFFLINE_MODE_EVENT, onNow);
    };
  }, [status, uid]);

  return null;
}

