import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getT } from "@/lib/i18n/server";
import { limited, parseChannelParam, requireUserId, unauthorized } from "@/lib/notify-api";
import { confirmCode } from "@/lib/notify-connect";
import { confirmOwnBot } from "@/lib/notify-own-bot";
import { sendThroughChannel } from "@/lib/notify-dispatch";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ channel: string }> };

// POST { code } — finish the e-mail / WhatsApp flow with the 6-digit code.
// POST (telegram, no body) — "I pressed Start in my bot": find the chat id via getUpdates, verify the channel, send a test message.
export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { locale, t } = await getT();
  const channel = parseChannelParam((await params).channel);

  if (channel === "telegram") {
    // The card polls this every few seconds while waiting for Start; each call is one getUpdates.
    const limit = await limited(`nconfirm-tg:${userId}`, 40, 60_000);
    if (limit) return limit;
    const r = await confirmOwnBot(userId, locale);
    if (!r.ok) {
      const error = r.reason === "expired" ? t("ns.tg.bot.expired") : r.reason === "no_pending" ? t("ns.tg.bot.noPending") : r.error ?? t("ns.err.invalid");
      return NextResponse.json({ error, reason: r.reason }, { status: r.reason === "telegram" ? 400 : 409 });
    }
    if (r.alreadyVerified) return NextResponse.json({ ok: true, verified: true });
    // Prove it end to end with a real message (recorded on the row like any send).
    const row = await prisma.notificationChannel.findUnique({ where: { id: r.rowId } });
    let testError: string | undefined;
    if (row) {
      const sent = await sendThroughChannel(
        { id: row.id, userId, channel: "telegram", address: row.address, secret: row.secret },
        { title: t("ns.test.title"), body: t("ns.test.body"), link: "/profile?tab=notifications", locale }
      );
      if (!sent.ok) testError = sent.error ?? "";
    }
    return NextResponse.json({ ok: true, verified: true, ...(testError !== undefined ? { testError } : {}) });
  }
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
