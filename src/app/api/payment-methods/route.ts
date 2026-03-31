import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      label,
      details: details || {},
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

  if (isDefault) {
    await prisma.paymentMethod.updateMany({
      where: { userId: session.user.id },
      data: { isDefault: false },
    });
  }

  const data: any = {};
  if (label !== undefined) data.label = label;
  if (isDefault !== undefined) data.isDefault = isDefault;
  if (details !== undefined) data.details = details;

  const updated = await prisma.paymentMethod.update({ where: { id }, data });
  return NextResponse.json(updated);
}
