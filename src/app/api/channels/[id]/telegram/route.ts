import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — channel owner toggles forwarding of their own channel's setups/chat
// messages to their own Telegram bot. Separate from Subscription.telegramNotify
// since the owner has no Subscription row for their own channel.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tariffId } = await params;
  const { enabled } = await request.json().catch(() => ({}));
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId }, select: { authorId: true } });
  if (!tariff || tariff.authorId !== session.user.id) {
    return NextResponse.json({ error: "Only the channel owner can change this" }, { status: 403 });
  }

  if (enabled) {
    const account = await prisma.telegramAccount.findUnique({ where: { userId: session.user.id } });
    if (!account?.chatId) {
      return NextResponse.json({ error: "Сначала подключите и подтвердите бота в профиле" }, { status: 400 });
    }
  }

  await prisma.subscriptionTariff.update({ where: { id: tariffId }, data: { authorTelegramNotify: enabled } });
  return NextResponse.json({ ok: true, enabled });
}
