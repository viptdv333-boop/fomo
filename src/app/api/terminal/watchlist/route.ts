import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const MAX_ITEMS = 200;

const itemSchema = z.object({
  source: z.enum(["moex", "bybit", "fmp"]),
  ticker: z.string().min(1).max(40),
  dataTicker: z.string().min(1).max(40),
  name: z.string().max(120).default(""),
});
const bodySchema = z.object({ items: z.array(itemSchema).max(MAX_ITEMS) });

// GET — the signed-in user's terminal watchlist, in their order.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.terminalWatchItem.findMany({
    where: { userId: session.user.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { source: true, ticker: true, dataTicker: true, name: true },
  });
  return NextResponse.json({ items: rows }, { headers: { "Cache-Control": "no-store" } });
}

// PUT — replace the whole list (the terminal sends its current list after every change).
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const limit = await rateLimit(`terminal-watch:${userId}`, 60, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const seen = new Set<string>();
  const items = parsed.data.items.filter((i) => {
    const key = `${i.source}:${i.dataTicker}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await prisma.$transaction([
    prisma.terminalWatchItem.deleteMany({ where: { userId } }),
    prisma.terminalWatchItem.createMany({
      data: items.map((i, idx) => ({ userId, source: i.source, ticker: i.ticker, dataTicker: i.dataTicker, name: i.name, sortOrder: idx })),
    }),
  ]);
  return NextResponse.json({ ok: true, count: items.length });
}
