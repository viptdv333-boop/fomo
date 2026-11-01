import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

/**
 * Fixed-window counters backed by Postgres.
 *
 * Every gate that used to be open — login, code guessing, registration,
 * posting — runs through here. The window is stored per key and reset lazily,
 * so there is no cleanup job to forget about; stale rows are simply overwritten
 * the next time their key is touched.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const fresh = new Date(now.getTime() + windowMs);

  try {
    // One statement so concurrent requests can't both read a stale count and
    // each decide they are under the limit.
    const rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${fresh})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."expiresAt" < ${now} THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "expiresAt" = CASE
          WHEN "RateLimit"."expiresAt" < ${now} THEN ${fresh}
          ELSE "RateLimit"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;

    const row = rows[0];
    const count = Number(row?.count ?? 1);
    const expiresAt = row?.expiresAt ?? fresh;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
    };
  } catch {
    // A limiter that fails closed would lock everyone out on a hiccup in the
    // counter table. Fail open and let the other checks do their job.
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }
}

/** Clears a counter — used after a successful login so honest users aren't punished. */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch {
    // Nothing to do; the window will expire on its own.
  }
}

/**
 * The client address from the proxy headers. Behind nginx the socket address is always 127.0.0.1, so the forwarded headers are what
 * identifies the client. nginx sets X-Forwarded-For with $proxy_add_x_forwarded_for: whatever the client sent is kept and the address nginx
 * itself saw is APPENDED. So the FIRST element is chosen by the visitor (free spoofing: every request a fresh "address", every per-source
 * limit bypassed) and the LAST one is the one our own nginx added: that one is used. Without X-Forwarded-For X-Real-IP is used, and
 * without any proxy header (local development, the loopback peer) "unknown", as before. With a second trusted proxy in front of nginx
 * this would have to take the one before last: there is none today.
 */
export function pickClientIp(forwardedFor: string | null | undefined, realIp: string | null | undefined): string {
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return (realIp ?? "").trim() || "unknown";
}

export function clientIp(req: NextRequest | Request): string {
  return pickClientIp(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
}
