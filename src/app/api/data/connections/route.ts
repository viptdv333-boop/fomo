import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { cryptoReady, encryptKey } from "@/lib/data/crypto";
import { cleanKey, providerById } from "@/lib/data/providers";
import { checkKey } from "@/lib/data/validate";

/* The user's market-data provider keys. The key is stored encrypted and is NEVER returned: a list has only the provider, the last 4 characters,
   the state and the check time. Every answer is private (no shared cache). */

const PRIVATE = { "Cache-Control": "private, no-store" } as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE });

export async function GET() {
  const userId = (await auth())?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);
  const rows = await prisma.dataConnection.findMany({ where: { userId }, select: { provider: true, keyHint: true, enabled: true, status: true, checkedAt: true } });
  return json({ connections: rows, ready: cryptoReady() });
}

// POST { provider, key }: checks the key with the provider, stores it encrypted (replacing the old one)
export async function POST(req: NextRequest) {
  const userId = (await auth())?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);
  if (!cryptoReady()) return json({ error: "unavailable" }, 503);
  const lim = await rateLimit(`dataconn:${userId}`, 12, 10 * 60 * 1000);
  if (!lim.allowed) return json({ error: "rate" }, 429);

  let body: { provider?: unknown; key?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad-request" }, 400);
  }
  const provider = providerById(body?.provider);
  const key = cleanKey(body?.key);
  if (!provider || !provider.needsKey) return json({ error: "provider" }, 400);
  if (!key) return json({ error: "key-format" }, 400);

  const check = await checkKey(provider.id, key);
  if (check === "invalid") return json({ error: "key-invalid" }, 422);
  if (check === "error") return json({ error: "check-failed" }, 502);

  const enc = encryptKey(key);
  if (!enc) return json({ error: "unavailable" }, 503);
  const data = { keyEnc: enc, keyHint: key.slice(-4), enabled: true, status: "ok", checkedAt: new Date() };
  await prisma.dataConnection.upsert({ where: { userId_provider: { userId, provider: provider.id } }, create: { userId, provider: provider.id, ...data }, update: data });
  return json({ ok: true, provider: provider.id, keyHint: data.keyHint });
}

// PATCH { provider, enabled }: switches a stored key on / off
export async function PATCH(req: NextRequest) {
  const userId = (await auth())?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);
  let body: { provider?: unknown; enabled?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad-request" }, 400);
  }
  const provider = providerById(body?.provider);
  if (!provider || typeof body?.enabled !== "boolean") return json({ error: "bad-request" }, 400);
  const r = await prisma.dataConnection.updateMany({ where: { userId, provider: provider.id }, data: { enabled: body.enabled } });
  return json({ ok: r.count > 0 });
}

// DELETE ?provider=: removes the key
export async function DELETE(req: NextRequest) {
  const userId = (await auth())?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);
  const provider = providerById(req.nextUrl.searchParams.get("provider"));
  if (!provider) return json({ error: "bad-request" }, 400);
  await prisma.dataConnection.deleteMany({ where: { userId, provider: provider.id } });
  return json({ ok: true });
}
