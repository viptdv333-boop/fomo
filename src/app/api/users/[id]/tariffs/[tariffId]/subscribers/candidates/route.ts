import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — owner picks a site user to add to the channel for free. Lists approved
// users (optionally filtered by ?q= name / fomo id), leaving out the owner and
// anyone who already has an active subscription to this channel.
export async function GET(
  request: NextRequest,
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

  const q = (request.nextUrl.searchParams.get("q") || "").trim();

  const activeSubs = await prisma.subscription.findMany({
    where: { tariffId, status: "active", endDate: { gt: new Date() } },
    select: { subscriberId: true },
  });
  const excluded = [id, ...activeSubs.map((s) => s.subscriberId)];

  const users = await prisma.user.findMany({
    where: {
      status: "APPROVED",
      id: { notIn: excluded },
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { fomoId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, displayName: true, fomoId: true, avatarUrl: true },
    orderBy: { displayName: "asc" },
    take: 100,
  });

  return NextResponse.json(users);
}
