import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { extendSubscription } from "@/lib/subscriptions";
import { getYukassaPayment } from "@/lib/yukassa";
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

  // Подписка на канал берётся из ЗАПИСИ запроса, а не из metadata уведомления.
  const tariffId = paymentRequest.tariffId || null;
  const tariff = tariffId ? await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } }) : null;

  // The notification itself is not authenticated, so it is never trusted on its own: the payment is fetched from YooKassa
  // with the channel's own credentials and must be a paid one for THIS request (same id, same amount).
  if (!tariff?.yukassaShopId || !tariff.yukassaSecret) {
    console.error("[yukassa/webhook] No YooKassa credentials for the request's tariff, cannot verify:", paymentRequestId);
    return;
  }
  try {
    const real = await getYukassaPayment(tariff.yukassaShopId, tariff.yukassaSecret, payment.id);
    const paid = real.status === "succeeded" && real.paid !== false;
    const sameAmount = Math.abs(Number(real.amount?.value) - Number(paymentRequest.amount)) < 0.005;
    const sameRequest = real.metadata?.paymentRequestId === paymentRequestId;
    const sameId = !paymentRequest.receiptUrl?.startsWith("yukassa:") || paymentRequest.receiptUrl === `yukassa:${payment.id}`;
    if (!paid || !sameAmount || !sameRequest || !sameId) {
      console.error("[yukassa/webhook] Payment check failed, ignored:", paymentRequestId, { paid, sameAmount, sameRequest, sameId });
      return;
    }
  } catch (e) {
    // Could not reach YooKassa: let it retry the notification later instead of dropping a real payment.
    console.error("[yukassa/webhook] Payment check unavailable:", e);
    throw e;
  }

  // Claim the request exactly once: of two parallel notifications only one gets count 1 (redelivery-safe).
  const claimed = await prisma.paymentRequest.updateMany({
    where: { id: paymentRequestId, status: "PENDING" },
    data: { status: "CONFIRMED" },
  });
  if (claimed.count !== 1) {
    console.log("[yukassa/webhook] PaymentRequest already processed:", paymentRequestId);
    return;
  }

  const durationDays = tariff ? tariff.durationDays : 30;

  // Подписка на канал (13.09.2026): своя запись на каждый канал автора. Платёж при активной подписке ПРОДЛЕВАЕТ
  // срок от текущей даты окончания (продление заранее); истёкшая / отменённая начинается заново от «сейчас».
  const { renewed, endDate } = await extendSubscription({
    subscriberId: paymentRequest.buyerId,
    authorId: paymentRequest.sellerId,
    tariffId,
    monthlyPrice: paymentRequest.amount,
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
      text: welcomeDmText(tFor(buyerLocale?.locale), paidChannel, endDate, durationDays, "notif.dm.yukassaWelcome", renewed),
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
      renewed,
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
