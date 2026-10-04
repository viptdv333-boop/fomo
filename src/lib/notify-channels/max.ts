import { doFetch, errMsg, plainText, SEND_TIMEOUT_MS, type AdapterDeps, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * MAX messenger (VK's messenger) bot platform — https://dev.max.ru, API base
 * https://platform-api.max.ru. The bot token goes in the `Authorization` header
 * (no "Bearer" prefix). A user connects by starting the bot with
 * https://max.ru/<MAX_BOT_USERNAME>?start=<token> — MAX then delivers a
 * `bot_started` update (field `payload` = the start parameter) to the webhook
 * registered via POST /subscriptions. Messages to a user: POST /messages?user_id=<id>.
 *
 * UNVERIFIED: written against the documented shape without a live bot; the
 * endpoint paths, header name and update fields are all kept in this file and
 * in the webhook route so a mismatch is a one-place fix. Env: MAX_BOT_TOKEN,
 * MAX_BOT_USERNAME, optional MAX_API_BASE.
 */

export function maxApiBase(): string {
  return (process.env.MAX_API_BASE || "https://platform-api.max.ru").replace(/\/+$/, "");
}

export function isConfigured(): boolean {
  return Boolean(process.env.MAX_BOT_TOKEN && process.env.MAX_BOT_USERNAME);
}

export function maxHeaders(): Record<string, string> {
  return { Authorization: process.env.MAX_BOT_TOKEN || "", "Content-Type": "application/json" };
}

export async function sendRaw(userId: string, text: string, deps?: AdapterDeps): Promise<SendResult> {
  if (!process.env.MAX_BOT_TOKEN) return { ok: false, error: "MAX_BOT_TOKEN is not configured" };
  try {
    const res = await doFetch(deps)(`${maxApiBase()}/messages?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: maxHeaders(),
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    const reason = `${data.code ?? ""} ${data.message ?? ""}`.trim();
    // 401 = our token is wrong (config problem, not the user's fault). A missing /
    // blocked / suspended dialog is the user's doing — stop retrying.
    const permanent = res.status !== 401 && (res.status === 403 || res.status === 404 || /not\.found|blocked|suspended|forbidden|closed/i.test(reason));
    return { ok: false, error: `MAX ${res.status}${reason ? `: ${reason}` : ""}`.slice(0, 200), permanent };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export function send(row: ChannelRowLite, msg: ChannelMessage, deps?: AdapterDeps): Promise<SendResult> {
  if (!row.address) return Promise.resolve({ ok: false, error: "no user id", permanent: true });
  return sendRaw(row.address, plainText(msg, 3800), deps);
}
