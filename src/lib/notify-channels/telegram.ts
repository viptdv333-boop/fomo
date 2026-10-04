import { tgCall, escapeTelegramHtml } from "@/lib/tg-transport";
import { tFor } from "@/lib/i18n/for-locale";
import { absoluteLink, errMsg, suppressedNote, truncate, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * The SITE's Telegram bot (TELEGRAM_BOT_TOKEN), as opposed to the legacy
 * "my own bot" flow in src/lib/telegram.ts. The user connects by opening
 * https://t.me/<TELEGRAM_BOT_USERNAME>?start=<token>; the webhook route stores
 * the chat id (NotificationChannel.address). Transport (relay/proxy) is shared
 * with the legacy flow through tg-transport.ts.
 */

export function isConfigured(): boolean {
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
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  if (!row.address) return { ok: false, error: "no chat id", permanent: true };
  try {
    const r = await tgCall(token, "sendMessage", buildTelegramPayload(row.address, msg));
    if (r.ok) return { ok: true };
    return {
      ok: false,
      error: (r.description || `Telegram ${r.error_code ?? "error"}`).slice(0, 200),
      permanent: isPermanentTelegramError(r.error_code, r.description),
    };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
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
