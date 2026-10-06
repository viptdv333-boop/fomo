import { siteUrl } from "@/lib/site-mode";
import { doFetch, errMsg, absoluteLink, suppressedNote, truncate, SEND_TIMEOUT_MS, type AdapterDeps, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * WhatsApp through the OFFICIAL Cloud API (Meta) only. Outside the 24-hour
 * customer-service window free text is not allowed, so everything goes out as
 * an approved TEMPLATE message:
 *   WHATSAPP_TEMPLATE_CODE   — authentication template, one body parameter {{1}} = the code
 *                              (+ the copy-code button parameter, see buildCodePayload)
 *   WHATSAPP_TEMPLATE_NOTIFY — utility template, body parameters {{1}} title, {{2}} text, {{3}} link
 * Both templates must exist and be approved in every language we send in
 * (ru, en, zh_CN) — see docs/notifications.md.
 * Env: WHATSAPP_TOKEN (system-user token), WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE_CODE,
 * WHATSAPP_TEMPLATE_NOTIFY, optional WHATSAPP_API_VERSION (default v21.0).
 * Without these the channel reports "not configured" and the UI hides/disables it.
 */

export function isConfigured(): boolean {
  const e = process.env;
  return Boolean(e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_ID && e.WHATSAPP_TEMPLATE_CODE && e.WHATSAPP_TEMPLATE_NOTIFY);
}

/** Template language codes as Meta names them. */
export const WA_LANG: Record<string, string> = { ru: "ru", en: "en", cn: "zh_CN" };

/** E.164 digits only, 8..15 digits (no plus sign: the Cloud API wants it bare). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()\-.]/g, "").replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

/**
 * Template parameters may not contain newlines, tabs or 4+ consecutive spaces
 * (Meta rejects the message with error 132018) — collapse them.
 */
export function waParam(s: string, max = 900): string {
  return truncate(s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim() || "-", max);
}

function endpoint(): string {
  return `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v21.0"}/${process.env.WHATSAPP_PHONE_ID}/messages`;
}

export function buildNotifyPayload(to: string, msg: ChannelMessage) {
  const link = absoluteLink(msg.link, msg.locale) ?? siteUrl();
  const note = suppressedNote(msg);
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NOTIFY,
      language: { code: WA_LANG[msg.locale] ?? "ru" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: waParam(msg.title, 200) },
            { type: "text", text: waParam([msg.body ?? "-", note].filter(Boolean).join(" "), 700) },
            { type: "text", text: waParam(link, 300) },
          ],
        },
      ],
    },
  };
}

export function buildCodePayload(to: string, code: string, locale: string) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE_CODE,
      language: { code: WA_LANG[locale] ?? "ru" },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        // Authentication templates carry a "copy code" button whose parameter repeats the code.
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
}

/** Meta error codes after which the recipient is unreachable for good. */
const PERMANENT_CODES = new Set([131026, 131030, 131021, 131009, 100]);

async function post(payload: unknown, deps?: AdapterDeps): Promise<SendResult> {
  if (!isConfigured()) return { ok: false, error: "WhatsApp is not configured" };
  try {
    const res = await doFetch(deps)(endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string; error_data?: { details?: string } } };
    const code = data.error?.code;
    const detail = data.error?.error_data?.details || data.error?.message || "";
    return {
      ok: false,
      error: `WhatsApp ${code ?? res.status}${detail ? `: ${detail}` : ""}`.slice(0, 200),
      // 131026 = number not on WhatsApp / undeliverable. 190 (token) and 132xxx (template) are OUR config problems.
      permanent: code !== undefined && PERMANENT_CODES.has(code),
    };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export function send(row: ChannelRowLite, msg: ChannelMessage, deps?: AdapterDeps): Promise<SendResult> {
  if (!row.address) return Promise.resolve({ ok: false, error: "no phone", permanent: true });
  return post(buildNotifyPayload(row.address, msg), deps);
}

/** Verification code for connecting a phone (authentication template). */
export function sendCode(phone: string, code: string, locale: string, deps?: AdapterDeps): Promise<SendResult> {
  return post(buildCodePayload(phone, code, locale), deps);
}
