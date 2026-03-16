import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { generateFomoId } from "@/lib/fomoId";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(50),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    // Generate unique fomoId with retry
    let fomoId = generateFomoId();
    for (let i = 0; i < 10; i++) {
      const exists = await prisma.user.findUnique({ where: { fomoId } });
      if (!exists) break;
      fomoId = generateFomoId();
    }

    await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        fomoId,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      message: "Заявка отправлена на рассмотрение администратора",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Ошибка сервера" },
      { status: 500 }
    );
  }
}
