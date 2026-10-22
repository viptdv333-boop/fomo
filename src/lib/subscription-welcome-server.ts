import { prisma } from "@/lib/prisma";
import type { PaidChannelInfo } from "@/lib/subscription-welcome";

/** Channel (tariff) the buyer just paid for; null on any problem -> callers keep the old texts and the /messages link. */
export async function loadPaidChannel(tariffId: string | null | undefined): Promise<PaidChannelInfo | null> {
  if (!tariffId) return null;
  try {
    // A payment may be for a PLAN of the channel: names, link and chat are those of the channel (plan's parent).
    const own = await prisma.subscriptionTariff.findUnique({
      where: { id: tariffId },
      select: { id: true, name: true, slug: true, channelRoomId: true, parentId: true },
    });
    const t =
      own?.parentId
        ? await prisma.subscriptionTariff.findUnique({ where: { id: own.parentId }, select: { id: true, name: true, slug: true, channelRoomId: true, parentId: true } })
        : own;
    if (!t || !t.name) return null;
    return { id: t.id, name: t.name, slug: t.slug, hasChat: !!t.channelRoomId };
  } catch (e) {
    console.error("[subscription-welcome] channel lookup failed:", e);
    return null;
  }
}
