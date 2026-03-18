import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

// GET: list author's tariffs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const tariffs = await prisma.subscriptionTariff.findMany({
    where: { authorId: id, isActive: true },
    orderBy: { price: "asc" },
  });

  // Hide sensitive YuKassa credentials from public API
  const safeTariffs = tariffs.map((t) => ({
    id: t.id,
    authorId: t.authorId,
    name: t.name,
    description: t.description,
    price: t.price,
    durationDays: t.durationDays,
    isActive: t.isActive,
    paymentMethods: t.paymentMethods,
    cardNumber: t.cardNumber,
    createdAt: t.createdAt,
  }));

  return NextResponse.json(safeTariffs);
}

// POST: create a new tariff (author only, rating >= 5)
const createTariffSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive(),
  durationDays: z.number().int().min(1).max(365),
  paymentMethods: z.array(z.enum(["card", "yukassa"])).optional(),
  cardNumber: z.string().max(30).optional(),
  yukassaShopId: z.string().max(50).optional(),
  yukassaSecret: z.string().max(200).optional(),
});

export async function POST(
  request: NextRequest,
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

  // Check rating
  const user = await prisma.user.findUnique({
    where: { id },
    select: { rating: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (Number(user.rating) < 5) {
    return NextResponse.json(
      { error: "Рейтинг должен быть не менее 5.0 для создания тарифов" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createTariffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const tariff = await prisma.subscriptionTariff.create({
    data: {
      authorId: id,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      durationDays: parsed.data.durationDays,
      paymentMethods: parsed.data.paymentMethods || ["card"],
      cardNumber: parsed.data.cardNumber,
      yukassaShopId: parsed.data.yukassaShopId,
      yukassaSecret: parsed.data.yukassaSecret,
    },
  });

  return NextResponse.json(tariff, { status: 201 });
}
