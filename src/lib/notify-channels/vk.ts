import { randomInt } from "node:crypto";
import { doFetch, errMsg, plainText, SEND_TIMEOUT_MS, type AdapterDeps, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * VK community messages. The community token (VK_GROUP_TOKEN) sends
 * messages.send to a user who has allowed messages from the community. The user
 * connects with https://vk.me/<VK_COMMUNITY_NAME>?ref=<token>: writing to the
 * community delivers a Callback API `message_new` event whose message carries
 * `ref`; we store from_id as the address (see the vk webhook route).
 * Env: VK_GROUP_TOKEN, VK_COMMUNITY_NAME, VK_CALLBACK_SECRET, VK_CONFIRMATION_CODE, VK_API_VERSION.
 * UNVERIFIED against a live community.
 */

export function isConfigured(): boolean {
  return Boolean(process.env.VK_GROUP_TOKEN && process.env.VK_COMMUNITY_NAME);
}

/** VK error codes meaning "this user can't be messaged": no permission, blacklisted, privacy, deleted page. */
const PERMANENT_CODES = new Set([7, 18, 900, 901, 902, 917]);

export async function sendRaw(userId: string, text: string, deps?: AdapterDeps): Promise<SendResult> {
  const token = process.env.VK_GROUP_TOKEN;
  if (!token) return { ok: false, error: "VK_GROUP_TOKEN is not configured" };
  const form = new URLSearchParams({
    user_id: userId,
    random_id: String(randomInt(1, 2 ** 31 - 1)),
    message: text,
    dont_parse_links: "0",
    v: process.env.VK_API_VERSION || "5.199",
    access_token: token,
  });
  try {
    const res = await doFetch(deps)("https://api.vk.com/method/messages.send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as { response?: unknown; error?: { error_code?: number; error_msg?: string } };
    if (res.ok && data.response !== undefined && !data.error) return { ok: true };
    const code = data.error?.error_code;
    return {
      ok: false,
      error: `VK ${code ?? res.status}${data.error?.error_msg ? `: ${data.error.error_msg}` : ""}`.slice(0, 200),
      permanent: code !== undefined && PERMANENT_CODES.has(code),
    };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export function send(row: ChannelRowLite, msg: ChannelMessage, deps?: AdapterDeps): Promise<SendResult> {
  if (!row.address) return Promise.resolve({ ok: false, error: "no user id", permanent: true });
  return sendRaw(row.address, plainText(msg, 3800), deps);
}
