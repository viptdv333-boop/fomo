/* In-memory per-IP limiter for public read-only market endpoints (no DB: usable where the DB is not reachable). */

import type { NextRequest } from "next/server";

const hits = new Map<string, { n: number; reset: number }>();

export function ipOf(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** true when the caller is over `max` requests per `windowMs` */
export function overLimit(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n++;
  return h.n > max;
}
