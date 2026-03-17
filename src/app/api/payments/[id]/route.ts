import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH: Update payment request (upload receipt or confirm/reject)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const userId = session.user.id!;

  const paymentRequest = await prisma.paymentRequest.findUnique({
    where: { id },
  });

  if (!paymentRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  // Buyer uploads receipt
  if (body.receiptUrl && paymentRequest.buyerId === userId) {
    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { receiptUrl: body.receiptUrl },
    });

    // Notify seller about receipt
    const buyer = await prisma.user.findUnique({
      where: { id: paymentRequest.buyerId },
      select: { displayName: true },
    });
    await createNotification({
      userId: paymentRequest.sellerId,
      type: "payment",
      title: `${buyer?.displayName || "Покупатель"} отправил квитанцию`,
      body: `Сумма: ${paymentRequest.amount} ₽`,
      link: `/profile/${paymentRequest.sellerId}`,
    });

    return NextResponse.json(updated);
  }

  // Seller confirms payment
  if (body.action === "confirm" && paymentRequest.sellerId === userId) {
    if (paymentRequest.status !== "PENDING") {
      return NextResponse.json({ error: "Already processed" }, { status: 400 });
    }

    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });

    // Grant access: create purchase or subscription
    if (paymentRequest.ideaId) {
      await prisma.purchase.create({
        data: {
          userId: paymentRequest.buyerId,
          ideaId: paymentRequest.ideaId,
          amount: paymentRequest.amount,
          status: "completed",
        },
      });
    } else if (paymentRequest.subscriptionType === "monthly" || paymentRequest.subscriptionType === "tariff") {
      let durationDays = 30;
      let tariffId: string | null = null;

      if (paymentRequest.tariffId) {
        const tariff = await prisma.subscriptionTariff.findUnique({
          where: { id: paymentRequest.tariffId },
        });
        if (tariff) {
          durationDays = tariff.durationDays;
          tariffId = tariff.id;
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
          tariffId,
          durationDays,
        },
        create: {
          subscriberId: paymentRequest.buyerId,
          authorId: paymentRequest.sellerId,
          monthlyPrice: paymentRequest.amount,
          endDate,
          tariffId,
          durationDays,
        },
      });

      // Auto-DM: create conversation and send welcome message
      const seller = await prisma.user.findUnique({
        where: { id: paymentRequest.sellerId },
        select: { displayName: true },
      });

      // Find or create conversation
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
          text: `Спасибо за подписку! Добро пожаловать. Теперь вам доступны все мои платные идеи на ${durationDays} дней. Если есть вопросы — пишите!`,
        },
      });

      // Notify buyer
      await createNotification({
        userId: paymentRequest.buyerId,
        type: "subscription",
        title: `Подписка на ${seller?.displayName || "автора"} оформлена`,
        body: `Доступ на ${durationDays} дней`,
        link: `/messages`,
      });
    }

    // Notify seller about confirmed payment
    const buyerUser = await prisma.user.findUnique({
      where: { id: paymentRequest.buyerId },
      select: { displayName: true },
    });
    await createNotification({
      userId: paymentRequest.sellerId,
      type: "payment",
      title: `Оплата подтверждена`,
      body: `${buyerUser?.displayName || "Покупатель"} — ${paymentRequest.amount} ₽`,
    });

    return NextResponse.json(updated);
  }

  // Seller rejects payment
  if (body.action === "reject" && paymentRequest.sellerId === userId) {
    if (paymentRequest.status !== "PENDING") {
      return NextResponse.json({ error: "Already processed" }, { status: 400 });
    }

    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    // Notify buyer about rejection
    await createNotification({
      userId: paymentRequest.buyerId,
      type: "payment",
      title: "Платёж отклонён",
      body: `Сумма: ${paymentRequest.amount} ₽`,
      link: "/messages",
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
