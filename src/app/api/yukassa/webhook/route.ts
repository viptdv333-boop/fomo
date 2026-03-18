import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/yukassa/webhook
 * YuKassa sends notifications here when payment status changes.
 * Configure this URL in YuKassa dashboard: https://fomo.broker/api/yukassa/webhook
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

  await prisma.subscription.upsert({
    where: {
      subscriberId_authorId: {
        subscriberId: paymentRequest.buyerId,
        authorId: paymentRequest.sellerId,
      },
    },
    update: {
      status: "active",
      startDate: new Date(),
      endDate,
      monthlyPrice: paymentRequest.amount,
      tariffId: tariffId || null,
      durationDays,
    },
    create: {
      subscriberId: paymentRequest.buyerId,
      authorId: paymentRequest.sellerId,
      monthlyPrice: paymentRequest.amount,
      endDate,
      tariffId: tariffId || null,
      durationDays,
    },
  });

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

  await prisma.directMessage.create({
    data: {
      conversationId,
      senderId: paymentRequest.sellerId,
      text: `Спасибо за подписку! Оплата через ЮKassa прошла успешно. Доступ на ${durationDays} дней активирован. Если есть вопросы — пишите!`,
    },
  });

  // Notify buyer
  await createNotification({
    userId: paymentRequest.buyerId,
    type: "subscription",
    title: `Подписка на ${seller?.displayName || "автора"} оформлена`,
    body: `Оплата ${Number(paymentRequest.amount)} ₽ прошла. Доступ на ${durationDays} дней`,
    link: `/messages`,
  });

  // Notify seller about income
  const buyer = await prisma.user.findUnique({
    where: { id: paymentRequest.buyerId },
    select: { displayName: true },
  });
  await createNotification({
    userId: paymentRequest.sellerId,
    type: "payment",
    title: `Новая оплата через ЮKassa`,
    body: `${buyer?.displayName || "Покупатель"} — ${Number(paymentRequest.amount)} ₽`,
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
    title: "Платёж отменён",
    body: `Оплата ${Number(paymentRequest.amount)} ₽ через ЮKassa не прошла`,
    link: "/subscriptions",
  });

  console.log("[yukassa/webhook] Payment canceled:", paymentRequestId);
}
