import { randomInt } from "crypto";
// for-locale (not i18n/server): this file is also loaded by the notification
// dispatcher inside the custom server, where next/headers must not be imported.
import { tFor } from "@/lib/i18n/for-locale";
import { isLocale, localizedPath } from "@/lib/i18n/locale-url";
import { renderNotificationEmail } from "@/lib/notify-email-render";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "FOMO <no-reply@fomo.spot>";
const BASE_URL = process.env.NEXTAUTH_URL || "https://fomo.spot";

/** `locale` — the language of the person who asked for the code ("ru" | "en" | "cn"). */
export async function sendVerificationCode(email: string, code: string, locale: string = "ru") {
  const t = tFor(locale);
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: t("api.email.codeSubject"),
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 16px;">
          <h2 style="text-align: center; color: #111; margin-bottom: 8px;">FOMO</h2>
          <p style="text-align: center; color: #666; font-size: 14px;">${t("api.email.codeIntro")}</p>
          <div style="text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111; margin: 24px 0; padding: 16px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
            ${code}
          </div>
          <p style="text-align: center; color: #999; font-size: 12px;">${t("api.email.codeValidity")}</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    console.error("Resend error:", error);
    throw new Error("Failed to send email");
  }

  return await res.json();
}

export async function sendBroadcastEmail(
  email: string,
  title: string,
  body: string | null,
  link: string | null,
  locale: string = "ru"
) {
  const t = tFor(locale);
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const linkHtml = link
    ? `<p style="text-align: center; margin-top: 24px;"><a href="${link.startsWith("http") ? link : BASE_URL + link}" style="display: inline-block; padding: 12px 32px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">${t("api.email.open")}</a></p>`
    : "";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: title,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 16px;">
          <h2 style="text-align: center; color: #111; margin-bottom: 16px;">FOMO</h2>
          <h3 style="color: #111; margin-bottom: 8px;">${title}</h3>
          ${body ? `<p style="color: #444; font-size: 15px; line-height: 1.6;">${body.replace(/\n/g, "<br>")}</p>` : ""}
          ${linkHtml}
          <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
          <p style="text-align: center; color: #999; font-size: 11px; margin-top: 16px;">
            ${t("api.email.footer", { link: `<a href="${BASE_URL}" style="color: #16a34a;">fomo.spot</a>` })}
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    console.error("Resend broadcast error:", error);
    return false;
  }
  return true;
}

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

export interface EmailSendResult {
  ok: boolean;
  error?: string;
  /** a hard failure (address rejected) as opposed to a hiccup worth retrying later */
  permanent?: boolean;
}

/**
 * One notification as a mail, for the notification-channels dispatcher.
 * Unlike sendBroadcastEmail it escapes user-generated text, never throws, has a
 * timeout and reports whether a failure is permanent. `fetchImpl` is injectable for tests.
 * With `fullText` the mail carries the whole item (responsive HTML + plain-text alternative,
 * <= ~100 KB, see notify-email-render.ts); `body` is then only the short teaser.
 */
export async function sendNotificationEmail(
  to: string,
  msg: {
    title: string;
    body?: string | null;
    link?: string | null;
    locale?: string;
    footerNote?: string;
    fullText?: string | null;
    author?: string | null;
    images?: string[];
  },
  fetchImpl: typeof fetch = fetch
): Promise<EmailSendResult> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY is not configured" };
  const locale = isLocale(msg.locale) ? msg.locale : "ru";
  const link = msg.link ? (msg.link.startsWith("http") ? msg.link : BASE_URL + msg.link) : null;
  const settingsUrl = BASE_URL + localizedPath(locale, "/profile?tab=notifications");
  const mail = renderNotificationEmail({
    title: msg.title,
    body: msg.body,
    fullText: msg.fullText,
    author: msg.author,
    images: msg.images,
    link,
    settingsUrl,
    locale,
    footerNote: msg.footerNote,
    baseUrl: BASE_URL,
  });
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: { "List-Unsubscribe": `<${settingsUrl}>` },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    // 4xx other than 429 = the request itself is bad (invalid / suppressed address).
    return {
      ok: false,
      error: `Resend ${res.status}${data?.message ? `: ${data.message}` : ""}`.slice(0, 200),
      permanent: res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 401 && res.status !== 403,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The 6-digit code for adding a notification address (the generic sendVerificationCode text is for sign-up). */
export async function sendNotificationEmailCode(
  to: string,
  code: string,
  locale: string = "ru",
  fetchImpl: typeof fetch = fetch
): Promise<EmailSendResult> {
  const t = tFor(locale);
  return sendNotificationEmail(
    to,
    { title: t("ns.email.codeSubject", { code }), body: t("ns.email.codeBody", { code }), locale },
    fetchImpl
  );
}

/**
 * Math.random() is not a secret generator: V8's PRNG state can be recovered
 * from a modest run of outputs, and an attacker can farm those by requesting
 * codes to their own addresses. crypto.randomInt is drawn from the OS CSPRNG.
 */
export function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}
