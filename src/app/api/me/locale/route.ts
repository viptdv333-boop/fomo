import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLocale } from "@/lib/i18n/locale-url";

// Saves the language notifications, push and Telegram messages are written in.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });
  const { locale } = await req.json().catch(() => ({}));
  if (!isLocale(locale)) return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
  return NextResponse.json({ ok: true });
}
