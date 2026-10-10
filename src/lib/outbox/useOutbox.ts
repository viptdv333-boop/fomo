"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import core from "../../../public/sw-outbox-core.js";
import { OUTBOX_SENT_EVENT, outboxSnapshot, outboxUid, subscribeOutbox, type OutboxItem, type OutboxSentDetail } from "./outbox";

const EMPTY: OutboxItem[] = [];

/** The whole queue (all users' items are removed on sign-in, so this is the signed-in user's). Empty on the server. */
export function useOutboxAll(): OutboxItem[] {
  return useSyncExternalStore(subscribeOutbox, outboxSnapshot, () => EMPTY);
}

/**
 * Items of one thread the screen should draw after the server's own list: waiting, failed and just delivered ones the list does not show yet.
 * serverIds: ids present in the loaded server list (a delivered item disappears as soon as its server twin is there: no double, no flash).
 */
export function useOutboxItems(target: string | null | undefined, serverIds?: Set<string> | null): OutboxItem[] {
  const all = useOutboxAll();
  return useMemo(() => {
    if (!target) return EMPTY;
    const uid = outboxUid();
    return core.mergePending(all.filter((i) => i.uid === uid), target, serverIds ?? null, Date.now());
  }, [all, target, serverIds]);
}

export function useOutboxCounts(): { pending: number; failed: number; auth: number } {
  const all = useOutboxAll();
  return useMemo(() => core.counts(all, outboxUid() || undefined), [all]);
}

/** Calls cb when an item of this target was delivered (reload the thread now instead of waiting for the next poll). */
export function useOutboxSent(target: string | null | undefined, cb: (d: OutboxSentDetail) => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!target) return;
    const h = (e: Event) => {
      const d = (e as CustomEvent<OutboxSentDetail>).detail;
      if (d && d.target === target) ref.current(d);
    };
    window.addEventListener(OUTBOX_SENT_EVENT, h);
    return () => window.removeEventListener(OUTBOX_SENT_EVENT, h);
  }, [target]);
}
