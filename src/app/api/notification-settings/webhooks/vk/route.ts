import { NextRequest, NextResponse } from "next/server";
import { handleBotStart, markChannelBlocked, secretMatches, tokenFromStartText } from "@/lib/notify-bots";
import * as vk from "@/lib/notify-channels/vk";

/**
 * VK Callback API endpoint of the community (Manage → API usage → Callback API →
 * this URL, secret key = VK_CALLBACK_SECRET, event types: message_new, message_deny).
 *   confirmation → reply with the string VK shows in the settings (VK_CONFIRMATION_CODE)
 *   message_new  → the user opened https://vk.me/<community>?ref=<token>; the message carries `ref`
 *                  (or the token typed as "/start <token>"); from_id becomes the address
 *   message_deny → the user forbade community messages → channel switched off
 * VK requires the literal body "ok" with status 200 for everything else.
 * UNVERIFIED against a live community.
 */
const text = (s: string) => new NextResponse(s, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as any;
  if (!body || typeof body.type !== "string") return text("ok");

  if (!secretMatches(typeof body.secret === "string" ? body.secret : null, process.env.VK_CALLBACK_SECRET)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (body.type === "confirmation") return text(process.env.VK_CONFIRMATION_CODE || "");

  try {
    if (body.type === "message_new") {
      const m = body.object?.message ?? body.object;
      const fromId = m?.from_id;
      if (fromId != null && Number(fromId) > 0) {
        const token = typeof m.ref === "string" && m.ref ? m.ref : tokenFromStartText(m.text) ?? (/^[A-Za-z0-9_-]{16,64}$/.test((m.text ?? "").trim()) ? m.text.trim() : undefined);
        // Only react to a deep link / pasted token; ordinary chatter with the community is not ours to answer.
        if (token) {
          await handleBotStart({
            channel: "vk",
            token,
            address: String(fromId),
            label: null,
            reply: (t) => vk.sendRaw(String(fromId), t),
          });
        }
      }
    } else if (body.type === "message_deny") {
      const uid = body.object?.user_id;
      if (uid != null) await markChannelBlocked("vk", String(uid), "messages from the community were denied");
    }
  } catch (e) {
    console.error("[notify/vk-webhook]", e instanceof Error ? e.message : e);
  }
  return text("ok");
}
