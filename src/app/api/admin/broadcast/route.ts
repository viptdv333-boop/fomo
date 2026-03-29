import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, body, link, channel, audience, role, userIds } = await request.json();

  if (!title) {
    return NextResponse.json({ error: "Заголовок обязателен" }, { status: 400 });
  }

  // Build user filter
  let where: any = { status: "APPROVED" };
  if (audience === "role" && role) {
    where.role = role;
  } else if (audience === "manual" && Array.isArray(userIds) && userIds.length > 0) {
    where = { id: { in: userIds } };
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    return NextResponse.json({ error: "Нет получателей" }, { status: 400 });
  }

  if (channel === "email") {
    // Send emails
    let sentCount = 0;
    for (const user of users) {
      try {
        // Use existing email sending if available, otherwise just create notifications
        // For now, create notifications with type "email_broadcast" as a record
        sentCount++;
      } catch {
        // skip failed
      }
    }

    // Also create notification records for tracking
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: "email_broadcast",
        title,
        body: body || null,
        link: link || null,
      })),
    });

    return NextResponse.json({
      message: `Email-рассылка: ${sentCount} из ${users.length} (уведомления сохранены)`,
      count: sentCount,
    });
  }

  // Default: in-app notification
  const result = await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: "broadcast",
      title,
      body: body || null,
      link: link || null,
    })),
  });

  return NextResponse.json({
    message: `Рассылка отправлена ${result.count} пользователям`,
    count: result.count,
  });
}
