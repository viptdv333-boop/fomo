import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { generateFomoId } from "@/lib/fomoId";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkPassword, normalizeEmail, isDisposableEmail, MIN_PASSWORD_LENGTH } from "@/lib/account-security";
import { consumeCode } from "@/lib/verification";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  displayName: z.string().min(2).max(50),
  code: z.string().length(6),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    // Ceiling on how fast codes can be thrown at the endpoint from one source,
    // on top of the per-code attempt counter below.
    const ipLimit = await rateLimit(`register:ip:${clientIp(req)}`, 20, 60 * 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте позже" },
        { status: 429 }
      );
    }

    const strength = checkPassword(data.password);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    if (isDisposableEmail(data.email)) {
      return NextResponse.json(
        { error: "Одноразовые почтовые адреса не поддерживаются" },
        { status: 400 }
      );
    }

    // Counts the guess and burns the code after too many misses, instead of the
    // old bare lookup that let a six-digit secret be ground down for free.
    const check = await consumeCode(data.email, data.code);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    // Check if user already exists — including aliases of the same mailbox.
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    // Only an abandoned signup (PENDING — never finished/approved) is safe to
    // let a new registration attempt overwrite. An APPROVED or BANNED account
    // is a real, already-owned account: silently resetting its password here
    // would be an account-takeover bug, not a "resume signup" convenience.
    if (existing && existing.status !== "PENDING") {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 400 }
      );
    }
    const normalized = normalizeEmail(data.email);
    const approved = await prisma.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, email: true },
    });
    const aliasOwner = approved.find((u) => normalizeEmail(u.email) === normalized);
    if (aliasOwner) {
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
