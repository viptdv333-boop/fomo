import { tgCall, escapeTelegramHtml } from "@/lib/tg-transport";
import { tFor } from "@/lib/i18n/for-locale";
import { absoluteAsset, escapeHtml, fullLayout, splitByBudgets } from "@/lib/notify-text";
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

/** Telegram's hard limit is 4096 chars per message; 4000 leaves room for the markup we add. */
const TG_LIMIT = 4000;
/** A long text is split into at most this many messages; the rest is cut with "read the full text on the site". */
export const TG_MAX_PARTS = 4;
/** Pause between the parts of one notification (Telegram allows ~1 message per second into one chat). */
const PART_GAP_MS = 350;

export interface TelegramPayload {
  chat_id: string;
  text: string;
  parse_mode: "HTML";
  disable_web_page_preview: boolean;
  reply_markup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
}

/**
 * The message(s) for one notification. Without `msg.fullText` this is the classic single teaser
 * (buildTelegramPayload). With it: title (bold) + author + the full text, HTML-escaped and split on
 * paragraph / sentence / word boundaries into at most TG_MAX_PARTS messages of <= 4000 chars each
 * (measured after escaping, so no tag or entity is ever cut). Parts after the first start with an
 * italic "(2/3)"; the "open on the site" button sits on the LAST part only; a text that does not
 * fit ends with "... read the full text on the site".
 */
export function buildTelegramMessages(chatId: string, msg: ChannelMessage): TelegramPayload[] {
  if (!msg.fullText) return [buildTelegramPayload(chatId, msg) as TelegramPayload];
  const t = tFor(msg.locale);
  const link = absoluteLink(msg.link, msg.locale);
  const note = suppressedNote(msg);
  const layout = fullLayout({ ...msg, title: truncate(msg.title, 500), author: msg.author ? truncate(msg.author, 120) : undefined });

  const head =
    `<b>${escapeHtml(layout.title)}</b>` +
    (layout.author ? `\n<i>${escapeHtml(layout.author)}</i>` : "") +
    (layout.subtitle ? `\n${escapeHtml(truncate(layout.subtitle, 400))}` : "") +
    "\n\n";
  const footer = note ? `\n\n<i>${escapeHtml(note)}</i>` : "";
  const readMore = `\n\n<i>${escapeHtml(t("ns.readFull"))}</i>`;
  const marker = (i: number, n: number) => `<i>(${i}/${n})</i>\n`;
  const MARKER = 14; // length of "<i>(4/4)</i>" + newline

  const budgetsFor = (reserve: number) =>
    Array.from({ length: TG_MAX_PARTS }, (_, i) => TG_LIMIT - (i === 0 ? head.length : MARKER) - footer.length - (i === TG_MAX_PARTS - 1 ? reserve : 0));
  let split = splitByBudgets(layout.text, budgetsFor(0));
  if (split.truncated) split = splitByBudgets(layout.text, budgetsFor(readMore.length));

  if (split.parts.length === 0) split.parts.push("");
  const n = split.parts.length;
  const texts = split.parts.map((chunk, i) => (i === 0 ? head : marker(i + 1, n)) + escapeHtml(chunk));
  const last = n - 1;
  texts[last] += (split.truncated ? readMore : "") + footer;

  return texts.map((text, i) => ({
    chat_id: chatId,
    text,
    parse_mode: "HTML" as const,
    disable_web_page_preview: true,
    ...(link && i === last ? { reply_markup: { inline_keyboard: [[{ text: t("ns.openSite"), url: link }]] } } : {}),
  }));
}

/** sendPhoto payload for the item's first picture (null when there is none we may link to). */
export function buildTelegramPhoto(chatId: string, msg: ChannelMessage) {
  const url = msg.fullText && msg.images?.length ? absoluteAsset(msg.images[0]) : null;
  if (!url) return null;
  const more = msg.images!.length - 1;
  const caption = truncate(msg.title, 200) + (more > 0 ? ` (+${more})` : "");
  return { chat_id: chatId, photo: url, caption: escapeHtml(caption), parse_mode: "HTML" as const, disable_notification: true };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sends the messages of one notification in order, then (best effort) the first picture.
 * The picture goes through sendPhoto with the public /uploads URL; it is sent AFTER the text and
 * its failure is ignored (a picture Telegram cannot fetch must never break or delay the text).
 * The first part decides success; a failure in a later part is reported as a transient error.
 */
export async function sendTelegramBundle(token: string, chatId: string, msg: ChannelMessage): Promise<{ ok: boolean; code?: number; description?: string }> {
  const parts = buildTelegramMessages(chatId, msg);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) await sleep(PART_GAP_MS);
    let r = await tgCall(token, "sendMessage", parts[i]);
    if (!r.ok && i > 0 && r.error_code === 429) {
      await sleep(Math.min(5, r.parameters?.retry_after ?? 1) * 1000);
      r = await tgCall(token, "sendMessage", parts[i]);
    }
    if (!r.ok) return { ok: false, code: i === 0 ? r.error_code : undefined, description: r.description || `Telegram ${r.error_code ?? "error"}` };
  }
  const photo = buildTelegramPhoto(chatId, msg);
  if (photo) await tgCall(token, "sendPhoto", photo).catch(() => {});
  return { ok: true };
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
    if (!msg.fullText) {
      const r = await tgCall(token, "sendMessage", buildTelegramPayload(row.address, msg));
      if (r.ok) return { ok: true };
      return {
        ok: false,
        error: (r.description || `Telegram ${r.error_code ?? "error"}`).slice(0, 200),
        // 401 on an own bot = the token was revoked in @BotFather: retrying is pointless too.
        permanent: isPermanentTelegramError(r.error_code, r.description) || (Boolean(own) && r.error_code === 401),
      };
    }
    const r = await sendTelegramBundle(token, row.address, msg);
    if (r.ok) return { ok: true };
    return {
      ok: false,
      error: (r.description || "Telegram error").slice(0, 200),
      permanent: isPermanentTelegramError(r.code, r.description) || (Boolean(own) && r.code === 401),
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
