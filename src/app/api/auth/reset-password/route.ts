import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode, generateCode } from "@/lib/email";
import bcrypt from "bcryptjs";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkPassword } from "@/lib/account-security";
import { consumeCode } from "@/lib/verification";
import { getT } from "@/lib/i18n/server";
import { mirrorReset } from "@/lib/account-mirror-client";

export async function POST(request: NextRequest) {
  const { action, email, code, newPassword } = await request.json();
  const { locale, t } = await getT();

  // Password reset is the shortest path to someone else's account, so it gets
  // an IP ceiling on top of the per-code attempt counter.
  const ipLimit = await rateLimit(`reset:ip:${clientIp(request)}`, 20, 60 * 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: t("api.tooManyAttempts") },
      { status: 429 }
    );
  }

  if (!email) {
    return NextResponse.json({ error: t("api.enterEmail") }, { status: 400 });
  }

  // The address is matched without regard to case or stray spaces: phone keyboards capitalise the first letter ("Name@gmail.com"), and
  // a miss here is answered with the generic "code sent" text without sending anything, so a user never learns why no mail came.
  const typed = String(email).trim();
  const user = await prisma.user.findFirst({ where: { email: { equals: typed, mode: "insensitive" } }, select: { id: true, status: true, email: true } });
  if (!user) {
    // Don't reveal whether email exists
    return NextResponse.json({ message: t("api.resetGeneric") });
  }
  // From here on the address is the one stored on the account: codes are issued for it, and checked against it.
  const accountEmail = user.email;

  if (user.status === "BANNED") {
    return NextResponse.json({ error: t("api.accountBanned") }, { status: 403 });
  }

  // Step 1: Send code
  if (action === "send-code") {
    const recent = await prisma.emailVerification.findFirst({
      where: { email: accountEmail, createdAt: { gte: new Date(Date.now() - 60000) } },
    });
    if (recent) {
      return NextResponse.json({ error: t("api.waitBeforeResend") }, { status: 429 });
    }

    const verCode = generateCode();
    await prisma.emailVerification.create({
      data: {
        email: accountEmail,
        code: verCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        purpose: "reset_password",
      },
    });

    try {
      await sendVerificationCode(accountEmail, verCode, locale);
    } catch {
      return NextResponse.json({ error: t("api.sendCodeFailed") }, { status: 500 });
    }

    return NextResponse.json({ message: t("api.codeSentTo", { email }) });
  }

  // Step 2: Verify code + set new password
  if (action === "reset") {
    if (!code || !newPassword) {
      return NextResponse.json({ error: t("api.enterCodeAndPassword") }, { status: 400 });
    }

    const strength = checkPassword(newPassword, locale);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    const check = await consumeCode(accountEmail, code, "reset_password", locale);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    // Bumping sessionVersion evicts every existing session. Without it a reset
    // done because the account was compromised left the intruder logged in.
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, sessionVersion: { increment: 1 } },
    });

    // The other site takes the new hash too (best-effort, in the background).
    mirrorReset(user.id, accountEmail, hash);

    return NextResponse.json({ message: t("api.passwordResetSuccess") });
  }

  return NextResponse.json({ error: t("api.resetActionRequired") }, { status: 400 });
}
