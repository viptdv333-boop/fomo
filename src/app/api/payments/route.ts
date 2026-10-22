import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { findActiveSubscription } from "@/lib/subscriptions";
import { isLifetimeEnd, tooFarAhead } from "@/lib/subscription-renew";
import { rateLimit } from "@/lib/rate-limit";
import { getT } from "@/lib/i18n/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const userId = session.user.id!;
  const { t } = await getT();

  // Payment requests create notifications for the author - cap how many one account can open.
  const payLimit = await rateLimit(`pay:${userId}`, 30, 10 * 60 * 1000);
  if (!payLimit.allowed) {
    return NextResponse.json({ error: t("notif.err.tooManyPayments") }, { status: 429 });
  }

  // Purchase a single idea via bank transfer
  if (body.ideaId && body.type !== "subscription") {
    const idea = await prisma.idea.findUnique({
      where: { id: body.ideaId },
      include: { author: { select: { id: true, paymentCard: true, sbpQrUrl: true, displayName: true } } },
    });
    if (!idea || !idea.isPaid || !idea.price) {
      return NextResponse.json({ error: t("notif.err.ideaNotPaid") }, { status: 400 });
    }

    // Check if already purchased
    const existingPurchase = await prisma.purchase.findUnique({
      where: { userId_ideaId: { userId, ideaId: idea.id } },
    });
    if (existingPurchase) {
      return NextResponse.json({ error: t("notif.err.alreadyPurchased") }, { status: 400 });
    }

    // Check existing pending payment request
    const existingRequest = await prisma.paymentRequest.findFirst({
      where: { buyerId: userId, ideaId: idea.id, status: "PENDING" },
    });
    if (existingRequest) {
      return NextResponse.json({
        paymentRequest: existingRequest,
        sellerCard: idea.author.paymentCard,
        sellerQrUrl: idea.author.sbpQrUrl,
        sellerName: idea.author.displayName,
      });
    }

    // Create payment request
    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        buyerId: userId,
        sellerId: idea.authorId,
        ideaId: idea.id,
        amount: idea.price,
        subscriptionType: null,
      },
    });

    // Notify seller about incoming payment
    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await createNotification({
      userId: idea.authorId,
      type: "payment",
      title: { key: "notif.payment.wantsIdea.title", vars: { name: buyer?.displayName || { key: "notif.fallback.buyer" } } },
      body: `${idea.title} — ${idea.price} ₽`,
      link: `/profile?tab=finance`,
    });

    return NextResponse.json({
      paymentRequest,
      sellerCard: idea.author.paymentCard,
      sellerQrUrl: idea.author.sbpQrUrl,
      sellerName: idea.author.displayName,
    });
  }

  // Subscribe via tariff (card payment)
  if (body.sellerId && body.subscriptionType === "tariff" && body.tariffId) {
    const tariff = await prisma.subscriptionTariff.findUnique({
      where: { id: body.tariffId },
      include: {
        author: { select: { id: true, displayName: true, paymentCard: true, sbpQrUrl: true } },
        parent: { select: { name: true, isActive: true, archivedAt: true } },
      },
    });

    // A plan is paid on its own row (own price / period / payment methods); a closed (archived) channel sells nothing.
    if (!tariff || !tariff.isActive || tariff.archivedAt || (tariff.parent && (!tariff.parent.isActive || tariff.parent.archivedAt))) {
      return NextResponse.json({ error: t("notif.err.tariffNotFound") }, { status: 400 });
    }

    if (tariff.authorId === userId) {
      return NextResponse.json({ error: t("notif.err.selfSubscribe") }, { status: 400 });
    }

    // Продление заранее: у активного подписчика платёж ПРОДЛЕВАЕТ срок от текущей даты окончания
    // (extendSubscription), поэтому активная подписка больше не запрещает платёж. Закрыто только для
    // «бессрочной» (нечего продлевать) и для оплаты слишком далеко вперёд. Плательщик — всегда сессия,
    // канал и цена — из тарифа в БД, даты с клиента не принимаются.
    if (body.sellerId && body.sellerId !== tariff.authorId) {
      return NextResponse.json({ error: t("notif.err.badRequest") }, { status: 400 });
    }
    const existing = await findActiveSubscription(userId, tariff.authorId, tariff.id);
    if (existing) {
      if (isLifetimeEnd(existing.endDate)) {
        return NextResponse.json({ error: t("notif.err.subscriptionActive") }, { status: 400 });
      }
      if (tooFarAhead(existing, tariff.durationDays)) {
        return NextResponse.json({ error: t("notif.err.subscriptionTooFar") }, { status: 400 });
      }
    }

    // Check existing pending payment request
    const existingRequest = await prisma.paymentRequest.findFirst({
      where: { buyerId: userId, sellerId: tariff.authorId, tariffId: tariff.id, status: "PENDING" },
    });
    if (existingRequest) {
      return NextResponse.json({
        paymentRequest: existingRequest,
        sellerCard: tariff.cardNumber || tariff.author.paymentCard,
        sellerQrUrl: tariff.sbpQrUrl || tariff.author.sbpQrUrl,
        sellerName: tariff.author.displayName,
      });
    }

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        buyerId: userId,
        sellerId: tariff.authorId,
        amount: tariff.price,
        subscriptionType: "tariff",
        tariffId: tariff.id,
        receiptUrl: body.receiptUrl || null,
      },
    });

    // Notify seller
    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await createNotification({
      userId: tariff.authorId,
      type: "payment",
      title: { key: "notif.payment.subscriptionRequest.title", vars: { name: buyer?.displayName || { key: "notif.fallback.buyer" } } },
      body: `${tariff.parent ? `${tariff.parent.name}: ${tariff.name}` : tariff.name} — ${Number(tariff.price)} ₽`,
      link: `/profile?tab=finance`,
    });

    return NextResponse.json({
      paymentRequest,
      sellerCard: tariff.cardNumber || tariff.author.paymentCard,
      sellerQrUrl: tariff.sbpQrUrl || tariff.author.sbpQrUrl,
      sellerName: tariff.author.displayName,
    });
  }

  // Subscribe to author via bank transfer (legacy monthly)
  if (body.authorId && body.type === "subscription") {
    const author = await prisma.user.findUnique({
      where: { id: body.authorId },
      select: { id: true, subscriptionPrice: true, paymentCard: true, sbpQrUrl: true, displayName: true },
    });
    if (!author || !author.subscriptionPrice) {
      return NextResponse.json({ error: t("notif.err.authorNoSubscription") }, { status: 400 });
    }

    if (author.id === userId) {
      return NextResponse.json({ error: t("notif.err.selfSubscribe") }, { status: 400 });
    }

    // Check existing active subscription — старая подписка на автора без тарифа
    const existing = await findActiveSubscription(userId, author.id, null);
    if (existing) {
      return NextResponse.json({ error: t("notif.err.subscriptionActive") }, { status: 400 });
    }

    // Check existing pending payment request
    const existingRequest = await prisma.paymentRequest.findFirst({
      where: { buyerId: userId, sellerId: author.id, subscriptionType: "monthly", status: "PENDING" },
    });
    if (existingRequest) {
      return NextResponse.json({
        paymentRequest: existingRequest,
        sellerCard: author.paymentCard,
        sellerQrUrl: author.sbpQrUrl,
        sellerName: author.displayName,
      });
    }

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        buyerId: userId,
        sellerId: author.id,
        amount: author.subscriptionPrice,
        subscriptionType: "monthly",
      },
    });

    return NextResponse.json({
      paymentRequest,
      sellerCard: author.paymentCard,
      sellerQrUrl: author.sbpQrUrl,
      sellerName: author.displayName,
    });
  }

  return NextResponse.json({ error: t("notif.err.badRequest") }, { status: 400 });
}

// GET: List user's payment requests (as buyer or seller)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id!;
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role") || "all"; // "buyer", "seller", "all"

  const where: any = {};
  if (role === "buyer") where.buyerId = userId;
  else if (role === "seller") where.sellerId = userId;
  else where.OR = [{ buyerId: userId }, { sellerId: userId }];

  const requests = await prisma.paymentRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      buyer: { select: { id: true, displayName: true, avatarUrl: true } },
      seller: { select: { id: true, displayName: true, avatarUrl: true } },
      idea: { select: { id: true, title: true } },
    },
  });

  // A subscription payment may be for a PLAN of a channel (tariff-plans.ts): channelId is the channel it belongs to.
  const planRows = await prisma.subscriptionTariff.findMany({
    where: { id: { in: [...new Set(requests.map((r) => r.tariffId).filter((x): x is string => !!x))] } },
    select: { id: true, parentId: true },
  });
  const channelOf = new Map(planRows.map((p) => [p.id, p.parentId ?? p.id]));
  return NextResponse.json(requests.map((r) => (r.tariffId ? { ...r, channelId: channelOf.get(r.tariffId) ?? r.tariffId } : r)));
}
