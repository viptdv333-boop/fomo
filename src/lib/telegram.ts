import { prisma } from "@/lib/prisma";

const API = "https://api.telegram.org";

/// sendMessage is always called with parse_mode: "HTML" — any user/bot-authored
/// text interpolated into a message must be escaped first, or a stray `<`/`&`
/// makes Telegram reject the whole message as invalid markup.
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface TelegramApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function call<T>(botToken: string, method: string, body?: object): Promise<TelegramApiResult<T>> {
  const res = await fetch(`${API}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return res.json();
}

/// Confirms the token is real and returns the bot's own @username for display.
export async function verifyBotToken(botToken: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  try {
    const data = await call<{ username: string }>(botToken, "getMe");
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description || "Неверный токен бота" };
    }
    return { ok: true, username: data.result.username };
  } catch {
    return { ok: false, error: "Не удалось связаться с Telegram" };
  }
}

/// Finds the chat id of whoever has messaged this bot — the subscriber's own
/// DM with their own newly-created bot, since they're the only person who
/// can know its token. Picks the most recent message across every update
/// getUpdates still has buffered.
export async function resolveChatId(botToken: string): Promise<{ ok: true; chatId: string } | { ok: false; error: string }> {
  try {
    const data = await call<Array<{ message?: { chat: { id: number } } }>>(botToken, "getUpdates", { limit: 100 });
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description || "Не удалось получить обновления бота" };
    }
    const withMessage = data.result.filter((u) => u.message?.chat?.id != null);
    if (withMessage.length === 0) {
      return { ok: false, error: "Напишите боту любое сообщение в Telegram и попробуйте снова" };
    }
    const last = withMessage[withMessage.length - 1];
    return { ok: true, chatId: String(last.message!.chat.id) };
  } catch {
    return { ok: false, error: "Не удалось связаться с Telegram" };
  }
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await call(botToken, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    if (!data.ok) return { ok: false, error: data.description || "Telegram отклонил сообщение" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/// Forwards a channel event (new paid setup, or a chat message posted in the
/// channel's discussion) to every active subscriber who opted in and has a
/// verified bot. Best-effort per recipient, mirroring src/lib/push.ts: one
/// subscriber's dead/blocked bot never blocks delivery to the others.
export async function notifyChannelTelegramSubscribers(tariffId: string, text: string): Promise<void> {
  const subs = await prisma.subscription.findMany({
    where: {
      tariffId,
      status: "active",
      endDate: { gt: new Date() },
      telegramNotify: true,
    },
    select: {
      subscriberId: true,
      subscriber: { select: { telegramAccount: true } },
    },
  });

  await Promise.all(
    subs.map(async ({ subscriberId, subscriber }) => {
      const acc = subscriber.telegramAccount;
      if (!acc?.chatId) return;

      const result = await sendTelegramMessage(acc.botToken, acc.chatId, text);
      if (result.ok) {
        if (acc.lastError) {
          await prisma.telegramAccount.update({ where: { userId: subscriberId }, data: { lastError: null } }).catch(() => {});
        }
      } else {
        // Bot blocked/deleted by the user, or token revoked — record it so the
        // profile UI can surface "reconnect your bot" instead of silently
        // never delivering again.
        await prisma.telegramAccount.update({ where: { userId: subscriberId }, data: { lastError: result.error || "Unknown error" } }).catch(() => {});
      }
    })
  );
}
