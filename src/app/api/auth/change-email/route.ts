import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendVerificationCode, generateCode } from "@/lib/email";

// Step 1: POST with { action: "send-code", newEmail, password }
// Step 2: POST with { action: "verify", newEmail, code }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, newEmail, password, code } = body;

  if (!newEmail) {
    return NextResponse.json({ error: "Укажите новый email" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }

  // Check email not taken
  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) {
    return NextResponse.json({ error: "Email уже используется" }, { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  if (user.email === newEmail) {
    return NextResponse.json({ error: "Это ваш текущий email" }, { status: 400 });
  }

  // STEP 1: Send verification code to new email
  if (action === "send-code") {
    if (!password) {
      return NextResponse.json({ error: "Введите пароль" }, { status: 400 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
    }

    // Rate limit: 60s
    const recent = await prisma.emailVerification.findFirst({
      where: { email: newEmail, createdAt: { gte: new Date(Date.now() - 60000) } },
    });
    if (recent) {
      return NextResponse.json({ error: "Подождите минуту перед повторной отправкой" }, { status: 429 });
    }

    const verCode = generateCode();
    await prisma.emailVerification.create({
      data: {
        email: newEmail,
        code: verCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    try {
      await sendVerificationCode(newEmail, verCode);
    } catch {
      return NextResponse.json({ error: "Ошибка отправки кода" }, { status: 500 });
    }

    return NextResponse.json({ message: "Код отправлен на " + newEmail });
  }

  // STEP 2: Verify code and change email
  if (action === "verify") {
    if (!code) {
      return NextResponse.json({ error: "Введите код" }, { status: 400 });
    }

    const verification = await prisma.emailVerification.findFirst({
      where: {
        email: newEmail,
        code,
        used: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!verification) {
      return NextResponse.json({ error: "Неверный или просроченный код" }, { status: 400 });
    }

    // Mark code as used
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    // Update email
    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: newEmail },
    });

    return NextResponse.json({ message: "Email успешно изменён! Перезайдите для обновления сессии." });
  }

  return NextResponse.json({ error: "Укажите action: send-code или verify" }, { status: 400 });
}
