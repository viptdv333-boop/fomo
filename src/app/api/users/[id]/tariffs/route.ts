import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { validateTariffMethods } from "@/lib/payment-link-server";
import { activeSubWhere } from "@/lib/subscription-expire";
import { parseTariffInput, tariffNameKey } from "@/lib/tariff-validation";
import { tariffFail, logTariffError } from "@/lib/tariff-api";

// GET: list author's tariffs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const tariffs = await prisma.subscriptionTariff.findMany({
    where: { authorId: id, isActive: true },
    orderBy: { price: "asc" },
    include: { _count: { select: { subscriptions: { where: activeSubWhere() } } } },
  });

  // Hide sensitive YuKassa credentials from public API
  const safeTariffs = tariffs.map((t) => ({
    id: t.id,
    authorId: t.authorId,
    slug: t.slug,
    name: t.name,
    description: t.description,
    price: t.price,
    durationDays: t.durationDays,
    isActive: t.isActive,
    paymentMethods: t.paymentMethods,
    cardNumber: t.cardNumber,
    sbpQrUrl: t.sbpQrUrl,
    avatarUrl: t.avatarUrl,
    instrumentIds: t.instrumentIds,
    createdAt: t.createdAt,
    subscriberCount: t._count.subscriptions,
  }));

  return NextResponse.json(safeTariffs);
}

// POST: create a new tariff (author only, rating >= 5). Every 4xx carries a localized error + field (see tariff-api.ts).
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

  const { t } = await getT();

  // Check rating
  const user = await prisma.user.findUnique({
    where: { id },
    select: { rating: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (Number(user.rating) < 5) {
    return NextResponse.json({ error: t("api.tariffRatingTooLow") }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return tariffFail({ field: null, code: "invalidData" }, t);
  }

  const parsed = parseTariffInput(body, "create");
  if (!parsed.ok) return tariffFail(parsed.error, t);
  const d = parsed.data;

  const methodsError = await validateTariffMethods(id, d.paymentMethods);
  if (methodsError) return tariffFail({ field: "paymentMethods", code: methodsError }, t);

  try {
    // Names are unique per author (case/space-insensitive): two "Неделя" tariffs are indistinguishable for the buyer.
    const mine = await prisma.subscriptionTariff.findMany({ where: { authorId: id }, select: { name: true } });
    const key = tariffNameKey(d.name);
    if (mine.some((x) => tariffNameKey(x.name) === key)) {
      return tariffFail({ field: "name", code: "nameTaken" }, t, 409);
    }

    const tariff = await prisma.subscriptionTariff.create({
      data: {
        authorId: id,
        name: d.name,
        description: d.description,
        price: d.price,
        durationDays: d.durationDays,
        isActive: d.isActive,
        paymentMethods: d.paymentMethods,
        cardNumber: d.cardNumber,
        sbpQrUrl: d.sbpQrUrl,
        yukassaShopId: d.yukassaShopId,
        yukassaSecret: d.yukassaSecret,
        avatarUrl: d.avatarUrl,
        instrumentIds: d.instrumentIds,
      },
    });
    return NextResponse.json(tariff, { status: 201 });
  } catch (e) {
    logTariffError("create", e);
    return tariffFail({ field: null, code: "saveFailed" }, t, 500);
  }
}
