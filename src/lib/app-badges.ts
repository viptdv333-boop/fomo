// Red badges of the app dock: which unread notification (Notification.type) lights which tab. Pure: scripts/check-app-badges.ts runs it.
import { badgeLabel, type AppTabId } from "@/lib/app-ui";

/**
 * Notification.type -> dock tab. Every type that is not listed lights no tab (new_follower, new_idea, channel_comment,
 * payment / subscription*, report, broadcast, system ...).
 *   feed      Доска:    comments on my ideas, replies to my comments
 *   terminal  Терминал: price alerts, line alerts
 *   calendar  Календарь: reminders of the events the user subscribed to
 *   channels  Каналы:   posts of the channels the user is subscribed to
 *   chat      Болталка: DMs, @mentions, replies/quotes of my messages, messages of rooms with the bell on
 */
export const BADGE_TAB_BY_TYPE: Readonly<Record<string, AppTabId>> = {
  new_comment: "feed",
  comment_reply: "feed",
  price_alert: "terminal",
  line_alert: "terminal",
  calendar_reminder: "calendar",
  channel_post: "channels",
  new_message: "chat",
  chat_mention: "chat",
  chat_reply: "chat",
  chat_room_message: "chat",
};

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
