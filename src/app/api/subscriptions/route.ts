import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      subscriberId: session.user.id,
      status: "active",
      endDate: { gt: new Date() },
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true, rating: true },
      },
    },
    orderBy: { endDate: "asc" },
  });

  return NextResponse.json(subscriptions);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Subscription id required" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id },
  });

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  if (subscription.subscriberId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.subscription.update({
    where: { id },
    data: { status: "cancelled", endDate: new Date() },
  });

  return NextResponse.json({ success: true });
}
