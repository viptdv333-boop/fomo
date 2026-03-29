import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { writeFile, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const allowedTypes = [
    "image/png", "image/jpeg", "image/gif", "image/svg+xml",
    "image/x-icon", "image/vnd.microsoft.icon", "image/webp",
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Max 2MB" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "ico";
  const filename = `favicon-${randomUUID().slice(0, 8)}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "favicon");

  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, buffer);

  const url = `/uploads/favicon/${filename}`;

  // Save to DB immediately
  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", faviconUrl: url },
    update: { faviconUrl: url },
  });

  return NextResponse.json({ url });
}
