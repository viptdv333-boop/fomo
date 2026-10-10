"use client";

import { useEffect, useState } from "react";

/**
 * The ideas that carry something unread (a new comment / reply / like) but are not in the list the screen has loaded (an old post far below the first
 * 50, another page): fetched one by one from the idea endpoint so the screen can put them on top as highlighted cards. The dock counts them, so they
 * must be findable among the cards. Cached for the page's life (60 s), a failed request is not retried in a loop.
 */
export interface UnreadIdeaCard {
  id: string;
  title: string;
  preview: string;
  isPaid: boolean;
  price: number | null;
  acceptDonations?: boolean;
  createdAt: string;
  moderationStatus?: string;
  viewCount?: number;
  channelId?: string | null;
  author: { id: string; displayName: string; fomoId?: string | null; rating: number; avatarUrl: string | null; donationCard?: string | null; sbpQrUrl?: string | null };
  instruments: { id: string; name: string; slug: string; asset?: { slug: string; name: string } | null }[];
  voteScore: number;
  userVote: number | null;
}

const TTL = 60_000;
const cache = new Map<string, { at: number; idea: UnreadIdeaCard | null }>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function normalize(j: Record<string, unknown>): UnreadIdeaCard | null {
  if (!j || typeof j.id !== "string" || typeof j.title !== "string" || !j.author) return null;
  const ch = j.channel as { id?: string } | null | undefined;
  return {
    id: j.id,
    title: j.title,
    preview: typeof j.preview === "string" ? j.preview : "",
    isPaid: !!j.isPaid,
    price: typeof j.price === "number" ? j.price : null,
    acceptDonations: !!j.acceptDonations,
    createdAt: String(j.createdAt ?? ""),
    moderationStatus: typeof j.moderationStatus === "string" ? j.moderationStatus : undefined,
    viewCount: typeof j.viewCount === "number" ? j.viewCount : undefined,
    channelId: ch?.id ?? null,
    author: j.author as UnreadIdeaCard["author"],
    instruments: Array.isArray(j.instruments) ? (j.instruments as UnreadIdeaCard["instruments"]) : [],
    voteScore: typeof j.voteScore === "number" ? j.voteScore : 0,
    userVote: typeof j.userVote === "number" ? j.userVote : null,
  };
}

async function load(id: string) {
  if (inflight.has(id)) return;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return;
  inflight.add(id);
  try {
    const r = await fetch(`/api/ideas/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (r.ok) cache.set(id, { at: Date.now(), idea: normalize(await r.json()) });
    else if (r.status === 404 || r.status === 403) cache.set(id, { at: Date.now(), idea: null });
  } catch {
    /* offline: nothing is shown for this one, the next visit tries again */
  }
  inflight.delete(id);
  for (const l of listeners) l();
}

/** The cards of `ids` that could be fetched, by id (empty until they arrive). Pass [] to fetch nothing. */
export function useUnreadIdeaCards(ids: readonly string[]): Record<string, UnreadIdeaCard> {
  const [, tick] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    listeners.add(on);
    for (const id of key ? key.split(",") : []) void load(id);
    return () => {
      listeners.delete(on);
    };
  }, [key]);
  const out: Record<string, UnreadIdeaCard> = {};
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit?.idea) out[id] = hit.idea;
  }
  return out;
}
