import { SHARE_BASE, channelPath } from "@/lib/app-channels";
import type { NotifText } from "@/lib/notif-render";

/// Pure text/link helpers for «подписка на канал оформлена»: the bell notification and the
/// auto welcome DM both name the channel, the end date and link straight to the channel
/// (/channels/<slug>), not to /messages. No DB, no next/* — see subscription-welcome-server.ts
/// for the lookup. Without a resolved channel everything falls back to the old texts.

export type PaidChannelInfo = {
  id: string;
  name: string;
  slug: string | null;
  /** The channel has a closed subscribers' chat room already created. */
  hasChat: boolean;
};

/** dd.MM.yyyy (Moscow time) — a locale-neutral form, since notification vars are shared by all languages. */
export function formatAccessEnd(d: Date): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}.${g("month")}.${g("year")}`;
}

/** Relative in-app link to the channel (the same builder the app uses). */
export function channelLink(ch: Pick<PaidChannelInfo, "id" | "slug">): string {
  return channelPath(ch);
}

/** Absolute public URL: https://fomo.spot/channels/<slug|id>. */
export function channelPublicUrl(ch: Pick<PaidChannelInfo, "id" | "slug">): string {
  return `${SHARE_BASE}${channelPath(ch)}`;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Welcome DM (written in the buyer's language via tFor). Falls back to the old text without a channel. */
export function welcomeDmText(
  t: T,
  ch: PaidChannelInfo | null,
  endDate: Date,
  durationDays: number,
  legacyKey: "notif.dm.subscriptionWelcome" | "notif.dm.yukassaWelcome"
): string {
  if (!ch) return t(legacyKey, { days: durationDays });
  return t(ch.hasChat ? "notif.dm.channelWelcomeChat" : "notif.dm.channelWelcome", {
    channel: ch.name,
    date: formatAccessEnd(endDate),
    url: channelPublicUrl(ch),
  });
}

/** Bell notification content for the buyer. */
export function subscriptionNotice(
  ch: PaidChannelInfo | null,
  endDate: Date,
  opts: { sellerName?: string | null; days: number; amount?: number }
): { title: NotifText; body: NotifText; link: string } {
  const nameVar = opts.sellerName || { key: "notif.fallback.author" };
  if (!ch) {
    return {
      title: { key: "notif.subscription.done.title", vars: { name: nameVar } },
      body:
        opts.amount != null
          ? { key: "notif.subscription.yukassaDone.body", vars: { amount: opts.amount, days: opts.days } }
          : { key: "notif.subscription.done.body", vars: { days: opts.days } },
      link: "/messages",
    };
  }
  const date = formatAccessEnd(endDate);
  return {
    title: { key: "notif.subscription.channelDone.title", vars: { channel: ch.name } },
    body:
      opts.amount != null
        ? { key: "notif.subscription.channelYukassaDone.body", vars: { amount: opts.amount, date } }
        : { key: "notif.subscription.channelDone.body", vars: { date } },
    link: channelLink(ch),
  };
}
