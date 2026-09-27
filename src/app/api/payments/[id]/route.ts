import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { grantSubscription } from "@/lib/subscriptions";
import { tFor } from "@/lib/i18n/server";

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
      title: { key: "notif.payment.receiptSent.title", vars: { name: buyer?.displayName || { key: "notif.fallback.buyer" } } },
      body: { key: "notif.payment.amount", vars: { amount: String(paymentRequest.amount) } },
      link: `/profile?tab=finance`,
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

      const idea = await prisma.idea.findUnique({
        where: { id: paymentRequest.ideaId },
        select: { title: true },
      });
      await createNotification({
        userId: paymentRequest.buyerId,
        type: "payment",
        title: { key: "notif.payment.ideaConfirmed.title" },
        body: idea
          ? { key: "notif.payment.ideaConfirmed.body", vars: { title: idea.title } }
          : { key: "notif.payment.accessOpen" },
        link: `/ideas/${paymentRequest.ideaId}`,
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

      // Подписка на канал (13.09.2026): своя запись на каждый канал автора.
      await grantSubscription({
        subscriberId: paymentRequest.buyerId,
        authorId: paymentRequest.sellerId,
        tariffId,
        monthlyPrice: paymentRequest.amount,
        endDate,
        durationDays,
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

      // Auto-written on the seller's behalf — in the buyer's (reader's) language.
      const buyerLocale = await prisma.user.findUnique({
        where: { id: paymentRequest.buyerId },
        select: { locale: true },
      });
      await prisma.directMessage.create({
        data: {
          conversationId,
          senderId: paymentRequest.sellerId,
          text: tFor(buyerLocale?.locale)("notif.dm.subscriptionWelcome", { days: durationDays }),
        },
      });

      // Notify buyer
      await createNotification({
        userId: paymentRequest.buyerId,
        type: "subscription",
        title: { key: "notif.subscription.done.title", vars: { name: seller?.displayName || { key: "notif.fallback.author" } } },
        body: { key: "notif.subscription.done.body", vars: { days: durationDays } },
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
      title: { key: "notif.payment.confirmed.title" },
      body: {
        key: "notif.payment.buyerAmount",
        vars: { name: buyerUser?.displayName || { key: "notif.fallback.buyer" }, amount: String(paymentRequest.amount) },
      },
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
      title: { key: "notif.payment.rejected.title" },
      body: { key: "notif.payment.amount", vars: { amount: String(paymentRequest.amount) } },
      link: "/messages",
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
