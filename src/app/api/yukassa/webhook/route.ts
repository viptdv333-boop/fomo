import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { grantSubscription } from "@/lib/subscriptions";
import { tFor } from "@/lib/i18n/server";
import { loadPaidChannel } from "@/lib/subscription-welcome-server";
import { subscriptionNotice, welcomeDmText } from "@/lib/subscription-welcome";

/**
 * POST /api/yukassa/webhook
 * YuKassa sends notifications here when payment status changes.
 * Configure this URL in YuKassa dashboard: https://fomo.spot/api/yukassa/webhook
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[yukassa/webhook] Received:", JSON.stringify(body, null, 2));

  const event = body.event;
  const payment = body.object;

  if (!payment || !payment.id) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // We handle payment.succeeded and payment.canceled
  if (event === "payment.succeeded") {
    await handlePaymentSucceeded(payment);
  } else if (event === "payment.canceled") {
    await handlePaymentCanceled(payment);
  }

  // Always return 200 to acknowledge receipt
  return NextResponse.json({ status: "ok" });
}

async function handlePaymentSucceeded(payment: any) {
  const paymentRequestId = payment.metadata?.paymentRequestId;
  if (!paymentRequestId) {
    console.error("[yukassa/webhook] No paymentRequestId in metadata");
    return;
  }

  const paymentRequest = await prisma.paymentRequest.findUnique({
    where: { id: paymentRequestId },
  });

  if (!paymentRequest) {
    console.error("[yukassa/webhook] PaymentRequest not found:", paymentRequestId);
    return;
  }

  if (paymentRequest.status !== "PENDING") {
    console.log("[yukassa/webhook] PaymentRequest already processed:", paymentRequestId);
    return;
  }

  // Mark as confirmed
  await prisma.paymentRequest.update({
    where: { id: paymentRequestId },
    data: { status: "CONFIRMED" },
  });

  // Create or update subscription
  const tariffId = payment.metadata?.tariffId || paymentRequest.tariffId;
  let durationDays = 30;

  if (tariffId) {
    const tariff = await prisma.subscriptionTariff.findUnique({
      where: { id: tariffId },
    });
    if (tariff) {
      durationDays = tariff.durationDays;
    }
  }

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + durationDays);

  // Подписка на канал (13.09.2026): своя запись на каждый канал автора.
  await grantSubscription({
    subscriberId: paymentRequest.buyerId,
    authorId: paymentRequest.sellerId,
    tariffId: tariffId || null,
    monthlyPrice: paymentRequest.amount,
    endDate,
    durationDays,
  });

  // Канал, на который оформлена подписка (для текстов и ссылки); null -> старое поведение.
  const paidChannel = await loadPaidChannel(tariffId);

  // Auto-DM: welcome message
  const seller = await prisma.user.findUnique({
    where: { id: paymentRequest.sellerId },
    select: { displayName: true },
  });

  const existingConv = await prisma.directConversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: paymentRequest.buyerId } } },
        { participants: { some: { userId: paymentRequest.sellerId } } },
      ],
    },
  });

  let conversationId: string;
  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const conv = await prisma.directConversation.create({
      data: {
        participants: {
          create: [
            { userId: paymentRequest.buyerId },
            { userId: paymentRequest.sellerId },
          ],
        },
      },
    });
    conversationId = conv.id;
  }

  // Auto-written on the seller's behalf — in the buyer's (reader's) language.
  const buyerLocale = await prisma.user.findUnique({
    where: { id: paymentRequest.buyerId },
    select: { locale: true },
  });
  await prisma.directMessage.create({
    data: {
      conversationId,
      senderId: paymentRequest.sellerId,
      text: welcomeDmText(tFor(buyerLocale?.locale), paidChannel, endDate, durationDays, "notif.dm.yukassaWelcome"),
    },
  });

  // Notify buyer
  await createNotification({
    userId: paymentRequest.buyerId,
    type: "subscription",
    ...subscriptionNotice(paidChannel, endDate, {
      sellerName: seller?.displayName,
      days: durationDays,
      amount: Number(paymentRequest.amount),
    }),
  });

  // Notify seller about income
  const buyer = await prisma.user.findUnique({
    where: { id: paymentRequest.buyerId },
    select: { displayName: true },
  });
  await createNotification({
    userId: paymentRequest.sellerId,
    type: "payment",
    title: { key: "notif.payment.yukassaNew.title" },
    body: {
      key: "notif.payment.buyerAmount",
      vars: { name: buyer?.displayName || { key: "notif.fallback.buyer" }, amount: Number(paymentRequest.amount) },
    },
  });

  console.log("[yukassa/webhook] Payment succeeded, subscription activated:", paymentRequestId);
}

async function handlePaymentCanceled(payment: any) {
  const paymentRequestId = payment.metadata?.paymentRequestId;
  if (!paymentRequestId) return;

  const paymentRequest = await prisma.paymentRequest.findUnique({
    where: { id: paymentRequestId },
  });

  if (!paymentRequest || paymentRequest.status !== "PENDING") return;

  await prisma.paymentRequest.update({
    where: { id: paymentRequestId },
    data: { status: "REJECTED" },
  });

  // Notify buyer
  await createNotification({
    userId: paymentRequest.buyerId,
    type: "payment",
    title: { key: "notif.payment.canceled.title" },
    body: { key: "notif.payment.yukassaCanceled.body", vars: { amount: Number(paymentRequest.amount) } },
    link: "/subscriptions",
  });

  console.log("[yukassa/webhook] Payment canceled:", paymentRequestId);
}
