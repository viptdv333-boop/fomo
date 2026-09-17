import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyBotToken } from "@/lib/telegram";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.telegramAccount.findUnique({
    where: { userId: session.user.id },
    select: { botUsername: true, chatId: true, verifiedAt: true, lastError: true },
  });

  return NextResponse.json({
    connected: Boolean(account),
    verified: Boolean(account?.chatId),
    botUsername: account?.botUsername ?? null,
    lastError: account?.lastError ?? null,
  });
}

// POST — save/replace the user's own bot token. Validated against Telegram
// (getMe) before storing so a typo never silently sits there un-deliverable.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { botToken } = await req.json().catch(() => ({}));
  if (!botToken || typeof botToken !== "string") {
    return NextResponse.json({ error: "botToken required" }, { status: 400 });
  }

  const check = await verifyBotToken(botToken.trim());
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  await prisma.telegramAccount.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, botToken: botToken.trim(), botUsername: check.username },
    // Replacing the token invalidates any previously-resolved chat — the new
    // bot has never been messaged by anyone yet, so re-verification is required.
    update: { botToken: botToken.trim(), botUsername: check.username, chatId: null, verifiedAt: null, lastError: null },
  });

  return NextResponse.json({ ok: true, botUsername: check.username });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.telegramAccount.delete({ where: { userId: session.user.id } }).catch(() => {});
  // A bot that no longer exists can't receive forwarded messages — turn off
  // every subscription's toggle so it doesn't just silently stop working.
  await prisma.subscription.updateMany({
    where: { subscriberId: session.user.id, telegramNotify: true },
    data: { telegramNotify: false },
  });

  return NextResponse.json({ ok: true });
}
