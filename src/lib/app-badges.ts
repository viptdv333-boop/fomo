// Red badges of the app dock: which unread notification (Notification.type) lights which tab. Pure: scripts/check-app-badges.ts runs it.
import { badgeLabel, type AppTabId } from "@/lib/app-ui";

/**
 * Notification.type -> dock tab. Every type that is not listed lights no tab (new_follower, new_idea, payment / subscription*, room_join,
 * report, broadcast, system ... : the owner's own money / subscriber events of a paid channel stay tab-less on purpose).
 *   feed      Доска:    comments on my ideas, replies to my comments, likes of my ideas / comments (idea_like, comment_like)
 *   terminal  Терминал: price alerts, line alerts
 *   calendar  Календарь: reminders of the events the user subscribed to
 *   channels  Каналы:   posts of the channels the user is subscribed to, comments under their posts (channel_comment; the unread-by-type
 *                       endpoint also reports comments / replies under a post of a channel as channel_comment, and the likes of a channel
 *                       post / of a comment under it as channel_like (virtual type, never stored), see effectiveByType)
 *   chat      Болталка: DMs, @mentions, replies/quotes of my messages, messages of rooms with the bell on
 */
export const BADGE_TAB_BY_TYPE: Readonly<Record<string, AppTabId>> = {
  new_comment: "feed",
  comment_reply: "feed",
  idea_like: "feed",
  comment_like: "feed",
  channel_like: "channels",
  price_alert: "terminal",
  line_alert: "terminal",
  calendar_reminder: "calendar",
  channel_post: "channels",
  channel_comment: "channels",
  new_message: "chat",
  chat_mention: "chat",
  chat_reply: "chat",
  chat_room_message: "chat",
};

/**
 * Tabs whose badge is cleared by opening the tab (PATCH /api/notifications {tab}). Доска and Каналы are NOT here: their badges count items
 * (a comment, a post) and clear when that item is opened (per-idea read, src/lib/app-unread.ts), otherwise the badge would vanish before
 * the user has seen what it is about.
 */
export const AUTO_CLEAR_TABS: readonly AppTabId[] = ["terminal", "calendar", "chat"];

/** Types the dock cares about (what the unread-by-type endpoint selects). */
export const BADGE_TYPES: readonly string[] = Object.keys(BADGE_TAB_BY_TYPE);

/**
 * Chat types whose unread state the chat badge (/api/chat/badge: unread DMs + unread messages of followed rooms) already
 * counts, and clears itself when the dialog / room is read. They are NOT counted again from notifications (no double
 * counting, no stale count: reading a DM does not mark its notification read). Mentions and replies are not covered
 * (a room may be one the user does not follow), so they still come from notifications.
 */
export const CHAT_BADGE_COVERED_TYPES: readonly string[] = ["new_message", "chat_room_message"];

/** Tab of a notification type, null when it lights none. */
export function tabForNotifType(type: unknown): AppTabId | null {
  return typeof type === "string" && Object.prototype.hasOwnProperty.call(BADGE_TAB_BY_TYPE, type) ? BADGE_TAB_BY_TYPE[type] : null;
}

/** Notification types of a tab (for the bulk "read" of a tab). */
export function typesForTab(tab: unknown): string[] {
  return BADGE_TYPES.filter((t) => BADGE_TAB_BY_TYPE[t] === tab);
}

export type TabCounts = Partial<Record<AppTabId, number>>;

/**
 * Unread numbers per tab from the grouped counts (type -> n) and the chat badge.
 * Chat tab = max(chat badge, unread mentions + replies): the chat badge already includes the mentions / replies of followed
 * rooms (a sum would count them twice); a mention in a room the user does not follow still shows through the second term.
 */
export function tabBadgeCounts(byType: Record<string, unknown> | null | undefined, chatBadge: number = 0): TabCounts {
  const out: TabCounts = {};
  const chatCovered = new Set(CHAT_BADGE_COVERED_TYPES);
  for (const [type, raw] of Object.entries(byType ?? {})) {
    const tab = tabForNotifType(type);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0;
    if (!tab || n <= 0) continue;
    if (tab === "chat" && chatCovered.has(type)) continue;
    out[tab] = (out[tab] ?? 0) + n;
  }
  const chat = Math.max(out.chat ?? 0, Number.isFinite(chatBadge) ? Math.max(0, Math.floor(chatBadge)) : 0);
  if (chat > 0) out.chat = chat;
  return out;
}

/** The text of a tab's red badge ("" = none, "99+" cap). */
export function tabBadgeLabel(counts: TabCounts, tab: AppTabId): string {
  return badgeLabel(counts[tab]);
}

export interface DockTabBox {
  id: AppTabId;
  /** offsetLeft / offsetWidth of the tab inside the scrolling dock */
  left: number;
  width: number;
}

/**
 * The dock is a sideways carousel (five tabs and a half visible): the badge of a tab that has scrolled out of view cannot be seen.
 * Sums the unread numbers of the tabs whose icon centre lies outside the visible part of the bar, per side (l = scrolled off to the left,
 * r = to the right): the dock shows them as a small red «‹ 3» / «3 ›» at its edge.
 */
export function hiddenTabUnread(tabs: readonly DockTabBox[], scrollLeft: number, clientWidth: number, counts: TabCounts, margin = 14): { l: number; r: number } {
  let l = 0;
  let r = 0;
  for (const t of tabs) {
    const n = counts[t.id] ?? 0;
    if (n <= 0) continue;
    const centre = t.left + t.width / 2 - scrollLeft;
    if (centre < margin) l += n;
    else if (centre > clientWidth - margin) r += n;
  }
  return { l, r };
}
