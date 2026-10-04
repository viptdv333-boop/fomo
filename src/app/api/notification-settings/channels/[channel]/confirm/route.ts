import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getT } from "@/lib/i18n/server";
import { limited, parseChannelParam, requireUserId, unauthorized } from "@/lib/notify-api";
import { confirmCode } from "@/lib/notify-connect";

type Ctx = { params: Promise<{ channel: string }> };

// POST { code } — finish the e-mail / WhatsApp flow with the 6-digit code.
export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { t } = await getT();
  const channel = parseChannelParam((await params).channel);
  if (channel !== "email" && channel !== "whatsapp") return NextResponse.json({ error: t("ns.err.invalid") }, { status: 404 });

  // On top of the per-code attempt cap in confirmCode(): a slow drip across many fresh codes.
  const blocked = await limited(`nconfirm:${userId}:${channel}`, 20, 60 * 60_000);
  if (blocked) return blocked;

  const parsed = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t("ns.err.badCode") }, { status: 400 });

  const r = await confirmCode(userId, channel, parsed.data.code);
  if (r.ok) return NextResponse.json({ ok: true });
  const key = r.reason === "expired" ? "ns.err.codeExpired" : r.reason === "too_many" ? "ns.err.codeTooMany" : r.reason === "no_pending" ? "ns.err.codeNone" : "ns.err.badCode";
  return NextResponse.json({ error: t(key) }, { status: r.reason === "too_many" ? 429 : 400 });
}
