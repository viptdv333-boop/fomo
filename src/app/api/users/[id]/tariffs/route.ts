import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { validateTariffMethods } from "@/lib/payment-link-server";
import { activeSubWhere } from "@/lib/subscription-expire";
import { CHANNEL_ROWS, MAX_PLANS_PER_CHANNEL, defaultPlan, planLabelOf, planViews, subscribersByRoot, validatePlanParent } from "@/lib/tariff-plans";
import { parseTariffInput, tariffNameKey } from "@/lib/tariff-validation";
import { tariffFail, logTariffError } from "@/lib/tariff-api";

// GET: the author's CHANNELS (one entry per channel, tariff-plans.ts) with their `plans` on sale.
//   price / durationDays of an entry = its default (cheapest) plan; `plans` = [{ id, label, price, durationDays, isRoot }]
//   sorted by period then price; `subscriberCount` = people on any plan of the channel.
//   ?scope=manage (the author only): every row of the author - channels AND their plans, inactive ones too - for the editor.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const manage = request.nextUrl.searchParams.get("scope") === "manage" && (await auth())?.user?.id === id;

  const rows = await prisma.subscriptionTariff.findMany({
    where: manage ? { authorId: id, archivedAt: null } : { authorId: id, ...CHANNEL_ROWS, isActive: true },
    orderBy: manage ? { createdAt: "asc" } : { price: "asc" },
    include: { plans: { select: { id: true, name: true, parentId: true, planName: true, price: true, durationDays: true, isActive: true, paymentMethods: true, cardNumber: true, sbpQrUrl: true } } },
  });

  const rootOfTariff = new Map<string, string>();
  for (const t of rows) {
    rootOfTariff.set(t.id, t.parentId ?? t.id);
    for (const p of t.plans) rootOfTariff.set(p.id, t.id);
  }
  const activeSubs = await prisma.subscription.findMany({
    where: { ...activeSubWhere(), tariffId: { in: [...rootOfTariff.keys()] } },
    select: { tariffId: true, subscriberId: true },
  });
  const members = subscribersByRoot(activeSubs, rootOfTariff);
  const ownCount = (tid: string) => new Set(activeSubs.filter((s) => s.tariffId === tid).map((s) => s.subscriberId)).size;

  // Hide sensitive YuKassa credentials from public API
  const safeTariffs = rows.map((t) => {
    const plans = t.parentId ? [] : planViews(t, t.plans);
    const def = manage ? null : defaultPlan(plans);
    return {
      id: t.id,
      authorId: t.authorId,
      slug: t.slug,
      name: t.name,
      parentId: t.parentId,
      planName: t.planName,
      planLabel: t.parentId ? null : planLabelOf(t),
      description: t.description,
      price: def ? def.price : t.price,
      durationDays: def ? def.durationDays : t.durationDays,
      isActive: t.isActive,
      paymentMethods: t.paymentMethods,
      cardNumber: t.cardNumber,
      sbpQrUrl: t.sbpQrUrl,
      avatarUrl: t.avatarUrl,
      instrumentIds: t.instrumentIds,
      createdAt: t.createdAt,
      plans,
      subscriberCount: t.parentId ? ownCount(t.id) : members.get(t.id) ?? 0,
    };
  });

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

  // parentId: this row is a PLAN of the author's channel (tariff-plans.ts), not a new channel.
  const parentId = (body as { parentId?: unknown } | null)?.parentId;
  let parent: { id: string; name: string; planName: string | null } | null = null;
  if (parentId !== undefined && parentId !== null && parentId !== "") {
    if (typeof parentId !== "string") return tariffFail({ field: "parentId", code: "invalidData" }, t);
    const row = await prisma.subscriptionTariff.findUnique({
      where: { id: parentId },
      select: { id: true, authorId: true, parentId: true, archivedAt: true, name: true, planName: true },
    });
    const planCount = row ? await prisma.subscriptionTariff.count({ where: { parentId: row.id } }) : 0;
    const check = validatePlanParent(row, id, planCount);
    if (!check.ok) {
      return tariffFail({ field: "parentId", code: check.code, vars: { max: MAX_PLANS_PER_CHANNEL } }, t, check.code === "parentNotFound" ? 404 : check.code === "parentNotOwned" ? 403 : 400);
    }
    parent = row!;
  }

  const methodsError = await validateTariffMethods(id, d.paymentMethods);
  if (methodsError) return tariffFail({ field: "paymentMethods", code: methodsError }, t);

  try {
    // Names are unique per author (case/space-insensitive): two "Неделя" tariffs are indistinguishable for the buyer.
    // A channel name is unique among the author's channels; a plan name among the plans of its channel (the channel's
    // own plan included).
    const siblings = parent
      ? await prisma.subscriptionTariff.findMany({ where: { parentId: parent.id }, select: { name: true } })
      : await prisma.subscriptionTariff.findMany({ where: { authorId: id, parentId: null }, select: { name: true } });
    const key = tariffNameKey(d.name);
    const taken = siblings.map((x) => x.name);
    if (parent) taken.push(planLabelOf({ name: parent.name, planName: parent.planName }) ?? "");
    if (taken.some((x) => x && tariffNameKey(x) === key)) {
      return tariffFail({ field: "name", code: "nameTaken" }, t, 409);
    }

    const tariff = await prisma.subscriptionTariff.create({
      data: {
        authorId: id,
        name: d.name,
        ...(parent ? { parentId: parent.id } : { planName: d.planName }),
        // a plan inherits description / picture / instruments from its channel
        description: parent ? null : d.description,
        price: d.price,
        durationDays: d.durationDays,
        isActive: d.isActive,
        paymentMethods: d.paymentMethods,
        cardNumber: d.cardNumber,
        sbpQrUrl: d.sbpQrUrl,
        yukassaShopId: d.yukassaShopId,
        yukassaSecret: d.yukassaSecret,
        avatarUrl: parent ? null : d.avatarUrl,
        instrumentIds: parent ? [] : d.instrumentIds,
      },
    });
    return NextResponse.json(tariff, { status: 201 });
  } catch (e) {
    logTariffError("create", e);
    return tariffFail({ field: null, code: "saveFailed" }, t, 500);
  }
}
