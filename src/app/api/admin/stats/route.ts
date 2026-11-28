import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 1);

  const [
    totalUsers,
    pendingUsers,
    approvedUsers,
    bannedUsers,
    totalIdeas,
    ideasThisWeek,
    purchaseRevenue,
    subscriptionRevenue,
    userHistory, ideaHistory, purchases, payments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "APPROVED" } }),
    prisma.user.count({ where: { status: "BANNED" } }),
    prisma.idea.count(),
    prisma.idea.count({ where: { createdAt: { gte: oneWeekAgo } } }),
    prisma.purchase.aggregate({ _sum: { amount: true } }),
    // Confirmed subscription payments (not Subscription.monthlyPrice: those rows are renewed in place and
    // removed once they have been expired for a while, so the sum of them is not an income figure).
    prisma.paymentRequest.aggregate({
      where: { status: "CONFIRMED", subscriptionType: { in: ["monthly", "tariff"] } },
      _sum: { amount: true },
    }),
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.idea.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.purchase.findMany({ where: { status: "completed", createdAt: { gte: since } }, select: { createdAt: true, amount: true } }),
    prisma.paymentRequest.findMany({ where: { status: "CONFIRMED", subscriptionType: { in: ["monthly", "tariff"] }, updatedAt: { gte: since } }, select: { updatedAt: true, amount: true } }),
  ]);

  const history: Record<string, { users: number; ideas: number; money: number }> = {};
  function day(date: Date) { const key = date.toISOString().slice(0, 10); return history[key] ??= { users: 0, ideas: 0, money: 0 }; }
  userHistory.forEach((x) => day(x.createdAt).users++);
  ideaHistory.forEach((x) => day(x.createdAt).ideas++);
  purchases.forEach((x) => { day(x.createdAt).money += Number(x.amount); });
  payments.forEach((x) => { day(x.updatedAt).money += Number(x.amount); });

  const totalRevenue =
    Number(purchaseRevenue._sum.amount ?? 0) +
    Number(subscriptionRevenue._sum.amount ?? 0);

  return NextResponse.json({
    totalUsers,
    pendingUsers,
    approvedUsers,
    bannedUsers,
    totalIdeas,
    ideasThisWeek,
    totalRevenue,
    history,
  });
}
