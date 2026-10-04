import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { limited, parseChannelParam, requireUserId, unauthorized } from "@/lib/notify-api";
import { ADAPTERS } from "@/lib/notify-channels";
import * as whatsapp from "@/lib/notify-channels/whatsapp";
import { sendNotificationEmailCode } from "@/lib/email";
import { connectAccountEmail, newWebhookSecret, startCode, startDeepLink } from "@/lib/notify-connect";
import { sendThroughChannel } from "@/lib/notify-dispatch";
import { assertResolvesPublic, validateOutboundUrl } from "@/lib/ssrf";

type Ctx = { params: Promise<{ channel: string }> };

const stripAt = (s: string | undefined) => (s ?? "").replace(/^@/, "").trim();

/**
 * POST — begin connecting a channel.
 *   telegram / max / vk : returns { deepLink } — the user taps it, the bot webhook completes the link
 *   email               : { useAccountEmail: true } connects at once; { email } sends a 6-digit code
 *   whatsapp            : { phone } sends a code in a template message
 *   webhook             : { url, label? } validates the URL, sends a signed test, returns the signing secret once
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { locale, t } = await getT();
  const channel = parseChannelParam((await params).channel);
  if (!channel) return NextResponse.json({ error: t("ns.err.invalid") }, { status: 404 });

  const blocked = await limited(`nstart:${userId}:${channel}`, 10, 60 * 60_000);
  if (blocked) return blocked;

  if (!ADAPTERS[channel].isConfigured()) {
    return NextResponse.json({ error: t("ns.err.notConfigured") }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  switch (channel) {
    case "telegram":
    case "max":
    case "vk": {
      const { token, expiresAt } = await startDeepLink(userId, channel);
      const deepLink =
        channel === "telegram"
          ? `https://t.me/${stripAt(process.env.TELEGRAM_BOT_USERNAME)}?start=${token}`
          : channel === "max"
            ? `https://max.ru/${stripAt(process.env.MAX_BOT_USERNAME)}?start=${token}`
            : `https://vk.me/${stripAt(process.env.VK_COMMUNITY_NAME)}?ref=${token}&ref_source=fomo_notifications`;
      return NextResponse.json({ ok: true, deepLink, expiresAt: expiresAt.toISOString() });
    }

    case "email": {
      if (body.useAccountEmail === true) {
        await connectAccountEmail(userId);
        return NextResponse.json({ ok: true, verified: true });
      }
      const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: t("ns.err.badEmail") }, { status: 400 });
      // Don't let one account turn us into a code cannon aimed at somebody else's inbox.
      const rcpt = await limited(`nstart-rcpt:email:${parsed.data.email}`, 3, 60 * 60_000);
      if (rcpt) return rcpt;
      const { code } = await startCode(userId, "email", parsed.data.email);
      const sent = await sendNotificationEmailCode(parsed.data.email, code, locale);
      if (!sent.ok) return NextResponse.json({ error: t("ns.err.sendFailed", { reason: sent.error ?? "" }) }, { status: 502 });
      return NextResponse.json({ ok: true, codeSent: true });
    }

    case "whatsapp": {
      const phone = whatsapp.normalizePhone(typeof body.phone === "string" ? body.phone : "");
      if (!phone) return NextResponse.json({ error: t("ns.err.badPhone") }, { status: 400 });
      const rcpt = await limited(`nstart-rcpt:whatsapp:${phone}`, 3, 60 * 60_000);
      if (rcpt) return rcpt;
      const { code } = await startCode(userId, "whatsapp", phone);
      const sent = await whatsapp.sendCode(phone, code, locale);
      if (!sent.ok) return NextResponse.json({ error: t("ns.err.sendFailed", { reason: sent.error ?? "" }) }, { status: 502 });
      return NextResponse.json({ ok: true, codeSent: true });
    }

    case "webhook": {
      const parsed = z.object({ url: z.string().trim().max(2000), label: z.string().trim().max(60).optional() }).safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: t("ns.err.invalid") }, { status: 400 });
      const check = validateOutboundUrl(parsed.data.url);
      if (!check.ok) return NextResponse.json({ error: t("ns.err.badUrl", { reason: check.reason }) }, { status: 400 });
      const resolved = await assertResolvesPublic(check.url.hostname);
      if (!resolved.ok) return NextResponse.json({ error: t("ns.err.badUrl", { reason: resolved.reason }) }, { status: 400 });

      const secret = newWebhookSecret();
      const row = await prisma.notificationChannel.upsert({
        where: { userId_channel: { userId, channel: "webhook" } },
        create: { userId, channel: "webhook", address: check.url.toString(), label: parsed.data.label || null, secret, verified: false, enabled: true },
        update: { address: check.url.toString(), label: parsed.data.label || null, secret, verified: false, enabled: true, linkTokenHash: null, linkExpiresAt: null, failCount: 0, lastError: null },
      });
      // The hook proves itself by accepting a signed test message (2xx).
      const result = await sendThroughChannel(
        { id: row.id, userId, channel: "webhook", address: row.address, secret },
        { title: t("ns.test.title"), body: t("ns.test.body"), link: "/profile?tab=notifications", locale }
      );
      if (!result.ok) return NextResponse.json({ error: t("ns.err.sendFailed", { reason: result.error ?? "" }) }, { status: 502 });
      await prisma.notificationChannel.update({ where: { id: row.id }, data: { verified: true, lastError: null, failCount: 0 } });
      return NextResponse.json({ ok: true, verified: true, secret });
    }
  }
}
