import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const userId = session.user.id!;

  // Purchase a single idea via bank transfer
  if (body.ideaId && body.type !== "subscription") {
    const idea = await prisma.idea.findUnique({
      where: { id: body.ideaId },
      include: { author: { select: { id: true, paymentCard: true, displayName: true } } },
    });
    if (!idea || !idea.isPaid || !idea.price) {
      return NextResponse.json({ error: "Идея не найдена или бесплатная" }, { status: 400 });
    }

    // Check if already purchased
    const existingPurchase = await prisma.purchase.findUnique({
      where: { userId_ideaId: { userId, ideaId: idea.id } },
    });
    if (existingPurchase) {
      return NextResponse.json({ error: "Уже куплена" }, { status: 400 });
    }

    // Check existing pending payment request
    const existingRequest = await prisma.paymentRequest.findFirst({
      where: { buyerId: userId, ideaId: idea.id, status: "PENDING" },
    });
    if (existingRequest) {
      return NextResponse.json({
        paymentRequest: existingRequest,
        sellerCard: idea.author.paymentCard,
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
      title: `${buyer?.displayName || "Покупатель"} хочет купить идею`,
      body: `${idea.title} — ${idea.price} ₽`,
      link: `/profile/${idea.authorId}`,
    });

    return NextResponse.json({
      paymentRequest,
      sellerCard: idea.author.paymentCard,
      sellerName: idea.author.displayName,
    });
  }

  // Subscribe to author via bank transfer
  if (body.authorId && body.type === "subscription") {
    const author = await prisma.user.findUnique({
      where: { id: body.authorId },
      select: { id: true, subscriptionPrice: true, paymentCard: true, displayName: true },
    });
    if (!author || !author.subscriptionPrice) {
      return NextResponse.json({ error: "Автор не найден или подписка не настроена" }, { status: 400 });
    }

    if (author.id === userId) {
      return NextResponse.json({ error: "Нельзя подписаться на себя" }, { status: 400 });
    }

    // Check existing active subscription
    const existing = await prisma.subscription.findUnique({
      where: { subscriberId_authorId: { subscriberId: userId, authorId: author.id } },
    });
    if (existing && existing.status === "active" && existing.endDate > new Date()) {
      return NextResponse.json({ error: "Подписка уже активна" }, { status: 400 });
    }

    // Check existing pending payment request
    const existingRequest = await prisma.paymentRequest.findFirst({
      where: { buyerId: userId, sellerId: author.id, subscriptionType: "monthly", status: "PENDING" },
    });
    if (existingRequest) {
      return NextResponse.json({
        paymentRequest: existingRequest,
        sellerCard: author.paymentCard,
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
      sellerName: author.displayName,
    });
  }

  return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
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

  return NextResponse.json(requests);
}
