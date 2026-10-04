import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { limited, parseChannelParam, requireUserId, unauthorized } from "@/lib/notify-api";
import { sendThroughChannel } from "@/lib/notify-dispatch";
import * as webpush from "@/lib/notify-channels/webpush";

type Ctx = { params: Promise<{ channel: string }> };

// POST — "send test notification" through one connected channel (or "webpush" for this account's devices).
export async function POST(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { locale, t } = await getT();
  const raw = (await params).channel;

  const blocked = await limited(`ntest:${userId}:${raw}`, 5, 60_000);
  if (blocked) return blocked;

  const msg = { title: t("ns.test.title"), body: t("ns.test.body"), link: "/profile?tab=notifications", locale };

  if (raw === "webpush") {
    const r = await webpush.send({ userId }, msg);
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.error === "no devices" ? t("ns.err.noDevices") : r.error }, { status: r.ok ? 200 : 502 });
  }

  const channel = parseChannelParam(raw);
  if (!channel) return NextResponse.json({ error: t("ns.err.invalid") }, { status: 404 });
  const row = await prisma.notificationChannel.findUnique({ where: { userId_channel: { userId, channel } } });
  if (!row || !row.verified || !row.address) return NextResponse.json({ error: t("ns.err.notConnected") }, { status: 400 });

  const r = await sendThroughChannel(
    { id: row.id, userId, channel, address: row.address, secret: row.secret, failCount: row.failCount, lastError: row.lastError, lastSentAt: row.lastSentAt },
    msg
  );
  return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.error ?? t("ns.err.sendFailed", { reason: "" }) }, { status: r.ok ? 200 : 502 });
}
