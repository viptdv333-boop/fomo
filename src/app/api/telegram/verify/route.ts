import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatId, sendTelegramMessage } from "@/lib/telegram";

// POST — user has (they were told) already opened their bot in Telegram and
// sent it any message. We look that message up via getUpdates to learn the
// chat id, then send a confirmation so success is visible without a reload.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.telegramAccount.findUnique({ where: { userId: session.user.id } });
  if (!account) return NextResponse.json({ error: "Сначала подключите бота" }, { status: 400 });

  const resolved = await resolveChatId(account.botToken);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  await prisma.telegramAccount.update({
    where: { userId: session.user.id },
    data: { chatId: resolved.chatId, verifiedAt: new Date(), lastError: null },
  });

  await sendTelegramMessage(
    account.botToken,
    resolved.chatId,
    "✅ Бот подключён к FOMO. Сюда будут приходить сообщения из каналов, на которые вы включите пересылку."
  );

  return NextResponse.json({ ok: true });
}
