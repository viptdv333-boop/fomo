import { NextRequest, NextResponse } from "next/server";
import { handleBotStart, markChannelBlocked, secretMatches, tokenFromStartText } from "@/lib/notify-bots";
import * as telegram from "@/lib/notify-channels/telegram";

/**
 * Telegram webhook of the SITE bot (register once with `npx tsx scripts/notify-setup-webhooks.ts`).
 * Telegram echoes the secret given to setWebhook in X-Telegram-Bot-Api-Secret-Token.
 * Handles: "/start <token>" in a private chat (finishes the deep-link connection) and
 * my_chat_member (the user blocked the bot → the channel is switched off).
 */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as any;
  if (!update) return NextResponse.json({ ok: true });

  try {
    const msg = update.message;
    if (msg?.chat?.type === "private" && typeof msg.text === "string" && /^\/start(@\w+)?(\s|$)/i.test(msg.text.trim())) {
      const chatId = String(msg.chat.id);
      const username = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name ?? null;
      await handleBotStart({
        channel: "telegram",
        token: tokenFromStartText(msg.text),
        address: chatId,
        label: username,
        langCode: msg.from?.language_code,
        reply: (text) => telegram.sendRaw(chatId, text),
      });
    }

    const member = update.my_chat_member;
    if (member?.chat?.type === "private" && (member.new_chat_member?.status === "kicked" || member.new_chat_member?.status === "left")) {
      await markChannelBlocked("telegram", String(member.chat.id), "bot blocked by the user");
    }
  } catch (e) {
    console.error("[notify/telegram-webhook]", e instanceof Error ? e.message : e);
  }
  // Always 200: Telegram would otherwise retry the same update for hours.
  return NextResponse.json({ ok: true });
}
