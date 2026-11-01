import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLocale } from "@/lib/i18n/locale-url";
import { mirrorProfile } from "@/lib/account-mirror-client";

// Saves the language notifications, push and Telegram messages are written in.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });
  const { locale } = await req.json().catch(() => ({}));
  if (!isLocale(locale)) return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  // The client sends this on every page load: nothing is written or mirrored while the language has not changed.
  const current = await prisma.user.findUnique({ where: { id: session.user.id }, select: { locale: true } });
  if (current?.locale === locale) return NextResponse.json({ ok: true });
  await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
  // The language is part of the profile shared with the other site.
  mirrorProfile(session.user.id, session.user.email, { locale });
  return NextResponse.json({ ok: true });
}
