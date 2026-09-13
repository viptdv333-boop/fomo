import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOT_AUTHOR_ID, checkBotToken } from "@/lib/bot-auth";

// Каналы автора бота — для настройки публикации в терминале (13.09.2026):
// терминал показывает этот список, Босс привязывает к каналу тикеры прогнозов и
// сигналов. Только чтение, только каналы бота-автора.
export async function GET(request: NextRequest) {
  if (!checkBotToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tariffs = await prisma.subscriptionTariff.findMany({
    where: { authorId: BOT_AUTHOR_ID },
    select: {
      id: true,
      name: true,
      isActive: true,
      price: true,
      durationDays: true,
      _count: { select: { subscriptions: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    tariffs.map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.isActive,
      price: Number(t.price),
      durationDays: t.durationDays,
      subscribersCount: t._count.subscriptions,
      url: `/channels/${t.id}`,
    }))
  );
}
