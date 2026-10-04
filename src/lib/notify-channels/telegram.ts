import { tgCall, escapeTelegramHtml } from "@/lib/tg-transport";
import { tFor } from "@/lib/i18n/for-locale";
import { absoluteLink, errMsg, suppressedNote, truncate, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * Telegram works in two modes that share one NotificationChannel row per user:
 *
 *  - OWN BOT (primary, needs no server config): the user creates a bot in
 *    @BotFather, pastes its token, presses Start in it. The token is stored in
 *    NotificationChannel.secret, the chat id in .address, "@botname" in .label.
 *    send() uses that token.
 *  - SITE BOT (optional extra): TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME are set,
 *    the user opens https://t.me/<TELEGRAM_BOT_USERNAME>?start=<token>; the
 *    webhook route stores the chat id and leaves .secret empty, so send() falls
 *    back to the env token.
 *
 * Transport (relay/proxy) is shared with the legacy flow in src/lib/telegram.ts
 * through tg-transport.ts. The bot token is never logged or returned to a client.
 */

/** Always true: a user can bring their own bot, so the channel never depends on the admin. */
export function isConfigured(): boolean {
  return true;
}

/** Is the optional site bot (deep-link flow) available? */
export function siteBotConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}

export function buildTelegramPayload(chatId: string, msg: ChannelMessage) {
  const t = tFor(msg.locale);
  const link = absoluteLink(msg.link, msg.locale);
  const note = suppressedNote(msg);
  const text = truncate(
    [`<b>${escapeTelegramHtml(msg.title)}</b>`, msg.body ? escapeTelegramHtml(truncate(msg.body, 3000)) : "", note ? `<i>${escapeTelegramHtml(note)}</i>` : ""]
      .filter(Boolean)
      .join("\n"),
    4000
  );
  return {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(link ? { reply_markup: { inline_keyboard: [[{ text: t("ns.open"), url: link }]] } } : {}),
  };
}

/** Errors after which retrying is pointless: the user blocked / deleted the bot or the chat is gone. */
export function isPermanentTelegramError(code: number | undefined, description: string | undefined): boolean {
  if (code === 403) return true;
  return code === 400 && /chat not found|user is deactivated|peer_id_invalid|bot was kicked/i.test(description ?? "");
}

export async function send(row: ChannelRowLite, msg: ChannelMessage): Promise<SendResult> {
  // The user's own bot wins; rows connected through the site bot have no secret.
  const own = row.secret || "";
  const token = own || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  if (!row.address) return { ok: false, error: "no chat id", permanent: true };
  try {
    const r = await tgCall(token, "sendMessage", buildTelegramPayload(row.address, msg));
    if (r.ok) return { ok: true };
    return {
      ok: false,
      error: (r.description || `Telegram ${r.error_code ?? "error"}`).slice(0, 200),
      // 401 on an own bot = the token was revoked in @BotFather: retrying is pointless too.
      permanent: isPermanentTelegramError(r.error_code, r.description) || (Boolean(own) && r.error_code === 401),
    };
  } catch (e) {
    // The token sits in the request URL: make sure it can't end up in lastError / logs.
    const m = errMsg(e);
    return { ok: false, error: own ? m.split(own).join("***") : m };
  }
}

/** Plain HTML message to a chat (confirmation after /start <token>). */
export async function sendRaw(chatId: string, text: string): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  try {
    const r = await tgCall(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
    return r.ok ? { ok: true } : { ok: false, error: r.description };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
