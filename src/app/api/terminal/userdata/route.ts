import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { mirrorUserData } from "@/lib/account-mirror-client";
import { KIND_MAX_BYTES, MAX_BYTES, MAX_PER_KIND, upsertUserData } from "@/lib/userdata-store";

/**
 * Per-user JSON blobs of the terminal (drawing templates, indicator scripts, layouts, synced drawings…).
 *   GET    ?kind=drawing_template            → { items: [{ key, data, updatedAt }] }
 *   GET    ?kind=drawings&key=moex:SBER      → { items: [one] }
 *   PUT    { kind, key, data }               → upsert
 *   DELETE ?kind=…&key=…                     → remove
 */

const KIND = z.string().regex(/^[a-z_]{1,32}$/);
const KEY = z.string().min(1).max(120);
/* The limits (small per-kind byte caps for the chart state, drawings keep the newest 200 symbols) live in src/lib/userdata-store.ts, shared with the copy
   that arrives from the other site. Every write / removal here is also copied to the other site at once (the account mirror, op "userdata"). */

const putSchema = z.object({ kind: KIND, key: KEY, data: z.unknown() });
const RESERVED_KINDS = new Set(["author_rating_vote", "global_provider_key"]);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = KIND.safeParse(request.nextUrl.searchParams.get("kind"));
  if (!kind.success) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  if (RESERVED_KINDS.has(kind.data)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const keyParam = request.nextUrl.searchParams.get("key");
  const rows = await prisma.terminalUserData.findMany({
    where: { userId: session.user.id, kind: kind.data, ...(keyParam ? { key: keyParam } : {}) },
    orderBy: { updatedAt: "desc" },
    take: MAX_PER_KIND,
    select: { key: true, data: true, updatedAt: true },
  });
  // uid: the account the answer belongs to (the chart sync tags its local copies with it, so a shared browser never carries one account's chart to another)
  return NextResponse.json({ items: rows, uid: session.user.id }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const limit = await rateLimit(`terminal-userdata:${userId}`, 120, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(json);
  if (parsed.success && RESERVED_KINDS.has(parsed.data.kind)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!parsed.success || parsed.data.data === undefined) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { kind, key, data } = parsed.data;
  if (raw.length > (KIND_MAX_BYTES[kind] ?? MAX_BYTES)) return NextResponse.json({ error: "Too large" }, { status: 413 });

  // the instant of this write: stored here and sent to the other site, which keeps the newer copy
  const at = new Date();
  const written = await upsertUserData(prisma, userId, kind, key, data, at);
  if (written === "limit") return NextResponse.json({ error: "Limit reached" }, { status: 409 });
  mirrorUserData(userId, session.user.email, kind, key, { at: at.getTime(), data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = KIND.safeParse(request.nextUrl.searchParams.get("kind"));
  const key = KEY.safeParse(request.nextUrl.searchParams.get("key"));
  if (!kind.success || !key.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (RESERVED_KINDS.has(kind.data)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.terminalUserData.deleteMany({ where: { userId: session.user.id, kind: kind.data, key: key.data } });
  mirrorUserData(session.user.id, session.user.email, kind.data, key.data, { at: Date.now(), deleted: true });
  return NextResponse.json({ ok: true });
}
