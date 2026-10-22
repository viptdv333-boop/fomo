import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { hasTelegramTarget } from "@/lib/telegram-target";
import { channelRootId } from "@/lib/tariff-plans";

// PATCH — channel owner toggles forwarding of their own channel's setups/chat
// messages to their own Telegram bot. Separate from Subscription.telegramNotify
// since the owner has no Subscription row for their own channel.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: givenId } = await params;
  // The owner's switch lives on the channel row, also when the id of one of its plans is given.
  const tariffId = (await channelRootId(prisma, givenId)) ?? givenId;
  const { enabled } = await request.json().catch(() => ({}));
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId }, select: { authorId: true } });
  if (!tariff || tariff.authorId !== session.user.id) {
    return NextResponse.json({ error: "Only the channel owner can change this" }, { status: 403 });
  }

  if (enabled) {
    // The old TelegramAccount OR the bot connected in «Настройки уведомлений → Telegram» (see telegram-target.ts).
    if (!(await hasTelegramTarget(prisma, session.user.id))) {
      return NextResponse.json({ error: (await getT()).t("api.telegramBotRequired") }, { status: 400 });
    }
  }

  await prisma.subscriptionTariff.update({ where: { id: tariffId }, data: { authorTelegramNotify: enabled } });
  return NextResponse.json({ ok: true, enabled });
}
