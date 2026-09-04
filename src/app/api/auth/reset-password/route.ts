import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode, generateCode } from "@/lib/email";
import bcrypt from "bcryptjs";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkPassword } from "@/lib/account-security";
import { consumeCode } from "@/lib/verification";

export async function POST(request: NextRequest) {
  const { action, email, code, newPassword } = await request.json();

  // Password reset is the shortest path to someone else's account, so it gets
  // an IP ceiling on top of the per-code attempt counter.
  const ipLimit = await rateLimit(`reset:ip:${clientIp(request)}`, 20, 60 * 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже" },
      { status: 429 }
    );
  }

  if (!email) {
    return NextResponse.json({ error: "Укажите email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true } });
  if (!user) {
    // Don't reveal whether email exists
    return NextResponse.json({ message: "Если аккаунт существует, код будет отправлен" });
  }

  if (user.status === "BANNED") {
    return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
  }

  // Step 1: Send code
  if (action === "send-code") {
    const recent = await prisma.emailVerification.findFirst({
      where: { email, createdAt: { gte: new Date(Date.now() - 60000) } },
    });
    if (recent) {
      return NextResponse.json({ error: "Подождите минуту перед повторной отправкой" }, { status: 429 });
    }

    const verCode = generateCode();
    await prisma.emailVerification.create({
      data: {
        email,
        code: verCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        purpose: "reset_password",
      },
    });

    try {
      await sendVerificationCode(email, verCode);
    } catch {
      return NextResponse.json({ error: "Ошибка отправки кода" }, { status: 500 });
    }

    return NextResponse.json({ message: "Код отправлен на " + email });
  }

  // Step 2: Verify code + set new password
  if (action === "reset") {
    if (!code || !newPassword) {
      return NextResponse.json({ error: "Введите код и новый пароль" }, { status: 400 });
    }

    const strength = checkPassword(newPassword);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    const check = await consumeCode(email, code, "reset_password");
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    // Bumping sessionVersion evicts every existing session. Without it a reset
    // done because the account was compromised left the intruder logged in.
    await prisma.user.update({
      where: { email },
      data: { passwordHash: hash, sessionVersion: { increment: 1 } },
    });

    return NextResponse.json({ message: "Пароль успешно изменён!" });
  }

  return NextResponse.json({ error: "Укажите action: send-code или reset" }, { status: 400 });
}
