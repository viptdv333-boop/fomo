import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode, generateCode } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email обязателен" }, { status: 400 });
    }

    // Check if user already exists with this email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.status === "APPROVED") {
      return NextResponse.json({ error: "Пользователь с таким email уже зарегистрирован" }, { status: 400 });
    }

    // Rate limit: max 1 code per 60 seconds per email
    const recentCode = await prisma.emailVerification.findFirst({
      where: {
        email,
        createdAt: { gt: new Date(Date.now() - 60000) },
      },
    });
    if (recentCode) {
      return NextResponse.json({ error: "Подождите минуту перед повторной отправкой" }, { status: 429 });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.emailVerification.create({
      data: { email, code, expiresAt },
    });

    await sendVerificationCode(email, code);

    return NextResponse.json({ message: "Код отправлен на " + email });
  } catch (error) {
    console.error("Send code error:", error);
    return NextResponse.json({ error: "Ошибка отправки кода" }, { status: 500 });
  }
}
