import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { parseChannelParam, requireUserId, unauthorized } from "@/lib/notify-api";

type Ctx = { params: Promise<{ channel: string }> };

// PATCH — switch a connected channel on/off without disconnecting it.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { t } = await getT();
  const channel = parseChannelParam((await params).channel);
  if (!channel) return NextResponse.json({ error: t("ns.err.invalid") }, { status: 404 });

  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t("ns.err.invalid") }, { status: 400 });

  const r = await prisma.notificationChannel.updateMany({
    where: { userId, channel, verified: true },
    // Turning it back on clears the failure streak that may have switched it off.
    data: parsed.data.enabled ? { enabled: true, failCount: 0, lastError: null } : { enabled: false },
  });
  if (r.count === 0) return NextResponse.json({ error: t("ns.err.notConnected") }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE — disconnect (forget the address / token / webhook secret).
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const channel = parseChannelParam((await params).channel);
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.notificationChannel.deleteMany({ where: { userId, channel } });
  return NextResponse.json({ ok: true });
}
