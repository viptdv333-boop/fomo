import { SITE_URL, localizedPath, isLocale } from "@/lib/i18n/locale-url";
import { tFor } from "@/lib/i18n/for-locale";
import { fullLayout } from "@/lib/notify-text";

/** What an adapter gets: already rendered in the recipient's language. */
export interface ChannelMessage {
  title: string;
  body?: string;
  /** site path ("/ideas/1") or an absolute URL — adapters call absoluteLink() */
  link?: string;
  locale: string;
  /** notifications dropped by the anti-spam gate since the previous delivery */
  suppressed?: number;
  /**
   * FULL plain text of the item that triggered the notification (idea, post, comment, message).
   * Present only when this recipient may read it (src/lib/notify-text.ts, NotifFull.fullTextFor);
   * `body` stays the short teaser. Adapters that cannot carry it simply ignore it.
   */
  fullText?: string;
  /** author's display name, when the title does not already say it */
  author?: string;
  /** image URLs of the item (site-relative "/uploads/…" or absolute); only set together with fullText */
  images?: string[];
}

export interface SendResult {
  ok: boolean;
  error?: string;
  /**
   * A hard failure: the user blocked the bot, the number is not on WhatsApp,
   * the address was rejected. The dispatcher disables the channel after a few
   * of these in a row. Timeouts, 5xx and rate limits are NOT permanent.
   */
  permanent?: boolean;
}

/** The part of a NotificationChannel row an adapter needs. */
export interface ChannelRowLite {
  id: string;
  userId: string;
  address: string | null;
  secret?: string | null;
}

/** Injection points for tests. Production code passes nothing. */
export interface AdapterDeps {
  fetch?: typeof fetch;
  lookup?: (host: string) => Promise<Array<{ address: string; family: number }>>;
  now?: () => number;
}

export const SEND_TIMEOUT_MS = 8000;

export function doFetch(deps: AdapterDeps | undefined): typeof fetch {
  return deps?.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
}

/** https://fomo.spot/<locale prefix>/path — links in external channels are always absolute and localized. */
export function absoluteLink(link: string | undefined, locale: string): string | undefined {
  if (!link) return undefined;
  if (/^https?:\/\//i.test(link)) return link;
  const l = isLocale(locale) ? locale : "ru";
  return SITE_URL + localizedPath(l, link);
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
}

/** "(+3 more were not sent)" suffix after the anti-spam gate dropped something. */
export function suppressedNote(msg: ChannelMessage): string {
  if (!msg.suppressed || msg.suppressed <= 0) return "";
  return tFor(msg.locale)("ns.suppressed", { n: msg.suppressed });
}

/** Plain-text rendering used by the chat-like channels (MAX, VK, ...). */
export function plainText(msg: ChannelMessage, max = 3500): string {
  const link = absoluteLink(msg.link, msg.locale);
  if (msg.fullText) {
    // Full content within the channel's limit: title, author, text, then the link — the text is
    // what gets shortened, never the link or the anti-spam note.
    const { title, author, subtitle, text } = fullLayout(msg);
    const head = [title, author ?? "", subtitle ?? ""].filter(Boolean).join("\n");
    const tail = [link ?? "", suppressedNote(msg)].filter(Boolean).join("\n");
    const room = Math.max(0, max - head.length - tail.length - 4);
    const readMore = text.length > room ? "\n" + tFor(msg.locale)("ns.readFull") : "";
    const body = readMore ? text.slice(0, Math.max(0, room - readMore.length)).trimEnd() : text;
    return [head, body + readMore, tail].filter(Boolean).join("\n\n").slice(0, max);
  }
  const parts = [msg.title, msg.body ? truncate(msg.body, 1500) : "", link ?? "", suppressedNote(msg)].filter(Boolean);
  return truncate(parts.join("\n"), max);
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? (e.name === "TimeoutError" || e.name === "AbortError" ? "timeout" : e.message) : String(e);
  return m.slice(0, 200);
}
