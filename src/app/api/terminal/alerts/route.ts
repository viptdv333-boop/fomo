import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { createSchema, MAX_ACTIVE_ALERTS } from "./schema";

// GET — the signed-in user's alerts (newest first).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const alerts = await prisma.priceAlert.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
}

// POST — create an alert (fixed price or following a drawn line).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const limit = await rateLimit(`terminal-alerts:${userId}`, 60, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const v = parsed.data;

  const active = await prisma.priceAlert.count({ where: { userId, status: { in: ["active", "paused"] } } });
  if (active >= MAX_ACTIVE_ALERTS) return NextResponse.json({ error: "Alert limit reached" }, { status: 409 });

  const isLine = v.kind === "line";
  const alert = await prisma.priceAlert.create({
    data: {
      userId,
      source: v.source,
      ticker: v.ticker,
      dataTicker: v.dataTicker,
      name: v.name,
      kind: v.kind,
      condition: v.condition,
      price: isLine ? null : v.price,
      // a horizontal line has one anchor: keep the second equal so the evaluator needs no special case
      line: isLine && v.line ? { ...v.line, p2: v.line.tool === "hline" ? v.line.p1 : v.line.p2 } : undefined,
      message: v.message || null,
      repeat: v.repeat,
      expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
    },
  });
  return NextResponse.json({ alert }, { status: 201 });
}
