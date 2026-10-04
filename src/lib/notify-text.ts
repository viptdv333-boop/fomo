// Full-text helpers for external notification channels (e-mail, Telegram, ...).
// Next-free and DB-free on purpose: loaded from server/*.ts and from the check scripts.
//
// The bell row keeps its short `body`; the FULL content of the thing that triggered the
// notification travels separately as `fullText` (see NotifFull below) and is only ever put
// into a message for a recipient who is allowed to read it (`fullTextFor`).

import { SITE_URL } from "@/lib/i18n/locale-url";

/** Hard cap on what is ever carried as full text (chars). Telegram shows far less, e-mail is capped again by size. */
export const MAX_FULL_TEXT = 30_000;

/**
 * The optional "full content" part of a notification. Passed by call sites next to the short
 * title/body/link. Everything here is plain text; channels escape it for their own markup.
 */
export interface NotifFull {
  /** Full plain text of the item (idea / post / comment / message). */
  fullText?: string;
  /** Author's display name, when the notification title does not already contain it. */
  author?: string;
  /** Site-relative ("/uploads/…") or absolute image URLs of the item, first one is the main picture. */
  images?: string[];
  /**
   * Recipients allowed to receive `fullText`. ACCESS RULE: when set, a recipient that is not
   * listed gets the short teaser only. When undefined the caller asserts the content is readable
   * by every recipient of this call (public text, or recipients are filtered by access already).
   */
  fullTextFor?: string[];
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Only well-known formatting tags count as "HTML": a plain-text idea may legitimately contain "x<y and y>z".
const KNOWN_TAG = /<\/?(?:p|br|div|span|a|b|i|u|s|em|strong|ul|ol|li|h[1-6]|blockquote|pre|code|img|hr|table|tr|td|th)(?:\s[^<>]*)?\/?>/i;

/**
 * Ideas, comments and messages are plain text in this app (a textarea, shown pre-wrap), so this is
 * mostly a normaliser: LF line endings, no control chars, no runs of blank lines. If the text does
 * contain editor-style HTML tags they are converted to readable text (paragraphs and links kept).
 * Markdown is left as is — it is readable in a mail / chat.
 */
export function toPlainText(src: unknown, max: number = MAX_FULL_TEXT): string {
  let s = typeof src === "string" ? src : src == null ? "" : String(src);
  s = s.replace(/\r\n?/g, "\n");
  if (KNOWN_TAG.test(s)) {
    s = s
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
        const l = label.replace(/<[^>]*>/g, "").trim();
        return !l || l === href ? href : `${l} (${href})`;
      })
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|pre|tr|table)>/gi, "\n\n")
      .replace(/<(?:\/?(?:p|br|div|span|b|i|u|s|em|strong|ul|ol|li|h[1-6]|blockquote|pre|code|img|hr|table|tr|td|th)(?:\s[^<>]*)?\/?)>/gi, "")
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
        if (e[0] === "#") {
          const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
        }
        return ENTITIES[e.toLowerCase()] ?? m;
      });
  }
  s = s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > max) {
    // never cut a surrogate pair in half
    let cut = max;
    const c = s.charCodeAt(cut - 1);
    if (c >= 0xd800 && c <= 0xdbff) cut--;
    s = s.slice(0, cut).trimEnd();
  }
  return s;
}

