import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createYukassaPayment } from "@/lib/yukassa";
import { findActiveSubscription } from "@/lib/subscriptions";
import { randomUUID } from "crypto";
import { getT } from "@/lib/i18n/server";

/**
 * POST /api/yukassa/create
 * Creates a YuKassa payment for a tariff subscription.
 * Body: { tariffId: string, sellerId: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id!;
  const { t } = await getT();
  const body = await req.json();
  const { tariffId, sellerId } = body;

  if (!tariffId || !sellerId) {
    return NextResponse.json({ error: "tariffId and sellerId required" }, { status: 400 });
  }

  if (userId === sellerId) {
    return NextResponse.json({ error: t("api.selfSubscribe") }, { status: 400 });
  }

  // Get tariff with YuKassa credentials
  const tariff = await prisma.subscriptionTariff.findUnique({
    where: { id: tariffId },
  });

  if (!tariff || !tariff.isActive) {
    return NextResponse.json({ error: t("api.tariffNotFound") }, { status: 404 });
  }

  if (tariff.authorId !== sellerId) {
    return NextResponse.json({ error: t("api.tariffNotOwned") }, { status: 400 });
  }

  if (!tariff.paymentMethods.includes("yukassa") || !tariff.yukassaShopId || !tariff.yukassaSecret) {
    return NextResponse.json({ error: t("api.yukassaNotConfigured") }, { status: 400 });
  }

  // Check existing active subscription — на ЭТОТ канал (13.09.2026)
  const existing = await findActiveSubscription(userId, sellerId, tariff.id);
  if (existing) {
    return NextResponse.json({ error: t("api.subscriptionActive") }, { status: 400 });
  }

  // Create a PaymentRequest record for tracking
  const paymentRequest = await prisma.paymentRequest.create({
    data: {
      buyerId: userId,
      sellerId,
      amount: tariff.price,
      subscriptionType: "tariff",
      tariffId: tariff.id,
    },
  });

  // Create YuKassa payment
  try {
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { displayName: true },
    });

    const payment = await createYukassaPayment({
      shopId: tariff.yukassaShopId,
      secretKey: tariff.yukassaSecret,
      amount: Number(tariff.price),
      description: t("api.yukassaDescription", { tariff: tariff.name, author: seller?.displayName || t("api.authorFallback") }),
      returnUrl: `${process.env.NEXTAUTH_URL || "https://fomo.spot"}/subscriptions?payment=success`,
      metadata: {
        paymentRequestId: paymentRequest.id,
        tariffId: tariff.id,
        buyerId: userId,
        sellerId,
      },
      idempotenceKey: randomUUID(),
    });

    // Store YuKassa payment ID in receipt URL field for tracking
    await prisma.paymentRequest.update({
      where: { id: paymentRequest.id },
      data: { receiptUrl: `yukassa:${payment.id}` },
    });

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      return NextResponse.json({ error: t("api.paymentLinkFailed") }, { status: 500 });
    }

    return NextResponse.json({
      paymentUrl: confirmationUrl,
      paymentId: payment.id,
      paymentRequestId: paymentRequest.id,
    });
  } catch (err: any) {
    console.error("[yukassa/create] Error:", err);
    // Clean up the payment request on failure
    await prisma.paymentRequest.delete({ where: { id: paymentRequest.id } });
    return NextResponse.json({ error: t("api.yukassaCreateFailed") }, { status: 500 });
  }
}
