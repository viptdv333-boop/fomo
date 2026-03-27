import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { newEmail, password } = await request.json();

  if (!newEmail || !password) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
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

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) {
    return NextResponse.json({ error: "Email уже используется" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { email: newEmail },
  });

  return NextResponse.json({ message: "Email изменён" });
}
