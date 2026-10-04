import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_LINK_ERRORS_RU,
  PAYMENT_LINK_MAX_LABEL,
  linkRef,
  normalizeLinkDetails,
} from "@/lib/payment-link";

const KNOWN_TYPES = new Set(["card", "yukassa", "crypto", "sbp", "link"]);

function badLink(code: keyof typeof PAYMENT_LINK_ERRORS_RU) {
  return NextResponse.json({ error: PAYMENT_LINK_ERRORS_RU[code], code }, { status: 400 });
}

// GET — list my payment methods
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const methods = await prisma.paymentMethod.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(methods);
}

// POST — add new payment method
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, label, details, isDefault } = await request.json();

  if (!type || !label) {
    return NextResponse.json({ error: "type and label required" }, { status: 400 });
  }
  if (typeof type !== "string" || typeof label !== "string") {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  if (!KNOWN_TYPES.has(type)) {
    return NextResponse.json({ error: "Неизвестный тип способа оплаты" }, { status: 400 });
  }

  let cleanDetails: any = details || {};
  let cleanLabel: string = label;
  if (type === "link") {
    cleanLabel = label.trim();
    if (!cleanLabel || cleanLabel.length > PAYMENT_LINK_MAX_LABEL) {
      return NextResponse.json(
        { error: `Название должно быть от 1 до ${PAYMENT_LINK_MAX_LABEL} символов` },
        { status: 400 }
      );
    }
    const norm = normalizeLinkDetails(details);
    if (!norm.ok) return badLink(norm.code);
    cleanDetails = norm.details; // canonical { url, instruction? } — nothing else is stored
  }

  // If setting as default, unset others
  if (isDefault) {
    await prisma.paymentMethod.updateMany({
      where: { userId: session.user.id },
      data: { isDefault: false },
    });
  }

  const method = await prisma.paymentMethod.create({
    data: {
      userId: session.user.id,
      type,
      label: cleanLabel,
      details: cleanDetails,
      isDefault: isDefault || false,
    },
  });

  return NextResponse.json(method, { status: 201 });
}

// DELETE — remove payment method
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const method = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!method || method.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.paymentMethod.delete({ where: { id } });

  // A deleted link method must not linger in the author's tariffs ("link:<id>").
  if (method.type === "link") {
    const ref = linkRef(id);
    const tariffs = await prisma.subscriptionTariff.findMany({
      where: { authorId: session.user.id, paymentMethods: { has: ref } },
      select: { id: true, paymentMethods: true },
    });
    for (const tf of tariffs) {
      await prisma.subscriptionTariff.update({
        where: { id: tf.id },
        data: { paymentMethods: tf.paymentMethods.filter((x) => x !== ref) },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

// PATCH — update (set default, edit label)
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, label, isDefault, details } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const method = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!method || method.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: any = {};
  if (label !== undefined) {
    if (typeof label !== "string") return NextResponse.json({ error: "Некорректное название" }, { status: 400 });
    if (method.type === "link") {
      const l = label.trim();
      if (!l || l.length > PAYMENT_LINK_MAX_LABEL) {
        return NextResponse.json(
          { error: `Название должно быть от 1 до ${PAYMENT_LINK_MAX_LABEL} символов` },
          { status: 400 }
        );
      }
      data.label = l;
    } else {
      data.label = label;
    }
  }
  if (isDefault !== undefined) data.isDefault = isDefault;
  if (details !== undefined) {
    if (method.type === "link") {
      const norm = normalizeLinkDetails(details);
      if (!norm.ok) return badLink(norm.code);
      data.details = norm.details;
    } else {
      data.details = details;
    }
  }

  // Only after every field validated, so a rejected edit never drops the current default.
  if (isDefault) {
    await prisma.paymentMethod.updateMany({
      where: { userId: session.user.id },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.paymentMethod.update({ where: { id }, data });
  return NextResponse.json(updated);
}
