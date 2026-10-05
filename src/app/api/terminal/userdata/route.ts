import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Per-user JSON blobs of the terminal (drawing templates, indicator scripts, layouts, synced drawings…).
 *   GET    ?kind=drawing_template            → { items: [{ key, data, updatedAt }] }
 *   GET    ?kind=drawings&key=moex:SBER      → { items: [one] }
 *   PUT    { kind, key, data }               → upsert
 *   DELETE ?kind=…&key=…                     → remove
 */

const KIND = z.string().regex(/^[a-z_]{1,32}$/);
const KEY = z.string().min(1).max(120);
const MAX_BYTES = 512 * 1024;
const MAX_PER_KIND = 300;
/**
 * Chart state that follows the account (src/lib/chart/account-sync.ts): small per-kind byte caps, and drawings keep the
 * newest 200 symbols (the oldest is evicted instead of refusing the write, so the limit never shows up as an error).
 */
const KIND_MAX_BYTES: Record<string, number> = { chart_prefs: 16 * 1024, chart_indicators: 64 * 1024, chart_drawings: 400 * 1024, terminal_last: 2 * 1024 };
const EVICT_KINDS: Record<string, number> = { chart_drawings: 200 };

const putSchema = z.object({ kind: KIND, key: KEY, data: z.unknown() });

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = KIND.safeParse(request.nextUrl.searchParams.get("kind"));
  if (!kind.success) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
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
  if (!parsed.success || parsed.data.data === undefined) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { kind, key, data } = parsed.data;
  if (raw.length > (KIND_MAX_BYTES[kind] ?? MAX_BYTES)) return NextResponse.json({ error: "Too large" }, { status: 413 });

  const exists = await prisma.terminalUserData.findUnique({ where: { userId_kind_key: { userId, kind, key } }, select: { id: true } });
  if (!exists) {
    const count = await prisma.terminalUserData.count({ where: { userId, kind } });
    const evictAt = EVICT_KINDS[kind];
    if (evictAt !== undefined && count >= evictAt) {
      const oldest = await prisma.terminalUserData.findMany({ where: { userId, kind }, orderBy: { updatedAt: "asc" }, take: count - evictAt + 1, select: { id: true } });
      await prisma.terminalUserData.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
    } else if (count >= MAX_PER_KIND) return NextResponse.json({ error: "Limit reached" }, { status: 409 });
  }
  await prisma.terminalUserData.upsert({
    where: { userId_kind_key: { userId, kind, key } },
    create: { userId, kind, key, data: data as object },
    update: { data: data as object },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = KIND.safeParse(request.nextUrl.searchParams.get("kind"));
  const key = KEY.safeParse(request.nextUrl.searchParams.get("key"));
  if (!kind.success || !key.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await prisma.terminalUserData.deleteMany({ where: { userId: session.user.id, kind: kind.data, key: key.data } });
  return NextResponse.json({ ok: true });
}
