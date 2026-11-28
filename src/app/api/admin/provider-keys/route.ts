import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { isTerminalSite } from "@/lib/site-mode";
import { prisma } from "@/lib/prisma";
import { sealGlobalKey } from "@/lib/data/global-key";
import { checkKey } from "@/lib/data/validate";
import { cleanKey } from "@/lib/data/providers";
import { mirrorUserData } from "@/lib/account-mirror-client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isOwner(session.user) || isTerminalSite()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.terminalUserData.findMany({ where: { userId: session.user.id, kind: "global_provider_key" }, select: { key: true, data: true } });
  return NextResponse.json({ providers: rows.map((r) => ({ provider: r.key, enabled: !!(r.data as { enabled?: boolean }).enabled })) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !isOwner(session.user) || isTerminalSite()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!['twelvedata', 'databento'].includes(body?.provider)) return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 400 });
  const key = cleanKey(body.key); if (!key) return NextResponse.json({ error: "Неверный формат ключа" }, { status: 400 });
  const check = await checkKey(body.provider, key); if (check !== "ok") return NextResponse.json({ error: check === "invalid" ? "Ключ отклонён провайдером" : "Не удалось проверить ключ" }, { status: 422 });
  const encrypted = sealGlobalKey(key); if (!encrypted) return NextResponse.json({ error: "Не настроен секрет синхронизации" }, { status: 503 });
  const at = new Date(); const data = { encrypted, enabled: true };
  await prisma.terminalUserData.upsert({ where: { userId_kind_key: { userId: session.user.id, kind: "global_provider_key", key: body.provider } }, create: { userId: session.user.id, kind: "global_provider_key", key: body.provider, data, updatedAt: at }, update: { data, updatedAt: at } });
  mirrorUserData(session.user.id, session.user.email, "global_provider_key", body.provider, { at: at.getTime(), data });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !isOwner(session.user) || isTerminalSite()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider || !["twelvedata", "databento"].includes(provider)) return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 400 });
  const at = new Date(); const data = { enabled: false };
  await prisma.terminalUserData.upsert({ where: { userId_kind_key: { userId: session.user.id, kind: "global_provider_key", key: provider } }, create: { userId: session.user.id, kind: "global_provider_key", key: provider, data, updatedAt: at }, update: { data, updatedAt: at } });
  mirrorUserData(session.user.id, session.user.email, "global_provider_key", provider, { at: at.getTime(), data });
  return NextResponse.json({ ok: true });
}
