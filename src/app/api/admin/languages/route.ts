import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: list all languages
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const languages = await prisma.language.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(languages);
}

// POST: create or update a language
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code, name, enabled, sortOrder } = await request.json();

  if (!code || !name) {
    return NextResponse.json({ error: "Code and name required" }, { status: 400 });
  }

  const language = await prisma.language.upsert({
    where: { code },
    update: { name, enabled: enabled ?? true, sortOrder: sortOrder ?? 0 },
    create: { code, name, enabled: enabled ?? true, sortOrder: sortOrder ?? 0 },
  });

  return NextResponse.json(language);
}

// DELETE: delete a language
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code } = await request.json();
  if (!code) {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  await prisma.language.delete({ where: { code } });
  return NextResponse.json({ ok: true });
}
