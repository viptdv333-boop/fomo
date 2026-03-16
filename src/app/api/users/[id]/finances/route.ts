import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (session.user.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Earnings from confirmed payments as seller
  const earningsResult = await prisma.paymentRequest.aggregate({
    where: { sellerId: id, status: "CONFIRMED" },
    _sum: { amount: true },
    _count: true,
  });

  // Earnings this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const earningsThisMonth = await prisma.paymentRequest.aggregate({
    where: {
      sellerId: id,
      status: "CONFIRMED",
      createdAt: { gte: monthStart },
    },
    _sum: { amount: true },
  });

  // Active subscribers count
  const activeSubscribers = await prisma.subscription.count({
    where: {
      authorId: id,
      status: "active",
      endDate: { gt: new Date() },
    },
  });

  // Active tariffs
  const tariffs = await prisma.subscriptionTariff.findMany({
    where: { authorId: id, isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      durationDays: true,
      _count: { select: { subscriptions: true } },
    },
  });

  // Idea purchases (sold)
  const ideaSales = await prisma.purchase.aggregate({
    where: { idea: { authorId: id } },
    _sum: { amount: true },
    _count: true,
  });

  // My spending (as buyer)
  const mySpending = await prisma.paymentRequest.aggregate({
    where: { buyerId: id, status: "CONFIRMED" },
    _sum: { amount: true },
    _count: true,
  });

  // My active subscriptions (as subscriber)
  const mySubscriptions = await prisma.subscription.findMany({
    where: {
      subscriberId: id,
      status: "active",
      endDate: { gt: new Date() },
    },
    include: {
      author: { select: { id: true, displayName: true } },
      tariff: { select: { name: true } },
    },
    orderBy: { endDate: "asc" },
  });

  // My purchases (as buyer)
  const purchases = await prisma.paymentRequest.findMany({
    where: { buyerId: id },
    include: {
      seller: { select: { id: true, displayName: true } },
      idea: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // My sales (as seller)
  const sales = await prisma.paymentRequest.findMany({
    where: { sellerId: id },
    include: {
      buyer: { select: { id: true, displayName: true } },
      idea: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    earnings: {
      total: Number(earningsResult._sum.amount || 0),
      thisMonth: Number(earningsThisMonth._sum.amount || 0),
      transactionCount: earningsResult._count,
    },
    subscribers: {
      active: activeSubscribers,
    },
    tariffs: tariffs.map((t) => ({
      id: t.id,
      name: t.name,
      price: Number(t.price),
      durationDays: t.durationDays,
      subscriberCount: t._count.subscriptions,
    })),
    ideaSales: {
      total: Number(ideaSales._sum.amount || 0),
      count: ideaSales._count,
    },
    spending: {
      total: Number(mySpending._sum.amount || 0),
      count: mySpending._count,
    },
    mySubscriptions: mySubscriptions.map((s) => ({
      id: s.id,
      authorId: s.author.id,
      authorName: s.author.displayName,
      tariffName: s.tariff?.name || "Стандарт",
      endDate: s.endDate,
      monthlyPrice: Number(s.monthlyPrice),
    })),
    purchases: purchases.map((p) => ({
      id: p.id,
      sellerId: p.seller.id,
      sellerName: p.seller.displayName,
      ideaId: p.idea?.id || null,
      ideaTitle: p.idea?.title || null,
      subscriptionType: p.subscriptionType,
      amount: Number(p.amount),
      receiptUrl: p.receiptUrl,
      status: p.status,
      createdAt: p.createdAt,
    })),
    sales: sales.map((s) => ({
      id: s.id,
      buyerId: s.buyer.id,
      buyerName: s.buyer.displayName,
      ideaId: s.idea?.id || null,
      ideaTitle: s.idea?.title || null,
      subscriptionType: s.subscriptionType,
      amount: Number(s.amount),
      receiptUrl: s.receiptUrl,
      status: s.status,
      createdAt: s.createdAt,
    })),
  });
}
