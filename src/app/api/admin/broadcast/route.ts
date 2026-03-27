import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

// POST: Send a broadcast notification to all approved users
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, body, link } = await request.json();

  if (!title) {
    return NextResponse.json({ error: "Заголовок обязателен" }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: { status: "APPROVED" },
    select: { id: true },
  });

  const notifications = users.map((u) => ({
    userId: u.id,
    type: "broadcast",
    title,
    body: body || null,
    link: link || null,
  }));

  const result = await prisma.notification.createMany({ data: notifications });

  return NextResponse.json({
    message: `Рассылка отправлена ${result.count} пользователям`,
    count: result.count,
  });
}