/** Image URLs of an Idea.attachments JSON ([{url, name}]): only our own uploads / absolute site URLs, only pictures. */
export function imageUrlsFromAttachments(attachments: unknown, limit = 5): string[] {
  if (!Array.isArray(attachments)) return [];
  const out: string[] = [];
  for (const a of attachments) {
    const url = a && typeof a === "object" ? (a as { url?: unknown }).url : undefined;
    const name = a && typeof a === "object" ? (a as { name?: unknown }).name : undefined;
    if (typeof url !== "string") continue;
    const clean = url.split(/[?#]/)[0];
    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(clean) || (typeof name === "string" && /\.(png|jpe?g|webp|gif)$/i.test(name) && clean.startsWith("/uploads/"));
    if (!isImage) continue;
    if (!(clean.startsWith("/uploads/") || url.startsWith(SITE_URL + "/"))) continue;
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

/** "/uploads/x.png" → "https://fomo.spot/uploads/x.png" (assets are never locale-prefixed); anything not ours → null. */
export function absoluteAsset(url: string): string | null {
  if (url.startsWith("/uploads/")) return SITE_URL + url;
  if (url.startsWith(SITE_URL + "/")) return url;
  return null;
}

// ---------------------------------------------------------------------------
// Layout shared by the channels
// ---------------------------------------------------------------------------

export interface FullLayout {
  title: string;
  /** author line, omitted when the title already contains the author's name */
  author?: string;
  /** the short body, omitted when the full text starts with it (a comment preview is a prefix of the comment) */
  subtitle?: string;
  text: string;
}

export function fullLayout(msg: { title: string; body?: string; author?: string; fullText?: string }): FullLayout {
  const text = msg.fullText ?? "";
  const author = msg.author && !msg.title.includes(msg.author) ? msg.author : undefined;
  let subtitle: string | undefined;
  if (msg.body) {
    const probe = msg.body.replace(/…$/, "").trim();
    if (probe && !text.startsWith(probe) && probe !== msg.title) subtitle = msg.body;
  }
  return { title: msg.title, author, subtitle, text };
}

// ---------------------------------------------------------------------------
// Splitting for Telegram (4096 limit, measured AFTER HTML escaping)
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escaped cost of one UTF-16 unit in a Telegram HTML message. */
function unitCost(ch: string): number {
  return ch === "&" ? 5 : ch === "<" || ch === ">" ? 4 : 1;
}

/** Largest n such that escapeHtml(s.slice(0, n)).length <= budget (never splits a surrogate pair). */
function fitPrefix(s: string, budget: number): number {
  let used = 0;
  let n = 0;
  while (n < s.length) {
    const c = unitCost(s[n]);
    if (used + c > budget) break;
    used += c;
    n++;
  }
  if (n < s.length && n > 0) {
    const code = s.charCodeAt(n - 1);
    if (code >= 0xd800 && code <= 0xdbff) n--;
  }
  return n;
}

/** Where to cut `s` (which does not fit) to stay <= n chars: paragraph, line, sentence, word, else hard. */
function boundary(s: string, n: number): number {
  const min = Math.floor(n * 0.5);
  const head = s.slice(0, n);
  let i = head.lastIndexOf("\n\n");
  if (i >= min) return i;
  i = head.lastIndexOf("\n");
  if (i >= min) return i;
  const re = /[.!?…。！？]["'”»)\]]*(?=\s)/g;
  let m: RegExpExecArray | null;
  let best = -1;
  while ((m = re.exec(head))) best = m.index + m[0].length;
  if (best >= min) return best;
  i = head.lastIndexOf(" ");
  if (i >= min) return i;
  return n;
}

/**
 * Cut `raw` into at most budgets.length chunks; chunk i fits budgets[i] after HTML escaping.
 * Cuts on paragraph / line / sentence / word boundaries. `truncated` = text was left over.
 */
export function splitByBudgets(raw: string, budgets: number[]): { parts: string[]; truncated: boolean } {
  const parts: string[] = [];
  let rest = raw.trim();
  for (let i = 0; i < budgets.length && rest; i++) {
    const budget = Math.max(1, budgets[i]);
    const n = fitPrefix(rest, budget);
    if (n >= rest.length) {
      parts.push(rest);
      rest = "";
      break;
    }
    const cut = boundary(rest, n);
    const chunk = rest.slice(0, cut).trimEnd();
    parts.push(chunk || rest.slice(0, n));
    rest = rest.slice(chunk ? cut : n).trimStart();
  }
  return { parts, truncated: rest.length > 0 };
}
