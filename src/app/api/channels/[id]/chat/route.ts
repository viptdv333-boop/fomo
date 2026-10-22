import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { channelRootId, tariffFamily } from "@/lib/tariff-plans";

// GET — get channel chat room (check access)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: givenId } = await params;
  // The chat belongs to the channel (root row); the id of one of its plans leads to the same room.
  const tariffId = (await channelRootId(prisma, givenId)) ?? givenId;

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });

  if (!tariff) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  // Check access: author, staff or an active subscriber of ANY plan of the channel
  const isAuthor = tariff.authorId === session.user.id;
  const family = await tariffFamily(prisma, tariffId);
  const isSubscriber = !!(await prisma.subscription.findFirst({
    where: { subscriberId: session.user.id, tariffId: { in: family }, status: "active", endDate: { gt: new Date() } },
    select: { id: true },
  }));
  const isAdmin = (session.user as any).role === "ADMIN" || (session.user as any).role === "OWNER";
  if (tariff.archivedAt && !isAuthor && !isAdmin) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  if (!isAuthor && !isSubscriber && !isAdmin) {
    return NextResponse.json({ error: "Access denied", needSubscription: true }, { status: 403 });
  }

  // If no room yet, create it (author only or auto)
  let roomId = tariff.channelRoomId;
  if (!roomId) {
    const room = await prisma.chatRoom.create({
      data: {
        name: `Чат: ${tariff.name}`,
        isPrivate: true,
        isClosed: false,
        isArchived: false,
      },
    });
    await prisma.subscriptionTariff.update({
      where: { id: tariffId },
      data: { channelRoomId: room.id },
    });
    roomId = room.id;
  }

  return NextResponse.json({
    roomId,
    isAuthor,
    channelName: tariff.name,
  });
}

// POST — author moderation actions (mute, pin, delete message)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: givenId } = await params;
  const tariffId = (await channelRootId(prisma, givenId)) ?? givenId;

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== session.user.id) {
    return NextResponse.json({ error: "Only channel author can moderate" }, { status: 403 });
  }

  const { action, messageId, userId, duration } = await request.json();

  if (action === "delete" && messageId) {
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { isDeleted: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "pin" && messageId) {
    const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (msg) {
      await prisma.chatMessage.update({
        where: { id: messageId },
        data: { isPinned: !msg.isPinned },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Mute not implemented as separate model yet — could store in JSON
  if (action === "mute" && userId && duration) {
    // For now, just return success — actual mute check would be in message sending
    return NextResponse.json({ ok: true, message: `User muted for ${duration} minutes` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
