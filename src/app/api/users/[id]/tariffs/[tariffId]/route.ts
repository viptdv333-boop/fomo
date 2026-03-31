import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, any> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.price !== undefined) data.price = body.price;
  if (body.durationDays !== undefined) data.durationDays = body.durationDays;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
  if (body.instrumentIds !== undefined) data.instrumentIds = body.instrumentIds;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.paymentMethods !== undefined) data.paymentMethods = body.paymentMethods;
  if (body.cardNumber !== undefined) data.cardNumber = body.cardNumber;

  const updated = await prisma.subscriptionTariff.update({
    where: { id: tariffId },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.subscriptionTariff.delete({ where: { id: tariffId } });
  return NextResponse.json({ ok: true });
}
