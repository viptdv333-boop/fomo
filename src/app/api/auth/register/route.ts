import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { generateFomoId } from "@/lib/fomoId";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(50),
  code: z.string().length(6),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    // Verify email code
    const verification = await prisma.emailVerification.findFirst({
      where: {
        email: data.email,
        code: data.code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "Неверный или просроченный код подтверждения" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing && existing.status === "APPROVED") {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    // Generate unique fomoId
    let fomoId = generateFomoId();
    for (let i = 0; i < 10; i++) {
      const exists = await prisma.user.findUnique({ where: { fomoId } });
      if (!exists) break;
      fomoId = generateFomoId();
    }

    // Mark code as used
    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    // If user exists with PENDING status, update them
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          displayName: data.displayName,
          status: "APPROVED",
        },
      });
    } else {
      // Create new user with APPROVED status (no admin approval needed)
      await prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          displayName: data.displayName,
          fomoId,
          status: "APPROVED",
        },
      });
    }

    return NextResponse.json({
      message: "Регистрация успешна! Теперь вы можете войти.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Ошибка сервера" },
      { status: 500 }
    );
  }
}
