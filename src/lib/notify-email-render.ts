// HTML + plain-text rendering of one notification e-mail. Pure (no env, no network), Next-free.
//
// Everything user-controlled (title, author, text, image URLs) is escaped; the only markup that is
// ever produced from user text is: paragraphs / line breaks and <a href="https://…"> around
// http(s) URLs found in the text. Table layout + inline styles: renders in Gmail / Outlook /
// Apple Mail, 100% width on a phone.

import { tFor } from "@/lib/i18n/for-locale";
import { absoluteAsset, fullLayout } from "@/lib/notify-text";

/** The finished HTML never exceeds this many bytes (Gmail clips messages at ~102 KB). */
export const MAX_EMAIL_HTML = 100_000;
const START_TEXT_CHARS = 30_000;

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Escaped text -> paragraphs; blank line = new <p>, single newline = <br>, http(s) URLs become links. */
export function textToHtml(text: string, style: string): string {
  const linkify = (escaped: string) =>
    escaped.replace(/https?:\/\/(?:(?!&lt;|&gt;|&quot;|&#39;)[^\s<>"'])+/g, (url) => {
      // keep sentence punctuation out of the link
      const m = url.match(/^(.*?)([.,;:!?)\]]*)$/);
      const href = m ? m[1] : url;
      const tail = m ? m[2] : "";
      return href.length > 8 ? `<a href="${href}" style="color:#16a34a;word-break:break-all;">${href}</a>${tail}` : url;
    });
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${linkify(escHtml(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface EmailRenderInput {
  title: string;
  /** short teaser (the bell text) */
  body?: string | null;
  /** FULL text; when present it replaces the teaser as the message body */
  fullText?: string | null;
  author?: string | null;
  images?: string[];
  /** absolute URL of the item */
  link?: string | null;
  /** absolute URL of the notification settings page */
  settingsUrl?: string | null;
  locale?: string;
  footerNote?: string;
  /** site root for the footer link */
  baseUrl: string;
  /** product name in the mail header (default "FOMO"; the terminal instance passes "FOMO Terminal") */
  brand?: string;
}

/** "https://terminal.fomo.spot/" -> "terminal.fomo.spot"; the footer link text. */
function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function build(input: EmailRenderInput, fullText: string, cut: boolean): RenderedEmail {
  const t = tFor(input.locale ?? "ru");
  const layout = fullText
    ? fullLayout({ title: input.title, body: input.body ?? undefined, author: input.author ?? undefined, fullText })
    : { title: input.title, author: undefined, subtitle: undefined, text: input.body ?? "" };
  const link = input.link && /^https?:\/\//i.test(input.link) ? input.link : null;
  const settings = input.settingsUrl && /^https?:\/\//i.test(input.settingsUrl) ? input.settingsUrl : null;
  const images = fullText ? (input.images ?? []).map(absoluteAsset).filter((u): u is string => Boolean(u)).slice(0, 3) : [];
  const bodyStyle = `margin:0 0 14px;color:#374151;font-size:16px;line-height:1.6;`;
  const readMore = cut ? t("ns.readFull") : "";

  const footerLinks = [
    settings ? `<a href="${escHtml(settings)}" style="color:#16a34a;">${escHtml(t("ns.email.settings"))}</a>` : "",
    `<a href="${escHtml(input.baseUrl)}" style="color:#16a34a;">${escHtml(hostOf(input.baseUrl))}</a>`,
  ].filter(Boolean);

  const html = `<!doctype html>
<html lang="${escHtml(input.locale === "cn" ? "zh-CN" : input.locale ?? "ru")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;font-family:${FONT};">
<tr><td style="padding:20px 24px 0;font-size:18px;font-weight:700;color:#16a34a;letter-spacing:.5px;">${escHtml(input.brand || "FOMO")}</td></tr>
<tr><td style="padding:12px 24px 0;">
<h1 style="margin:0 0 6px;color:#111827;font-size:20px;line-height:1.3;">${escHtml(layout.title)}</h1>
${layout.author ? `<p style="margin:0 0 4px;color:#6b7280;font-size:14px;">${escHtml(layout.author)}</p>` : ""}
${layout.subtitle ? `<p style="margin:0 0 10px;color:#111827;font-size:16px;font-weight:600;line-height:1.4;">${escHtml(layout.subtitle)}</p>` : ""}
</td></tr>
${layout.text || images.length ? `<tr><td style="padding:8px 24px 0;">${layout.text ? textToHtml(layout.text, bodyStyle) : ""}${readMore ? `<p style="${bodyStyle}font-style:italic;color:#6b7280;">${escHtml(readMore)}</p>` : ""}${images
    .map((u) => `<p style="margin:0 0 14px;"><img src="${escHtml(u)}" alt="" width="552" style="display:block;width:100%;max-width:552px;height:auto;border-radius:8px;border:0;"></p>`)
    .join("")}</td></tr>` : ""}
${link ? `<tr><td align="center" style="padding:10px 24px 8px;"><a href="${escHtml(link)}" style="display:inline-block;padding:13px 32px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">${escHtml(t("ns.openSite"))}</a></td></tr>` : ""}
<tr><td style="padding:18px 24px 22px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center;">
${input.footerNote ? `${escHtml(input.footerNote)}<br>` : ""}${escHtml(t("ns.email.why"))}<br>${footerLinks.join(" &middot; ")}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    layout.title,
    layout.author ?? "",
    layout.subtitle ?? "",
    "",
    layout.text,
    readMore,
    "",
    link ? `${t("ns.openSite")}: ${link}` : "",
    settings ? `${t("ns.email.settings")}: ${settings}` : "",
    input.footerNote ?? "",
  ]
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n")
    .trim();

  return { subject: input.title.replace(/\s+/g, " ").trim().slice(0, 120), html, text };
}

/**
 * Renders the mail. The text is shortened step by step until the HTML fits MAX_EMAIL_HTML
 * (escaping and tags can multiply its size), and "read the full text on the site" is added then.
 */
export function renderNotificationEmail(input: EmailRenderInput): RenderedEmail {
  let full = input.fullText ?? "";
  if (full.length > START_TEXT_CHARS) full = full.slice(0, START_TEXT_CHARS);
  let cut = (input.fullText ?? "").length > full.length;
  let out = build(input, full, cut);
  while (out.html.length > MAX_EMAIL_HTML && full.length > 200) {
    full = full.slice(0, Math.floor(full.length * 0.75));
    cut = true;
    out = build(input, full, cut);
  }
  return out;
}
