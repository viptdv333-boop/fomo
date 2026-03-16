import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const createSchema = z.object({
  university: z.string().min(1).max(200),
  faculty: z.string().max(200).optional(),
  specialty: z.string().max(200).optional(),
  yearEnd: z.number().int().min(1950).max(2050).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const education = await prisma.education.findMany({
    where: { userId: id },
    orderBy: { yearEnd: "desc" },
  });

  return NextResponse.json(education);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (session.user.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const education = await prisma.education.create({
    data: {
      userId: id,
      ...parsed.data,
    },
  });

  return NextResponse.json(education, { status: 201 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (session.user.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const educationId = request.nextUrl.searchParams.get("educationId");
  if (!educationId) {
    return NextResponse.json({ error: "educationId required" }, { status: 400 });
  }

  const record = await prisma.education.findFirst({
    where: { id: educationId, userId: id },
  });
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.education.delete({ where: { id: educationId } });

  return NextResponse.json({ message: "Deleted" });
}
