import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

// POST: Create a report (any authenticated user)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { targetType, targetId, reason, details } = await request.json();

  if (!targetType || !targetId || !reason) {
    return NextResponse.json({ error: "Заполните все обязательные поля" }, { status: 400 });
  }

  if (!["idea", "author", "channel"].includes(targetType)) {
    return NextResponse.json({ error: "Неверный тип жалобы" }, { status: 400 });
  }

  // Check for duplicate report
  const existing = await prisma.report.findFirst({
    where: {
      reporterId: session.user.id,
      targetType,
      targetId,
      status: "pending",
    },
  });

  if (existing) {
    return NextResponse.json({ error: "Вы уже отправили жалобу на этот объект" }, { status: 409 });
  }

  const report = await prisma.report.create({
    data: {
      reporterId: session.user.id,
      targetType,
      targetId,
      reason,
      details: details || null,
    },
  });

  // Notify admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: "report",
        title: `Новая жалоба: ${targetType}`,
        body: reason.slice(0, 100),
        link: "/admin?tab=reports",
      },
    });
  }

  return NextResponse.json(report, { status: 201 });
}

// GET: List reports (admin only)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status") || "pending";

  const reports = await prisma.report.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(reports);
}

// PATCH: Resolve a report (admin only)
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { reportId, resolution } = await request.json();

  if (!reportId || !resolution) {
    return NextResponse.json({ error: "reportId and resolution required" }, { status: 400 });
  }

  if (!["deleted", "banned", "dismissed"].includes(resolution)) {
    return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Apply resolution
  if (resolution === "deleted" && report.targetType === "idea") {
    await prisma.idea.delete({ where: { id: report.targetId } }).catch(() => {});
  } else if (resolution === "banned" && report.targetType === "author") {
    await prisma.user.update({
      where: { id: report.targetId },
      data: { status: "BANNED", banReason: `Жалоба: ${report.reason}` },
    }).catch(() => {});
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: { status: "resolved", resolution, resolvedAt: new Date() },
  });

  return NextResponse.json(updated);
}
