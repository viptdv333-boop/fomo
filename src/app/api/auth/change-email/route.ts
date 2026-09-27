import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendVerificationCode, generateCode } from "@/lib/email";
import { consumeCode } from "@/lib/verification";
import { getT } from "@/lib/i18n/server";

// Step 1: POST with { action: "send-code", newEmail, password }
// Step 2: POST with { action: "verify", newEmail, code }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, newEmail, password, code } = body;
  const { locale, t } = await getT();

  if (!newEmail) {
    return NextResponse.json({ error: t("api.enterNewEmail") }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return NextResponse.json({ error: t("api.invalidEmail") }, { status: 400 });
  }

  // Check email not taken
  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) {
    return NextResponse.json({ error: t("api.emailInUse") }, { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: t("api.userNotFound") }, { status: 404 });
  }

  if (user.email === newEmail) {
    return NextResponse.json({ error: t("api.sameEmail") }, { status: 400 });
  }

  // STEP 1: Send verification code to new email
  if (action === "send-code") {
    if (!password) {
      return NextResponse.json({ error: t("api.enterPassword") }, { status: 400 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: t("api.wrongPassword") }, { status: 403 });
    }

    // Rate limit: 60s
    const recent = await prisma.emailVerification.findFirst({
      where: { email: newEmail, createdAt: { gte: new Date(Date.now() - 60000) } },
    });
    if (recent) {
      return NextResponse.json({ error: t("api.waitBeforeResend") }, { status: 429 });
    }

    const verCode = generateCode();
    await prisma.emailVerification.create({
      data: {
        email: newEmail,
        code: verCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        purpose: "change_email",
      },
    });

    try {
      await sendVerificationCode(newEmail, verCode, locale);
    } catch {
      return NextResponse.json({ error: t("api.sendCodeFailed") }, { status: 500 });
    }

    return NextResponse.json({ message: t("api.codeSentTo", { email: newEmail }) });
  }

  // STEP 2: Verify code and change email
  if (action === "verify") {
    if (!code) {
      return NextResponse.json({ error: t("api.enterCode") }, { status: 400 });
    }

    // Counts wrong guesses and burns the code after the cap — the bare lookup
    // that used to be here allowed unlimited attempts.
    const check = await consumeCode(newEmail, code, "change_email", locale);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    // Update email. sessionVersion bump evicts every other session — without
    // it, a hijacked/idle session could change the login email and every
    // other active session (including the attacker's, if that's who did this)
    // would simply keep working.
    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: newEmail, sessionVersion: { increment: 1 } },
    });

    return NextResponse.json({ message: t("api.emailChanged") });
  }

  return NextResponse.json({ error: t("api.changeEmailActionRequired") }, { status: 400 });
}
