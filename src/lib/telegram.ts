import { prisma } from "@/lib/prisma";
import { getT, tFor } from "@/lib/i18n/server";
import { renderNotifText, type NotifText } from "@/lib/notifications";
import { escapeTelegramHtml, tgCall } from "@/lib/tg-transport";

// Transport (relay / proxy / escaping) lives in tg-transport.ts so the site-bot
// notification channel can share it without pulling next/headers.
export { escapeTelegramHtml } from "@/lib/tg-transport";
const call = tgCall;

/// Translator for errors returned to the user who made the current request:
/// an explicit locale wins, else the request's own language (URL/cookie),
/// else ru when called outside a request scope.
async function requestT(locale?: string) {
  if (locale) return tFor(locale);
  try {
    return (await getT()).t;
  } catch {
    return tFor("ru");
  }
}

/// Confirms the token is real and returns the bot's own @username for display.
export async function verifyBotToken(
  botToken: string,
  locale?: string
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const t = await requestT(locale);
  try {
    const data = await call<{ username: string }>(botToken, "getMe");
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description || t("notif.err.tgBadToken") };
    }
    return { ok: true, username: data.result.username };
  } catch {
    return { ok: false, error: t("notif.err.tgUnreachable") };
  }
}

/// Finds the chat id of whoever has messaged this bot — the subscriber's own
/// DM with their own newly-created bot, since they're the only person who
/// can know its token. Picks the most recent message across every update
/// getUpdates still has buffered.
export async function resolveChatId(
  botToken: string,
  locale?: string
): Promise<{ ok: true; chatId: string } | { ok: false; error: string }> {
  const t = await requestT(locale);
  try {
    const data = await call<Array<{ message?: { chat: { id: number } } }>>(botToken, "getUpdates", { limit: 100 });
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description || t("notif.err.tgNoUpdates") };
    }
    const withMessage = data.result.filter((u) => u.message?.chat?.id != null);
    if (withMessage.length === 0) {
      return { ok: false, error: t("notif.err.tgSendFirst") };
    }
    const last = withMessage[withMessage.length - 1];
    return { ok: true, chatId: String(last.message!.chat.id) };
  } catch {
    return { ok: false, error: t("notif.err.tgUnreachable") };
  }
}

/// `locale` only picks the language of the fallback error (stored as the
/// recipient's TelegramAccount.lastError); the message text is sent as given.
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  locale?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await call(botToken, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    if (!data.ok) return { ok: false, error: data.description || tFor(locale)("notif.err.tgRejected") };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/// Forwards a channel event (new paid setup, or a chat message posted in the
/// channel's discussion) to every active subscriber who opted in and has a
/// verified bot. Best-effort per recipient, mirroring src/lib/push.ts: one
/// subscriber's dead/blocked bot never blocks delivery to the others.
async function deliverToUser(userId: string, text: NotifText, locale: string | undefined): Promise<void> {
  const acc = await prisma.telegramAccount.findUnique({ where: { userId } });
  if (!acc?.chatId) return;

  // Keyed texts are rendered in the recipient's language; every substituted
  // value is HTML-escaped here, so callers pass raw user content in vars and
  // the <b> markup in the dictionary template survives. A plain string is
  // sent as-is — the caller has already escaped it.
  const rendered = renderNotifText(text, locale, escapeTelegramHtml);
  const result = await sendTelegramMessage(acc.botToken, acc.chatId, rendered, locale);
  if (result.ok) {
    if (acc.lastError) {
      await prisma.telegramAccount.update({ where: { userId }, data: { lastError: null } }).catch(() => {});
    }
  } else {
    // Bot blocked/deleted by the user, or token revoked — record it so the
    // profile UI can surface "reconnect your bot" instead of silently
    // never delivering again.
    await prisma.telegramAccount.update({ where: { userId }, data: { lastError: result.error || "Unknown error" } }).catch(() => {});
  }
}

/// `text`: a plain string (already HTML-escaped by the caller) or
/// `{ key, vars }` with RAW vars — escaped per value in deliverToUser.
export async function notifyChannelTelegramSubscribers(tariffId: string, text: NotifText): Promise<void> {
  const tariff = await prisma.subscriptionTariff.findUnique({
    where: { id: tariffId },
    select: {
      authorId: true,
      authorTelegramNotify: true,
      subscriptions: {
        where: { status: "active", endDate: { gt: new Date() }, telegramNotify: true },
        select: { subscriberId: true },
      },
    },
  });
  if (!tariff) return;

  const recipientIds = tariff.subscriptions.map((s) => s.subscriberId);
  // Владелец получает копию своих же сообщений отдельным флагом — он не
  // подписчик собственного канала, поэтому не попадает в список выше.
  if (tariff.authorTelegramNotify) recipientIds.push(tariff.authorId);

  const locales = new Map<string, string>();
  // Always loaded (one query): even a plain-string message needs the
  // recipient's language for a translated lastError fallback.
  if (recipientIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(recipientIds)] } },
      select: { id: true, locale: true },
    });
    for (const u of users) locales.set(u.id, u.locale);
  }

  await Promise.all(recipientIds.map((userId) => deliverToUser(userId, text, locales.get(userId))));
}
