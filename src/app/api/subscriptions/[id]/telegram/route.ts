import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — toggle Telegram forwarding for one of the current user's own
// channel subscriptions. Requires a verified bot (chatId resolved) — turning
// this on with no working bot would just be a toggle that silently does nothing.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { enabled } = await request.json().catch(() => ({}));
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findUnique({ where: { id } });
  if (!subscription || subscription.subscriberId !== session.user.id) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  if (enabled) {
    const account = await prisma.telegramAccount.findUnique({ where: { userId: session.user.id } });
    if (!account?.chatId) {
      return NextResponse.json({ error: "Сначала подключите и подтвердите бота в профиле" }, { status: 400 });
    }
  }

  await prisma.subscription.update({ where: { id }, data: { telegramNotify: enabled } });
  return NextResponse.json({ ok: true, enabled });
}
