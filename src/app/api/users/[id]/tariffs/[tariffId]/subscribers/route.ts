import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { tariffId },
    include: {
      subscriber: {
        select: { id: true, displayName: true, avatarUrl: true, fomoId: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  const now = new Date();

  return NextResponse.json(
    subscriptions.map((s) => ({
      id: s.id,
      subscriberId: s.subscriber.id,
      displayName: s.subscriber.displayName,
      avatarUrl: s.subscriber.avatarUrl,
      fomoId: s.subscriber.fomoId,
      monthlyPrice: Number(s.monthlyPrice),
      status: s.status,
      isActive: s.status === "active" && s.endDate > now,
      startDate: s.startDate,
      endDate: s.endDate,
    }))
  );
}
