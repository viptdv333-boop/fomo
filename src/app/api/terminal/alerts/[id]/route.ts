import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_ACTIVE_ALERTS, patchSchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

// PATCH — pause / resume / edit one of the user's alerts.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;

  const limit = await rateLimit(`terminal-alerts:${userId}`, 60, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const v = parsed.data;

  const current = await prisma.priceAlert.findFirst({ where: { id, userId } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (v.price !== undefined && current.kind !== "price") return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (v.status !== undefined) data.status = v.status;
  if (v.condition !== undefined) data.condition = v.condition;
  if (v.price !== undefined) data.price = v.price;
  if (v.message !== undefined) data.message = v.message || null;
  if (v.repeat !== undefined) data.repeat = v.repeat;
  if (v.cooldownMin !== undefined) data.cooldownMin = v.cooldownMin;
  if (v.expiresAt !== undefined) data.expiresAt = v.expiresAt ? new Date(v.expiresAt) : null;

  const rearm = v.status === "active" || v.price !== undefined || v.condition !== undefined;
  if (rearm) {
    // a new level or a resume: the side has to be observed afresh, and a fired/expired alert becomes live again
    data.lastSide = 0;
    if (current.status === "triggered" || current.status === "expired") {
      data.triggeredAt = null;
      if (v.status === undefined) data.status = "active";
      if (v.expiresAt === undefined && current.expiresAt && current.expiresAt.getTime() <= Date.now()) data.expiresAt = null;
    }
  }
  if (data.status === "active" && current.status !== "active" && current.status !== "paused") {
    const active = await prisma.priceAlert.count({ where: { userId, status: { in: ["active", "paused"] } } });
    if (active >= MAX_ACTIVE_ALERTS) return NextResponse.json({ error: "Alert limit reached" }, { status: 409 });
  }

  const alert = await prisma.priceAlert.update({ where: { id }, data });
  return NextResponse.json({ alert });
}

// DELETE — remove one of the user's alerts.
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.priceAlert.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
