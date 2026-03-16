import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const languages = await prisma.language.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true },
  });

  return NextResponse.json(languages);
}
