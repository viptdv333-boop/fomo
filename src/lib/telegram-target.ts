/**
 * Where a user's Telegram messages go. FOMO has TWO connections of a personal bot:
 *
 *  - "account": the old TelegramAccount row (botToken + chatId), made by /api/telegram/account;
 *  - "channel": the NotificationChannel row of «Настройки уведомлений → Telegram» (own bot: secret = token,
 *    address = chat id; or the site bot: no secret, the env token is used). New users get ONLY this one.
 *
 * The per-channel forwarding of a paid channel (Subscription.telegramNotify, the «Получать в Telegram» switch,
 * bot-terminal posts) used to look at the first one only, so a subscriber who connected his bot the current way could
 * neither switch it on nor receive the posts. Every code path that needs "can this user get Telegram messages, and
 * where" goes through here. Next-free, the db is injected (scripts/check-telegram-channel-notify.ts uses a fake one).
 */

export interface TgTarget {
  botToken: string;
  chatId: string;
  source: "account" | "channel";
}

interface AccountRow {
  userId: string;
  botToken: string;
  chatId: string | null;
}
interface ChannelRow {
  userId: string;
  address: string | null;
  secret: string | null;
}
export interface TgTargetDb {
  // `any` args: the real PrismaClient has generic, select-dependent signatures that a structural type cannot mirror.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  telegramAccount: { findMany(args: any): PromiseLike<AccountRow[]> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notificationChannel: { findMany(args: any): PromiseLike<ChannelRow[]> };
}

/** Delivery target per user (users without any working connection are absent). The old account wins when both exist. */
export async function resolveTelegramTargets(db: TgTargetDb, userIds: string[], siteBotToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN): Promise<Map<string, TgTarget>> {
  const out = new Map<string, TgTarget>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return out;
  const [accounts, channels] = await Promise.all([
    db.telegramAccount.findMany({ where: { userId: { in: ids } }, select: { userId: true, botToken: true, chatId: true } }),
    db.notificationChannel.findMany({
      where: { userId: { in: ids }, channel: "telegram", verified: true, enabled: true, address: { not: null } },
      select: { userId: true, address: true, secret: true },
    }),
  ]);
  for (const c of channels) {
    const botToken = c.secret || siteBotToken || "";
    if (c.address && botToken) out.set(c.userId, { botToken, chatId: c.address, source: "channel" });
  }
  for (const a of accounts) {
    if (a.chatId && a.botToken) out.set(a.userId, { botToken: a.botToken, chatId: a.chatId, source: "account" });
  }
  return out;
}

export async function hasTelegramTarget(db: TgTargetDb, userId: string, siteBotToken?: string): Promise<boolean> {
  return (await resolveTelegramTargets(db, [userId], siteBotToken)).has(userId);
}

/** Error text without the bot token (it sits in the request URL of a failed fetch). */
export function scrubToken(message: string, token: string): string {
  return token ? message.split(token).join("***") : message;
}
