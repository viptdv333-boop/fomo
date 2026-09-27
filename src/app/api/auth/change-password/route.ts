import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkPassword } from "@/lib/account-security";
import { rateLimit } from "@/lib/rate-limit";
import { getT } from "@/lib/i18n/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();
  const { locale, t } = await getT();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: t("api.fillAllFields") }, { status: 400 });
  }
  const strength = checkPassword(newPassword, locale);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.error }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: t("api.userNotFound") }, { status: 404 });
  }

  // Someone who walked up to an unlocked screen shouldn't get unlimited tries
  // at the current password either.
  const guessLimit = await rateLimit(`changepw:${session.user.id}`, 10, 15 * 60 * 1000);
  if (!guessLimit.allowed) {
    return NextResponse.json(
      { error: t("api.tooManyAttempts") },
      { status: 429 }
    );
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: t("api.wrongCurrentPassword") }, { status: 403 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  // Every other session dies with the old password — see User.sessionVersion.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash, sessionVersion: { increment: 1 } },
  });

  return NextResponse.json({ message: t("api.passwordChanged") });
}
