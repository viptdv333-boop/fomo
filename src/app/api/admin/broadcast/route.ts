import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { sendBroadcastEmail } from "@/lib/email";

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
    let sentCount = 0;
    let failedCount = 0;
    for (const user of users) {
      try {
        const ok = await sendBroadcastEmail(user.email, title, body, link);
        if (ok) sentCount++;
        else failedCount++;
      } catch {
        failedCount++;
      }
      // Rate limit: small delay between emails
      if (users.length > 10) await new Promise((r) => setTimeout(r, 100));
    }

    // Save notification records for tracking
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
      message: `Email-рассылка: отправлено ${sentCount}, ошибок ${failedCount}`,
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
