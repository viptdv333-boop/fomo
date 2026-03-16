import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [
    totalUsers,
    pendingUsers,
    approvedUsers,
    bannedUsers,
    totalIdeas,
    ideasThisWeek,
    purchaseRevenue,
    subscriptionRevenue,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "APPROVED" } }),
    prisma.user.count({ where: { status: "BANNED" } }),
    prisma.idea.count(),
    prisma.idea.count({ where: { createdAt: { gte: oneWeekAgo } } }),
    prisma.purchase.aggregate({ _sum: { amount: true } }),
    prisma.subscription.aggregate({ _sum: { monthlyPrice: true } }),
  ]);

  const totalRevenue =
    Number(purchaseRevenue._sum.amount ?? 0) +
    Number(subscriptionRevenue._sum.monthlyPrice ?? 0);

  return NextResponse.json({
    totalUsers,
    pendingUsers,
    approvedUsers,
    bannedUsers,
    totalIdeas,
    ideasThisWeek,
    totalRevenue,
  });
}
