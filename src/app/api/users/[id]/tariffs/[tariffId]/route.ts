import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCustomFomoId } from "@/lib/fomoId";
import { getT } from "@/lib/i18n/server";
import { validateTariffMethods } from "@/lib/payment-link-server";
import { parseTariffInput, tariffNameKey } from "@/lib/tariff-validation";
import { tariffFail, logTariffError } from "@/lib/tariff-api";

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
  // The public GET hides YuKassa credentials, so the editor always sends null/"" for them: an empty value never wipes the stored ones.
  if (data.yukassaShopId == null) delete data.yukassaShopId;
  if (data.yukassaSecret == null) delete data.yukassaSecret;

  if (data.paymentMethods !== undefined) {
    const methodsError = await validateTariffMethods(id, data.paymentMethods);
    if (methodsError) return tariffFail({ field: "paymentMethods", code: methodsError }, t);
  }

  try {
    if (typeof data.name === "string" && tariffNameKey(data.name) !== tariffNameKey(tariff.name)) {
      const others = await prisma.subscriptionTariff.findMany({ where: { authorId: id, id: { not: tariffId } }, select: { name: true } });
      const key = tariffNameKey(data.name);
      if (others.some((x) => tariffNameKey(x.name) === key)) return tariffFail({ field: "name", code: "nameTaken" }, t, 409);
    }
  } catch (e) {
    logTariffError("update/name-check", e);
    return tariffFail({ field: null, code: "saveFailed" }, t, 500);
  }

  if (body.slug !== undefined) {
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
