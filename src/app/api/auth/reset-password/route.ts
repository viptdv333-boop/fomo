import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode, generateCode } from "@/lib/email";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  const { action, email, code, newPassword } = await request.json();

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
      data: { email, code: verCode, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
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
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
    }

    const verification = await prisma.emailVerification.findFirst({
      where: { email, code, used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!verification) {
      return NextResponse.json({ error: "Неверный или просроченный код" }, { status: 400 });
    }

    await prisma.emailVerification.update({ where: { id: verification.id }, data: { used: true } });

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { email }, data: { passwordHash: hash } });

    return NextResponse.json({ message: "Пароль успешно изменён!" });
  }

  return NextResponse.json({ error: "Укажите action: send-code или reset" }, { status: 400 });
}
