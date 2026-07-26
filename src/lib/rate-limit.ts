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
 * Caller IP. Behind nginx the socket address is always 127.0.0.1, so the
 * forwarded headers are what actually identifies the client.
 */
export function clientIp(req: NextRequest | Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
