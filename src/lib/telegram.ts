import { prisma } from "@/lib/prisma";
import { getT, tFor } from "@/lib/i18n/server";
import { renderNotifText, type NotifText } from "@/lib/notifications";
import { escapeTelegramHtml, tgCall } from "@/lib/tg-transport";
import { isEnabled, type EventId } from "@/lib/notification-events";
import { sendTelegramBundle } from "@/lib/notify-channels/telegram";
import type { ChannelMessage } from "@/lib/notify-channels/types";
import { resolveTelegramTargets, scrubToken, type TgTarget } from "@/lib/telegram-target";

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
  locale?: string,
  /// false: send as plain text (no parse_mode) — for a text that had to be cut and so can no longer be valid HTML.
  html = true
): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await call(botToken, "sendMessage", {
      chat_id: chatId,
      text,
      ...(html ? { parse_mode: "HTML" } : {}),
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
/// The FULL content of a channel post for the legacy own-bot forwarding. Recipients here are the
/// channel's active subscribers (+ its owner) — exactly the audience that may read the post.
export interface RichChannelPost {
  /// Heading, rendered per recipient (RAW vars — it is escaped when the message is built).
  title: NotifText;
  author?: string;
  /// Full plain text of the post.
  fullText: string;
  /// Site path of the post ("/ideas/<id>"); becomes the «Open on the site» button.
  link: string;
  images?: string[];
}

/// Telegram refuses a message over 4096 characters — and a teaser carries user text (chat message, preview). Values are
/// capped before escaping; if the result is still too long it goes out as cut plain text rather than not at all.
export const TG_TEXT_LIMIT = 4000;
export function renderTeaser(text: NotifText, locale: string | undefined): { text: string; html: boolean } {
  const toPlain = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const cutPlain = (h: string) => ({ text: toPlain(h).slice(0, TG_TEXT_LIMIT - 1) + "…", html: false });
  // A plain string is already escaped by the caller (cannot be cut safely): only its length is checked.
  if (typeof text === "string") return text.length <= TG_TEXT_LIMIT ? { text, html: true } : cutPlain(text);
  const cap = (max: number) => (s: string) => escapeTelegramHtml(s.length > max ? s.slice(0, max - 1) + "…" : s);
  const html = renderNotifText(text, locale, cap(1200));
  if (html.length <= TG_TEXT_LIMIT) return { text: html, html: true };
  const small = renderNotifText(text, locale, cap(300));
  return small.length <= TG_TEXT_LIMIT ? { text: small, html: true } : cutPlain(html);
}

/// A failed forward must be visible: one line in the log (no token, no message text) and the reason on the row the
/// recipient sees in their settings (TelegramAccount.lastError / NotificationChannel.lastError).
async function recordForwardFailure(userId: string, target: TgTarget, error: string): Promise<void> {
  const msg = scrubToken(error, target.botToken).slice(0, 300);
  console.warn(`[tg] channel forward to user ${userId} via ${target.source} failed: ${msg}`);
  if (target.source === "account") {
    await prisma.telegramAccount.update({ where: { userId }, data: { lastError: msg } }).catch(() => {});
  } else {
    await prisma.notificationChannel.update({ where: { userId_channel: { userId, channel: "telegram" } }, data: { lastError: msg } }).catch(() => {});
  }
}

async function recordForwardOk(userId: string, target: TgTarget): Promise<void> {
  if (target.source === "account") {
    await prisma.telegramAccount.updateMany({ where: { userId, lastError: { not: null } }, data: { lastError: null } }).catch(() => {});
  } else {
    await prisma.notificationChannel.updateMany({ where: { userId, channel: "telegram", lastError: { not: null } }, data: { lastError: null } }).catch(() => {});
  }
}

async function deliverToUser(userId: string, target: TgTarget, text: NotifText, locale: string | undefined, rich?: RichChannelPost): Promise<void> {
  if (rich) {
    // Full text: several messages (<= 4096 each) + the first picture, via the shared builder.
    const msg: ChannelMessage = {
      title: renderNotifText(rich.title, locale),
      link: rich.link,
      locale: locale ?? "ru",
      fullText: rich.fullText,
      author: rich.author,
      images: rich.images,
    };
    const r = await sendTelegramBundle(target.botToken, target.chatId, msg).catch((e) => ({ ok: false as const, description: e instanceof Error ? e.message : String(e) }));
    if (r.ok) await recordForwardOk(userId, target);
    else await recordForwardFailure(userId, target, r.description || tFor(locale)("notif.err.tgRejected"));
    return;
  }

  // Keyed texts are rendered in the recipient's language; every substituted
  // value is HTML-escaped here, so callers pass raw user content in vars and
  // the <b> markup in the dictionary template survives. A plain string is
  // sent as-is — the caller has already escaped it.
  const fit = renderTeaser(text, locale);
  const result = await sendTelegramMessage(target.botToken, target.chatId, fit.text, locale, fit.html);
  if (result.ok) await recordForwardOk(userId, target);
  // Bot blocked/deleted by the user, or token revoked — record it so the
  // profile UI can surface "reconnect your bot" instead of silently
  // never delivering again.
  else await recordForwardFailure(userId, target, result.error || "Unknown error");
}

/// `text`: a plain string (already HTML-escaped by the caller) or
/// `{ key, vars }` with RAW vars — escaped per value in deliverToUser.
///
/// `opts.dedupeEvent`: the caller ALSO runs the preference-aware dispatcher for this
/// event (notifyChannelSubscribers). A subscriber whose Telegram channel in Notification
/// settings is connected, on and enabled for that event, with the SAME bot and chat as the
/// legacy account, already gets it there — skip the legacy copy so they get one message.
///
/// `opts.rich`: send the whole post (title + author + full text, split into <= 4096-char messages,
/// button to the site) instead of the `text` teaser.
export async function notifyChannelTelegramSubscribers(
  tariffId: string,
  text: NotifText,
  opts: { dedupeEvent?: EventId; rich?: RichChannelPost } = {}
): Promise<void> {
  // The callers fire this after the post is saved and used to swallow everything with .catch(() => {}): log instead.
  try {
    await forwardToChannelSubscribers(tariffId, text, opts);
  } catch (e) {
    console.warn(`[tg] channel forward for tariff ${tariffId} failed:`, e instanceof Error ? e.message : e);
  }
}

async function forwardToChannelSubscribers(
  tariffId: string,
  text: NotifText,
  opts: { dedupeEvent?: EventId; rich?: RichChannelPost }
): Promise<void> {
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

  let recipients = [...new Set(recipientIds)];
  const targets = await resolveTelegramTargets(prisma, recipients).catch((e) => {
    console.warn("[tg] channel forward: target lookup failed:", e instanceof Error ? e.message : e);
    return new Map<string, TgTarget>();
  });
  // Nothing to send to: a subscriber with the switch on but no working bot (never connected, bot removed, channel off).
  recipients = recipients.filter((id) => targets.has(id));

  if (opts.dedupeEvent && recipients.length > 0) {
    const event = opts.dedupeEvent;
    const [channels, prefs] = await Promise.all([
      prisma.notificationChannel.findMany({
        where: { userId: { in: recipients }, channel: "telegram", verified: true, enabled: true, address: { not: null } },
        select: { userId: true, address: true, secret: true },
      }),
      prisma.notificationPref.findMany({ where: { userId: { in: recipients }, event, channel: "telegram" }, select: { userId: true, event: true, channel: true, enabled: true } }),
    ]).catch(() => [[], []] as [never[], never[]]);
    const prefByUser = new Map(prefs.map((p) => [p.userId, { [`${p.event}:${p.channel}`]: p.enabled }]));
    const covered = new Set(
      channels
        .filter((c) => {
          // The author is not a dispatcher recipient of their own post.
          if (c.userId === tariff.authorId || !isEnabled(event, "telegram", prefByUser.get(c.userId))) return false;
          const t = targets.get(c.userId);
          // Connected only through Notification settings: the dispatcher's message IS this one. With an old account as
          // well, it is covered only when both point at the same bot and chat (else two different bots get one each).
          return !t || t.source === "channel" || (t.botToken === c.secret && t.chatId === c.address);
        })
        .map((c) => c.userId)
    );
    recipients = recipients.filter((id) => !covered.has(id));
  }

  const locales = new Map<string, string>();
  // Always loaded (one query): even a plain-string message needs the
  // recipient's language for a translated lastError fallback.
  if (recipients.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: recipients } },
      select: { id: true, locale: true },
    });
    for (const u of users) locales.set(u.id, u.locale);
  }

  await Promise.all(recipients.map((userId) => deliverToUser(userId, targets.get(userId)!, text, locales.get(userId), opts.rich).catch((e) => console.warn(`[tg] channel forward to user ${userId} crashed: ${scrubToken(e instanceof Error ? e.message : String(e), targets.get(userId)!.botToken)}`))));
}
