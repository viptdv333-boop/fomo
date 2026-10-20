"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { allowedFromStatus } from "@/lib/algopack-tabs";

/* Is ALGOPACK data (order book, ALGOPACK tab) served to the current requester? One request to /api/algopack/status per
   page load and sign-in state (answer kept for 5 minutes); null = not known yet / the request failed (retried after 30 s). */

const TTL_MS = 5 * 60_000;
const RETRY_MS = 30_000;
let cached: { at: number; authed: boolean; allowed: boolean } | null = null;
let inflight: Promise<boolean | null> | null = null;

async function ask(authed: boolean): Promise<boolean | null> {
  if (cached && cached.authed === authed && Date.now() - cached.at < TTL_MS) return cached.allowed;
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch("/api/algopack/status", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        // an answer from the server (even a "no") is an answer; a transport error / 5xx is not
        if (res.status >= 500) return null;
        const allowed = allowedFromStatus(res.status, body);
        cached = { at: Date.now(), authed, allowed };
        return allowed;
      } catch {
        return null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

export function useAlgopackAllowed(): boolean | null {
  const { status } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (status === "loading") return;
    const authed = status === "authenticated";
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      const a = await ask(authed);
      if (stopped) return;
      setAllowed(a);
      if (a === null) timer = setTimeout(run, RETRY_MS);
    };
    void run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [status]);
  return allowed;
}
