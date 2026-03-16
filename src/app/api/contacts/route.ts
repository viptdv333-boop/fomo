import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List user's contacts
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contacts = await prisma.contact.findMany({
    where: { userId: session.user.id! },
    select: {
      id: true,
      nickname: true,
      contact: {
        select: { id: true, displayName: true, avatarUrl: true, dmEnabled: true },
      },
    },
    orderBy: { contact: { displayName: "asc" } },
  });

  return NextResponse.json(
    contacts.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      user: c.contact,
    }))
  );
}

// POST: Add contact
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactId, nickname } = await request.json();
  const userId = session.user.id!;

  if (contactId === userId) {
    return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.contact.findUnique({
    where: { userId_contactId: { userId, contactId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already in contacts" }, { status: 409 });
  }

  const contact = await prisma.contact.create({
    data: { userId, contactId, nickname: nickname || null },
    select: {
      id: true,
      nickname: true,
      contact: {
        select: { id: true, displayName: true, avatarUrl: true, dmEnabled: true },
      },
    },
  });

  return NextResponse.json(
    { id: contact.id, nickname: contact.nickname, user: contact.contact },
    { status: 201 }
  );
}

// DELETE: Remove contact
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  if (!contactId) {
    return NextResponse.json({ error: "contactId required" }, { status: 400 });
  }

  await prisma.contact.deleteMany({
    where: { userId: session.user.id!, contactId },
  });

  return NextResponse.json({ ok: true });
}
