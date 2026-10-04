import { prisma } from "@/lib/prisma";
import { tFor } from "@/lib/i18n/for-locale";
import { consumeDeepLink } from "@/lib/notify-connect";
import type { ExternalChannel } from "@/lib/notification-events";
import { timingSafeEqual } from "node:crypto";

/** Inbound bot events (Telegram / MAX / VK webhooks) → finish the deep-link connection and answer the user. */

/** "ru-RU", "en", "zh-hans" ... → one of the site's locales. */
export function localeFromLangCode(code: string | undefined | null): "ru" | "en" | "cn" {
  const c = (code ?? "").toLowerCase();
  if (c.startsWith("zh")) return "cn";
  if (c.startsWith("en")) return "en";
  return "ru";
}

/** Constant-time compare of a secret header against the configured value; false when nothing is configured. */
export function secretMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Extracts the token from "/start <token>" (Telegram / MAX message text); undefined for a bare /start. */
export function tokenFromStartText(text: string | undefined | null): string | undefined {
  const m = (text ?? "").trim().match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/i);
  return m?.[1];
}

export async function handleBotStart(input: {
  channel: ExternalChannel;
  token: string | undefined;
  /** chat id / user id the notifications will be sent to */
  address: string;
  label?: string | null;
  langCode?: string | null;
  reply: (text: string) => Promise<unknown>;
}): Promise<"linked" | "help" | "failed"> {
  const t0 = tFor(localeFromLangCode(input.langCode));
  if (!input.token) {
    await input.reply(t0("ns.bot.help")).catch(() => {});
    return "help";
  }
  const r = await consumeDeepLink(input.channel, input.token, input.address, input.label ?? null);
  if (r.ok) {
    const user = await prisma.user.findUnique({ where: { id: r.userId }, select: { locale: true } });
    await input.reply(tFor(user?.locale)("ns.bot.linked")).catch(() => {});
    return "linked";
  }
  const key = r.reason === "expired" ? "ns.bot.expired" : r.reason === "used" ? "ns.bot.used" : "ns.bot.invalid";
  await input.reply(t0(key)).catch(() => {});
  return "failed";
}

/** The user blocked / stopped the bot: switch the channel off so we stop trying. */
export async function markChannelBlocked(channel: ExternalChannel, address: string, reason: string) {
  await prisma.notificationChannel.updateMany({
    // secret = a user's own Telegram bot: blocking the SITE bot (same private chat id) must not switch it off.
    where: { channel, address, secret: null },
    data: { enabled: false, lastError: reason.slice(0, 200) },
  });
}
