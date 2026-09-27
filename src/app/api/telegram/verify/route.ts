import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveChatId, sendTelegramMessage } from "@/lib/telegram";
import { getT } from "@/lib/i18n/server";

// POST — user has (they were told) already opened their bot in Telegram and
// sent it any message. We look that message up via getUpdates to learn the
// chat id, then send a confirmation so success is visible without a reload.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The requester is also the recipient of the confirmation below.
  const { locale, t } = await getT();

  const account = await prisma.telegramAccount.findUnique({ where: { userId: session.user.id } });
  if (!account) return NextResponse.json({ error: t("notif.err.tgConnectFirst") }, { status: 400 });

  const resolved = await resolveChatId(account.botToken, locale);
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
    t("notif.tg.verified"),
    locale
  );

  return NextResponse.json({ ok: true });
}
