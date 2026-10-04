/**
 * Catalog of notification events and the preference model.
 *
 * Pure data + pure functions, no Next/Prisma imports — shared by the
 * dispatcher (src/lib/notify-dispatch.ts), the settings API and the settings UI.
 *
 * Model: every Notification.type string emitted by the app maps to ONE event id
 * (EVENT_FOR_TYPE). A user's NotificationPref rows are explicit overrides per
 * (event, channel); a missing row falls back to the defaults defined here.
 */

/** Delivery channels as seen by the preference matrix. 'inapp' is the bell. */
export const CHANNEL_IDS = ["inapp", "webpush", "email", "telegram", "whatsapp", "max", "vk", "webhook"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/** Channels that live in the NotificationChannel table (need connecting). */
export const EXTERNAL_CHANNELS = ["email", "telegram", "whatsapp", "max", "vk", "webhook"] as const;
export type ExternalChannel = (typeof EXTERNAL_CHANNELS)[number];

export function isChannelId(v: unknown): v is ChannelId {
  return typeof v === "string" && (CHANNEL_IDS as readonly string[]).includes(v);
}
export function isExternalChannel(v: unknown): v is ExternalChannel {
  return typeof v === "string" && (EXTERNAL_CHANNELS as readonly string[]).includes(v);
}

export type EventGroup = "mine" | "talk" | "subs" | "money" | "terminal";
export const EVENT_GROUPS: EventGroup[] = ["mine", "talk", "subs", "money", "terminal"];

export const EVENT_IDS = [
  "mention",
  "quote_me",
  "comment_on_my_idea",
  "comment_on_my_comment",
  "new_subscriber",
  "dm",
  "chat_room_message",
  "room_join",
  "new_idea_from_followed_author",
  "new_post_in_subscribed_channel",
  "new_comment_in_subscribed_channel",
  "subscription_changes",
  "subscription_expiring",
  "payment_events",
  "price_alert",
  "line_alert",
  "calendar_reminder",
  "system",
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export interface EventDef {
  id: EventId;
  group: EventGroup;
  /** i18n keys in src/lib/i18n/dict/notifsettings.ts */
  labelKey: string;
  descKey: string;
  /** Cannot be switched off: the in-app bell and e-mail always get it. */
  alwaysOn?: boolean;
  /** Channels that may carry this event at all (default: every channel). */
  channels?: ChannelId[];
  /**
   * Default for an EXTERNAL channel the user has just connected (e-mail,
   * Telegram, ...). Connecting is an explicit opt-in, so the personal events
   * start on and the noisy ones (every room message, channel discussion) off.
   */
  externalDefault: boolean;
  /** Default for the Web Push column — kept equal to what the app did before this feature. */
  webpushDefault: boolean;
}

export const EVENTS: EventDef[] = [
  // --- Мои публикации и обо мне
  { id: "mention", group: "mine", labelKey: "ns.ev.mention", descKey: "ns.ev.mention.d", externalDefault: true, webpushDefault: true },
  { id: "quote_me", group: "mine", labelKey: "ns.ev.quote_me", descKey: "ns.ev.quote_me.d", externalDefault: true, webpushDefault: true },
  { id: "comment_on_my_idea", group: "mine", labelKey: "ns.ev.comment_on_my_idea", descKey: "ns.ev.comment_on_my_idea.d", externalDefault: true, webpushDefault: true },
  { id: "comment_on_my_comment", group: "mine", labelKey: "ns.ev.comment_on_my_comment", descKey: "ns.ev.comment_on_my_comment.d", externalDefault: true, webpushDefault: true },
  { id: "new_subscriber", group: "mine", labelKey: "ns.ev.new_subscriber", descKey: "ns.ev.new_subscriber.d", externalDefault: true, webpushDefault: true },
  // --- Разговоры
  { id: "dm", group: "talk", labelKey: "ns.ev.dm", descKey: "ns.ev.dm.d", externalDefault: true, webpushDefault: true },
  { id: "chat_room_message", group: "talk", labelKey: "ns.ev.chat_room_message", descKey: "ns.ev.chat_room_message.d", externalDefault: false, webpushDefault: true },
  { id: "room_join", group: "talk", labelKey: "ns.ev.room_join", descKey: "ns.ev.room_join.d", externalDefault: false, webpushDefault: true },
  // --- Подписки
  { id: "new_idea_from_followed_author", group: "subs", labelKey: "ns.ev.new_idea_from_followed_author", descKey: "ns.ev.new_idea_from_followed_author.d", externalDefault: true, webpushDefault: true },
  { id: "new_post_in_subscribed_channel", group: "subs", labelKey: "ns.ev.new_post_in_subscribed_channel", descKey: "ns.ev.new_post_in_subscribed_channel.d", externalDefault: true, webpushDefault: true },
  { id: "new_comment_in_subscribed_channel", group: "subs", labelKey: "ns.ev.new_comment_in_subscribed_channel", descKey: "ns.ev.new_comment_in_subscribed_channel.d", externalDefault: false, webpushDefault: true },
  { id: "subscription_changes", group: "subs", labelKey: "ns.ev.subscription_changes", descKey: "ns.ev.subscription_changes.d", externalDefault: true, webpushDefault: true },
  { id: "subscription_expiring", group: "subs", labelKey: "ns.ev.subscription_expiring", descKey: "ns.ev.subscription_expiring.d", externalDefault: true, webpushDefault: true },
  // --- Платежи и система
  { id: "payment_events", group: "money", labelKey: "ns.ev.payment_events", descKey: "ns.ev.payment_events.d", externalDefault: true, webpushDefault: true },
  {
    id: "system",
    group: "money",
    labelKey: "ns.ev.system",
    descKey: "ns.ev.system.d",
    alwaysOn: true,
    channels: ["inapp", "email"],
    externalDefault: true,
    webpushDefault: false,
  },
  // --- Терминал и календарь
  { id: "price_alert", group: "terminal", labelKey: "ns.ev.price_alert", descKey: "ns.ev.price_alert.d", externalDefault: true, webpushDefault: true },
  { id: "line_alert", group: "terminal", labelKey: "ns.ev.line_alert", descKey: "ns.ev.line_alert.d", externalDefault: true, webpushDefault: true },
  { id: "calendar_reminder", group: "terminal", labelKey: "ns.ev.calendar_reminder", descKey: "ns.ev.calendar_reminder.d", externalDefault: true, webpushDefault: true },
];

const EVENT_BY_ID = new Map<EventId, EventDef>(EVENTS.map((e) => [e.id, e]));

export function getEvent(id: string): EventDef | undefined {
  return EVENT_BY_ID.get(id as EventId);
}
export function isEventId(v: unknown): v is EventId {
  return typeof v === "string" && EVENT_BY_ID.has(v as EventId);
}

/**
 * Notification.type (as passed to createNotification / notify*) → event.
 * Every `type` string in the codebase is listed; unknown ones fall back to
 * "system" (always shown in the bell, e-mailed if an address is connected).
 */
export const EVENT_FOR_TYPE: Record<string, EventId> = {
  chat_mention: "mention",
  chat_reply: "quote_me",
  new_comment: "comment_on_my_idea",
  comment_reply: "comment_on_my_comment",
  new_follower: "new_subscriber",
  new_message: "dm",
  chat_room_message: "chat_room_message",
  room_join: "room_join",
  new_idea: "new_idea_from_followed_author",
  channel_post: "new_post_in_subscribed_channel",
  channel_comment: "new_comment_in_subscribed_channel",
  subscription_extended: "subscription_changes",
  subscription_removed: "subscription_changes",
  subscription: "payment_events",
  payment: "payment_events",
  subscription_expiring: "subscription_expiring",
  price_alert: "price_alert",
  line_alert: "line_alert",
  calendar_reminder: "calendar_reminder",
  // admin / moderation / announcements
  report: "system",
  broadcast: "system",
  email_broadcast: "system",
  system: "system",
  security: "system",
};

export function eventForType(type: string): EventId {
  return EVENT_FOR_TYPE[type] ?? "system";
}

/** Can this event be carried by this channel at all? */
export function channelAllowed(event: EventId, channel: ChannelId): boolean {
  const def = EVENT_BY_ID.get(event);
  if (!def) return false;
  return !def.channels || def.channels.includes(channel);
}

/** Built-in default of one cell of the matrix (before overrides, ignoring whether the channel is connected). */
export function defaultEnabled(event: EventId, channel: ChannelId): boolean {
  const def = EVENT_BY_ID.get(event);
  if (!def || !channelAllowed(event, channel)) return false;
  if (def.alwaysOn) return channel === "inapp" || channel === "email";
  if (channel === "inapp") return true;
  if (channel === "webpush") return def.webpushDefault;
  return def.externalDefault;
}

/**
 * Events that were split out of an older one: until the user sets their own switch for the new event, it follows the
 * switch of the old one. "price_alert" used to carry line alerts too, so someone who had switched price alerts off
 * for Telegram does not suddenly start getting line alerts there.
 */
export const LEGACY_PREF_FALLBACK: Partial<Record<EventId, EventId>> = { line_alert: "price_alert" };

/** Events whose stored overrides matter for `event` (itself first, then its legacy fallback). Used to load prefs from the DB. */
export function prefEventsFor(event: EventId): EventId[] {
  const fb = LEGACY_PREF_FALLBACK[event];
  return fb ? [event, fb] : [event];
}

/** key for a flat override map: `${event}:${channel}` */
export function prefKey(event: EventId | string, channel: ChannelId | string): string {
  return `${event}:${channel}`;
}

export type PrefOverrides = Map<string, boolean> | Record<string, boolean>;

function lookup(overrides: PrefOverrides | undefined, key: string): boolean | undefined {
  if (!overrides) return undefined;
  return overrides instanceof Map ? overrides.get(key) : overrides[key];
}

/**
 * Is `event` delivered on `channel` for a user with these overrides?
 * Always-on events ignore overrides (they are on for inapp + email, off elsewhere).
 */
export function isEnabled(event: EventId, channel: ChannelId, overrides?: PrefOverrides): boolean {
  if (!channelAllowed(event, channel)) return false;
  const def = EVENT_BY_ID.get(event)!;
  if (def.alwaysOn) return channel === "inapp" || channel === "email";
  let o = lookup(overrides, prefKey(event, channel));
  if (o === undefined) {
    const fb = LEGACY_PREF_FALLBACK[event];
    if (fb) o = lookup(overrides, prefKey(fb, channel));
  }
  return o !== undefined ? o : defaultEnabled(event, channel);
}

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

export interface QuietHours {
  enabled: boolean;
  /** minutes since local midnight, 0..1439 */
  startMin: number;
  endMin: number;
  /** IANA time zone, e.g. "Europe/Moscow" */
  timezone: string;
}

/** Local minutes-since-midnight of `now` in `timezone` (falls back to UTC on a bad zone). */
export function localMinutes(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return (h % 24) * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** True while `now` is inside the quiet window (the window may wrap midnight; start === end = never). */
export function isQuietNow(q: QuietHours | null | undefined, now: Date): boolean {
  if (!q || !q.enabled || q.startMin === q.endMin) return false;
  const cur = localMinutes(now, q.timezone);
  return q.startMin < q.endMin ? cur >= q.startMin && cur < q.endMin : cur >= q.startMin || cur < q.endMin;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
