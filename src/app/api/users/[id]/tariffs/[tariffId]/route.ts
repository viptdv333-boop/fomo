import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCustomFomoId } from "@/lib/fomoId";
import { getT } from "@/lib/i18n/server";
import { validateTariffMethods } from "@/lib/payment-link-server";
import { parseTariffInput, tariffNameKey } from "@/lib/tariff-validation";
import { tariffFail, logTariffError } from "@/lib/tariff-api";
import { isAdmin } from "@/lib/roles";
import { closeChannel, deletePlan } from "@/lib/channel-delete";
import { createNotification } from "@/lib/notifications";
import { planLabelOf } from "@/lib/tariff-plans";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { t } = await getT();

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same rules as POST (tariff-validation.ts): range of days, price, name length, payment methods; localized error + field.
  const parsed = parseTariffInput(body, "patch");
  if (!parsed.ok) return tariffFail(parsed.error, t);
  const data: Record<string, any> = { ...parsed.data };
  // A plan inherits picture / description / instruments from its channel and has no own channel name: never written on it.
  if (tariff.parentId) {
    delete data.description;
    delete data.avatarUrl;
    delete data.instrumentIds;
    delete data.planName;
  }
  if (tariff.archivedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The public GET hides YuKassa credentials, so the editor always sends null/"" for them: an empty value never wipes the stored ones.
  if (data.yukassaShopId == null) delete data.yukassaShopId;
  if (data.yukassaSecret == null) delete data.yukassaSecret;

  if (data.paymentMethods !== undefined) {
    const methodsError = await validateTariffMethods(id, data.paymentMethods);
    if (methodsError) return tariffFail({ field: "paymentMethods", code: methodsError }, t);
  }

  try {
    if (typeof data.name === "string" && tariffNameKey(data.name) !== tariffNameKey(tariff.name)) {
      // Channel names are unique among the author's channels; a plan name among the plans of its channel (own plan included).
      let taken: string[];
      if (tariff.parentId) {
        const [parent, sib] = await Promise.all([
          prisma.subscriptionTariff.findUnique({ where: { id: tariff.parentId }, select: { name: true, planName: true } }),
          prisma.subscriptionTariff.findMany({ where: { parentId: tariff.parentId, id: { not: tariffId } }, select: { name: true } }),
        ]);
        taken = sib.map((x) => x.name);
        if (parent) taken.push(planLabelOf({ name: parent.name, planName: parent.planName }) ?? "");
      } else {
        taken = (await prisma.subscriptionTariff.findMany({ where: { authorId: id, parentId: null, id: { not: tariffId } }, select: { name: true } })).map((x) => x.name);
      }
      const key = tariffNameKey(data.name);
      if (taken.some((x) => x && tariffNameKey(x) === key)) return tariffFail({ field: "name", code: "nameTaken" }, t, 409);
    }
  } catch (e) {
    logTariffError("update/name-check", e);
    return tariffFail({ field: null, code: "saveFailed" }, t, 500);
  }

  if (body.slug !== undefined && !tariff.parentId) {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (slug === "") {
      data.slug = null;
    } else {
      if (!isValidCustomFomoId(slug)) {
        return NextResponse.json(
          { error: t("api.tariffSlugInvalid") },
          { status: 400 }
        );
      }
      const existing = await prisma.subscriptionTariff.findUnique({ where: { slug } });
      if (existing && existing.id !== tariffId) {
        return NextResponse.json({ error: t("api.tariffSlugTaken") }, { status: 400 });
      }
      data.slug = slug;
    }
  }

  try {
    const updated = await prisma.subscriptionTariff.update({
      where: { id: tariffId },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    logTariffError("update", e);
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: t("api.tariffSlugTaken"), field: "slug", code: "slugTaken" }, { status: 409 });
    }
    return tariffFail({ field: null, code: "saveFailed" }, t, 500);
  }
}

// DELETE a PLAN: removes just that plan (its subscribers stay in the channel until the paid term ends); the last
// available plan can't be deleted. DELETE a CHANNEL (root row): «Удалить канал» - see lib/channel-delete.ts for exactly
// what happens (subscriptions ended, posts/chat kept closed, one notice per subscriber, idempotent). With active
// subscribers the body must carry { confirmName: <channel name> }. Allowed for the author and for ADMIN/OWNER.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  const admin = isAdmin(session.user);
  if (session.user.id !== id && !admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { t } = await getT();
  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId }, select: { id: true, authorId: true, parentId: true } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));

  try {
    if (tariff.parentId) {
      const r = await deletePlan(prisma, { planId: tariffId, actorId: session.user.id, actorIsAdmin: admin });
      if (!r.ok) return tariffFail({ field: null, code: r.code === "notAPlan" ? "notAPlan" : "saveFailed" }, t, r.code === "forbidden" ? 403 : r.code === "notFound" ? 404 : 409);
      return NextResponse.json({ ok: true, plan: true, movedSubscriptions: r.movedSubscriptions });
    }

    const r = await closeChannel(prisma, {
      rootId: tariffId,
      actorId: session.user.id,
      actorIsAdmin: admin,
      confirmName: typeof body?.confirmName === "string" ? body.confirmName : null,
      notify: (userId, channelName) =>
        createNotification({
          userId,
          type: "subscription_removed",
          title: { key: "notif.channelClosed.title", vars: { channel: channelName } },
          body: { key: "notif.channelClosed.body" },
          link: "/subscriptions",
        }),
    });
    if (!r.ok) {
      if (r.code === "confirmRequired") {
        return NextResponse.json(
          { error: t("api.tariffErr.confirmRequired", { count: r.activeSubscribers }), field: "confirmName", code: "confirmRequired", activeSubscribers: r.activeSubscribers },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: t("api.channelNotFound") }, { status: r.code === "forbidden" ? 403 : 404 });
    }
    return NextResponse.json({ ok: true, mode: r.mode, cancelled: r.cancelled });
  } catch (e) {
    logTariffError("delete", e);
    return tariffFail({ field: null, code: "saveFailed" }, t, 500);
  }
}
