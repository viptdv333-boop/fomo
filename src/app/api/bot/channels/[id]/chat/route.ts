import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { BOT_AUTHOR_ID, checkBotToken } from "@/lib/bot-auth";
import { notifyChannelTelegramSubscribers, escapeTelegramHtml } from "@/lib/telegram";

// Сервер-к-серверу пост торгового бота в чат канала (заявки/сделки), по
// аналогии с /api/bot/ideas — тот же токен, тот же фиксированный автор.
// В отличие от идей-сетапов, это одноразовые эксплуатационные сообщения
// (открыли/закрыли позицию и т.п.), поэтому идут прямо в существующий чат
// канала (ChatRoom за SubscriptionTariff.channelRoomId), а не в ленту идей.
const bodySchema = z.object({ text: z.string().min(1).max(2000) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkBotToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: channelId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const tariff = await prisma.subscriptionTariff.findUnique({
    where: { id: channelId },
    select: { id: true, authorId: true, isActive: true, channelRoomId: true, name: true },
  });
  if (!tariff || tariff.authorId !== BOT_AUTHOR_ID) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  if (!tariff.isActive) {
    return NextResponse.json({ error: "Channel is not active" }, { status: 400 });
  }

  let roomId = tariff.channelRoomId;
  if (!roomId) {
    const room = await prisma.chatRoom.create({
      data: { name: `Чат: ${tariff.name}`, isPrivate: true, isClosed: false, isArchived: false },
    });
    await prisma.subscriptionTariff.update({ where: { id: tariff.id }, data: { channelRoomId: room.id } });
    roomId = room.id;
  }

  const message = await prisma.chatMessage.create({
    data: { roomId, userId: BOT_AUTHOR_ID, text: parsed.data.text },
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  const globalForIO = globalThis as unknown as { io: any };
  globalForIO.io?.to(roomId).emit("new_message", message);

  await notifyChannelTelegramSubscribers(tariff.id, escapeTelegramHtml(parsed.data.text)).catch(() => {});

  return NextResponse.json({ ok: true, id: message.id }, { status: 201 });
}
