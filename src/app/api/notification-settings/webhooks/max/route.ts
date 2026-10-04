import { NextRequest, NextResponse } from "next/server";
import { handleBotStart, markChannelBlocked, secretMatches, tokenFromStartText } from "@/lib/notify-bots";
import * as max from "@/lib/notify-channels/max";

/**
 * MAX bot webhook (registered via POST /subscriptions, see scripts/notify-setup-webhooks.ts).
 * The secret given at subscription time comes back in X-Max-Bot-Api-Secret.
 * UNVERIFIED against a live bot — field names follow the documented update objects:
 *   bot_started      { update_type, chat_id, user: { user_id, name, username }, payload }
 *   message_created  { update_type, message: { sender: { user_id }, body: { text } } }
 *   bot_stopped      { update_type, user: { user_id } }
 */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-max-bot-api-secret"), process.env.MAX_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as any;
  if (!update) return NextResponse.json({ ok: true });

  try {
    const type = update.update_type;
    if (type === "bot_started" && update.user?.user_id != null) {
      const userId = String(update.user.user_id);
      await handleBotStart({
        channel: "max",
        token: typeof update.payload === "string" && update.payload ? update.payload : undefined,
        address: userId,
        label: update.user.username ? `@${update.user.username}` : update.user.name ?? null,
        langCode: update.user_locale,
        reply: (text) => max.sendRaw(userId, text),
      });
    } else if (type === "message_created" && update.message?.sender?.user_id != null) {
      // Fallback: the token pasted as "/start <token>" text.
      const text: string | undefined = update.message.body?.text;
      if (/^\/start(\s|$)/i.test((text ?? "").trim())) {
        const userId = String(update.message.sender.user_id);
        await handleBotStart({
          channel: "max",
          token: tokenFromStartText(text),
          address: userId,
          label: update.message.sender.username ? `@${update.message.sender.username}` : update.message.sender.name ?? null,
          langCode: update.user_locale,
          reply: (t) => max.sendRaw(userId, t),
        });
      }
    } else if (type === "bot_stopped" && update.user?.user_id != null) {
      await markChannelBlocked("max", String(update.user.user_id), "bot stopped by the user");
    }
  } catch (e) {
    console.error("[notify/max-webhook]", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
