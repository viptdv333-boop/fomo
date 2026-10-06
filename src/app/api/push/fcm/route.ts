import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

// Android app (android/): registers / removes the Firebase token of this device for the signed-in user.
// Called by the page itself (src/components/layout/NativePushRegistrar.tsx) with the session cookie.

const MAX_TOKENS_PER_USER = 10;

const registerSchema = z.object({
  token: z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:.\-]+$/),
  deviceName: z.string().max(80).optional(),
  appVersion: z.string().max(40).optional(),
});
const removeSchema = z.object({ token: z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:.\-]+$/) });

async function limited(userId: string): Promise<NextResponse | null> {
  const r = await rateLimit(`fcm:${userId}`, 60, 60 * 60 * 1000);
  if (r.allowed) return null;
  return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } });
}

async function readJson(request: NextRequest): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await limited(userId);
  if (rl) return rl;

  const body = await readJson(request);
  if (body === undefined) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { token, deviceName, appVersion } = parsed.data;

  // Keyed by token, not (userId, token): a phone that switches accounts moves the row instead of colliding on the unique token.
  await prisma.fcmToken.upsert({
    where: { token },
    create: { userId, token, deviceName, appVersion },
    update: { userId, deviceName, appVersion, lastSeenAt: new Date() },
  });

  // a user cannot pile up tokens (reinstalls leave dead ones behind until FCM reports UNREGISTERED)
  const stale = await prisma.fcmToken.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    skip: MAX_TOKENS_PER_USER,
    select: { id: true },
  });
  if (stale.length > 0) await prisma.fcmToken.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await limited(userId);
  if (rl) return rl;

  const body = await readJson(request);
  if (body === undefined) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await prisma.fcmToken.deleteMany({ where: { token: parsed.data.token, userId } });
  return NextResponse.json({ ok: true });
}
