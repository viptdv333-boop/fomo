import { prisma } from "@/lib/prisma";
import { LINK_TOKEN_TTL_MS, isTelegramBotToken } from "@/lib/notify-link";
import { resolveChatId, verifyBotToken } from "@/lib/telegram";

/**
 * Telegram "my own bot" connect flow (DB side). One NotificationChannel row per user:
 *   start   : token checked with getMe → row { secret: token, label: "@bot", address: null, verified: false }
 *   confirm : after the user pressed Start in their bot, getUpdates yields the chat id
 *             → row { address: chatId, verified: true }
 * The token lives in `secret` and is never returned by any API (see loadSettings) nor logged.
 * Calls to Telegram go only through tgCall (api.telegram.org or the configured relay).
 */

export type StartOwnBot = { ok: true; username: string; expiresAt: Date } | { ok: false; error: string; badToken?: boolean };

export async function startOwnBot(userId: string, rawToken: string, locale?: string): Promise<StartOwnBot> {
  const botToken = rawToken.trim();
  if (!isTelegramBotToken(botToken)) return { ok: false, error: "", badToken: true };
  const check = await verifyBotToken(botToken, locale);
  if (!check.ok) return { ok: false, error: check.error };

  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
  const label = `@${check.username}`;
  await prisma.notificationChannel.upsert({
    where: { userId_channel: { userId, channel: "telegram" } },
    create: { userId, channel: "telegram", address: null, label, secret: botToken, verified: false, enabled: true, linkExpiresAt: expiresAt },
    // A new bot has never been messaged: the old chat id doesn't apply, re-verify from scratch.
    update: { address: null, label, secret: botToken, verified: false, enabled: true, linkTokenHash: null, linkExpiresAt: expiresAt, attempts: 0, failCount: 0, lastError: null },
  });
  return { ok: true, username: check.username, expiresAt };
}

export type ConfirmOwnBot =
  | { ok: true; rowId: string; alreadyVerified: boolean }
  | { ok: false; reason: "no_pending" | "expired" | "telegram"; error?: string };

export async function confirmOwnBot(userId: string, locale?: string): Promise<ConfirmOwnBot> {
  const row = await prisma.notificationChannel.findUnique({ where: { userId_channel: { userId, channel: "telegram" } } });
  if (!row || !row.secret) return { ok: false, reason: "no_pending" };
  if (row.verified && row.address) return { ok: true, rowId: row.id, alreadyVerified: true };
  if (!row.linkExpiresAt || row.linkExpiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const chat = await resolveChatId(row.secret, locale);
  if (!chat.ok) return { ok: false, reason: "telegram", error: chat.error };

  // Claim only while the row still holds the token we resolved with (the user may have changed the bot meanwhile).
  const r = await prisma.notificationChannel.updateMany({
    where: { id: row.id, secret: row.secret, verified: false },
    data: { address: chat.chatId, verified: true, enabled: true, linkTokenHash: null, linkExpiresAt: null, attempts: 0, failCount: 0, lastError: null },
  });
  if (r.count !== 1) return { ok: false, reason: "no_pending" };
  return { ok: true, rowId: row.id, alreadyVerified: false };
}
