import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { familyOfTariff } from "@/lib/tariff-plans";

// GET — owner picks a site user to add to the channel for free. Lists approved
// users (optionally filtered by ?q= name / fomo id), leaving out the owner and
// anyone who already has an active subscription to this channel. A «#» / «@» in front of the query is ignored.
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

  // «#fomo_user123» is how an id is shown in the list: the sign is not part of it (nor «@» of a nickname)
  const q = (request.nextUrl.searchParams.get("q") || "").trim().replace(/^[#@]+/, "").trim();

  const activeSubs = await prisma.subscription.findMany({
    where: { tariffId: { in: await familyOfTariff(prisma, tariffId) }, status: "active", endDate: { gt: new Date() } },
    select: { subscriberId: true },
  });
  const excluded = [id, ...activeSubs.map((s) => s.subscriberId)];

  // pages of PAGE users, the next one by ?cursor= (the last id of the previous page): the list has no upper limit, the picker loads on scroll
  const PAGE = 100;
  const cursor = request.nextUrl.searchParams.get("cursor");
  const rows = await prisma.user.findMany({
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
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take: PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const more = rows.length > PAGE;
  const users = more ? rows.slice(0, PAGE) : rows;

  return NextResponse.json({ users, next: more ? users[users.length - 1].id : null });
}
