import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { sendFcmToUser, payloadForNotification } from "@/lib/fcm";
import { renderNotifText, isKeyed, type NotifText } from "@/lib/notif-render";
import {
  eventForType,
  isExternalChannel,
  prefEventsFor,
  prefKey,
  type EventId,
  type ExternalChannel,
  type QuietHours,
} from "@/lib/notification-events";
import { decide, SendGate, type ChannelLite } from "@/lib/notify-decide";
import { ADAPTERS } from "@/lib/notify-channels";
import type { ChannelMessage, SendResult } from "@/lib/notify-channels/types";
import type { NotifFull } from "@/lib/notify-text";

/**
 * The notification dispatcher. For every recipient it decides — from the event's
 * defaults, the user's NotificationPref overrides, which channels are connected
 * and quiet hours (src/lib/notify-decide.ts) — whether to write the bell row,
 * send Web Push, and send through each external channel adapter.
 *
 * Next-free on purpose: also used from server/*.ts (price alerts, sockets).
 * External sends are fire-and-forget (like Web Push always was) so an API
 * request never waits on Telegram / WhatsApp / a user's webhook.
 */

const globalForIO = globalThis as unknown as { io?: { to(room: string): { emit(ev: string): void } } };

export function emitNotification(userId: string) {
  globalForIO.io?.to(`user_${userId}`).emit("new_notification");
}

/** Consecutive HARD failures (bot blocked, number unreachable...) after which a channel is switched off. */
export const MAX_HARD_FAILS = 3;

const gateHolder = globalThis as unknown as { __notifyGate?: SendGate };
function gate(): SendGate {
  return (gateHolder.__notifyGate ??= new SendGate());
}

// ---------------------------------------------------------------------------
// Loading what the decision needs
// ---------------------------------------------------------------------------

interface ChannelRow extends ChannelLite {
  userId: string;
  failCount: number;
  lastError: string | null;
  lastSentAt: Date | null;
}

interface DeliveryContext {
  channels: Map<string, ChannelRow[]>;
  overrides: Map<string, Map<string, boolean>>;
  quiet: Map<string, QuietHours>;
}

const EMPTY_CTX = (): DeliveryContext => ({ channels: new Map(), overrides: new Map(), quiet: new Map() });

/**
 * Fail-soft: if the notification tables are not there yet (migration not
 * applied) or the DB hiccups, fall back to the pre-feature behaviour — bell +
 * Web Push, no external channels — instead of losing the notification.
 */
async function loadContext(userIds: string[], event: EventId): Promise<DeliveryContext> {
  const ctx = EMPTY_CTX();
  try {
    const [channels, prefs, settings] = await Promise.all([
      prisma.notificationChannel.findMany({
        where: { userId: { in: userIds }, verified: true, enabled: true },
        select: { id: true, userId: true, channel: true, address: true, verified: true, enabled: true, secret: true, failCount: true, lastError: true, lastSentAt: true },
      }),
      prisma.notificationPref.findMany({ where: { userId: { in: userIds }, event: { in: prefEventsFor(event) } }, select: { userId: true, event: true, channel: true, enabled: true } }),
      prisma.notificationSetting.findMany({ where: { userId: { in: userIds }, quietEnabled: true } }),
    ]);
    for (const c of channels) {
      if (!isExternalChannel(c.channel)) continue;
      const list = ctx.channels.get(c.userId) ?? [];
      list.push({ ...c, channel: c.channel as ExternalChannel });
      ctx.channels.set(c.userId, list);
    }
    for (const p of prefs) {
      const m = ctx.overrides.get(p.userId) ?? new Map<string, boolean>();
      m.set(prefKey(p.event, p.channel), p.enabled);
      ctx.overrides.set(p.userId, m);
    }
    for (const s of settings) {
      ctx.quiet.set(s.userId, { enabled: s.quietEnabled, startMin: s.quietStartMin, endMin: s.quietEndMin, timezone: s.timezone });
    }
  } catch (e) {
    console.error("[notify] preference lookup failed, using legacy delivery:", e instanceof Error ? e.message : e);
    return EMPTY_CTX();
  }
  return ctx;
}

async function loadLocales(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, locale: true } });
  for (const u of users) map.set(u.id, u.locale);
  return map;
}

// ---------------------------------------------------------------------------
// Result bookkeeping
// ---------------------------------------------------------------------------

/** What to write to the NotificationChannel row after a send attempt (null = nothing). Pure. */
export function nextChannelState(
  row: { failCount: number; lastError: string | null; lastSentAt: Date | null },
  result: SendResult,
  now: Date = new Date()
): { data: { lastSentAt?: Date; lastError?: string | null; failCount?: number; enabled?: boolean }; disabled: boolean } | null {
  if (result.ok) {
    const stale = !row.lastSentAt || now.getTime() - row.lastSentAt.getTime() > 60_000;
    if (!row.lastError && row.failCount === 0 && !stale) return null; // nothing changed — skip the write
    return { data: { lastSentAt: now, lastError: null, failCount: 0 }, disabled: false };
  }
  const error = (result.error || "send failed").slice(0, 300);
  if (!result.permanent) return { data: { lastError: error }, disabled: false };
  const failCount = row.failCount + 1;
  if (failCount >= MAX_HARD_FAILS) {
    return { data: { lastError: error, failCount, enabled: false }, disabled: true };
  }
  return { data: { lastError: error, failCount }, disabled: false };
}

async function recordResult(row: ChannelRow, result: SendResult) {
  const next = nextChannelState(row, result);
  if (!next) return;
  try {
    await prisma.notificationChannel.update({ where: { id: row.id }, data: next.data });
    if (next.disabled) console.warn(`[notify] channel ${row.channel} of user ${row.userId} disabled after ${MAX_HARD_FAILS} hard failures: ${next.data.lastError}`);
  } catch {
    // The row may have been deleted meanwhile — nothing to record.
  }
}

/** Direct send through one channel (the "send test" button): no gate, no preferences, result recorded. */
export async function sendThroughChannel(
  row: { id: string; userId: string; channel: ExternalChannel; address: string | null; secret?: string | null; failCount?: number; lastError?: string | null; lastSentAt?: Date | null },
  msg: ChannelMessage
): Promise<SendResult> {
  let result: SendResult;
  try {
    result = await ADAPTERS[row.channel].send(row, msg);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "send failed" };
  }
  await recordResult({ failCount: 0, lastError: null, lastSentAt: null, verified: true, enabled: true, ...row }, result);
  return result;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface DispatchInput {
  recipients: string[];
  /** Notification.type stored on the bell row; mapped to an event unless `event` is given */
  type: string;
  event?: EventId;
  title: NotifText;
  body?: NotifText;
  link?: string;
  /**
   * Full content of the item (see NotifFull). The bell row and Web Push keep the short title/body;
   * the external channels get `fullText` only for recipients that may read it.
   */
  full?: NotifFull;
}

export interface DispatchedRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

const allowedSets = new WeakMap<string[], Set<string>>();

/**
 * ACCESS GATE for the full text. The full content goes into the message only when the caller
 * supplied it AND this recipient is allowed to read it: `full.fullTextFor` lists them (undefined =
 * the caller asserts the content is readable by every recipient of the call). Anyone else keeps the teaser.
 */
export function withFullContent(base: ChannelMessage, full: NotifFull | undefined, userId: string): ChannelMessage {
  if (!full?.fullText) return base;
  if (full.fullTextFor) {
    let set = allowedSets.get(full.fullTextFor);
    if (!set) allowedSets.set(full.fullTextFor, (set = new Set(full.fullTextFor)));
    if (!set.has(userId)) return base;
  }
  return { ...base, fullText: full.fullText, ...(full.author ? { author: full.author } : {}), ...(full.images?.length ? { images: full.images } : {}) };
}

/** Short fingerprint so two messages sharing a teaser but differing in the full text are not collapsed as duplicates. */
function fullTextSig(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${s.length}:${h.toString(36)}`;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch {
        // one recipient's failure never blocks the rest
      }
    }
  });
  await Promise.all(workers);
}

export async function dispatchNotification(input: DispatchInput): Promise<DispatchedRow[]> {
  const userIds = [...new Set(input.recipients)];
  if (userIds.length === 0) return [];
  const event = input.event ?? eventForType(input.type);
  const now = new Date();

  const ctx = await loadContext(userIds, event);
  const decisions = new Map(
    userIds.map((userId) => [
      userId,
      decide({ event, overrides: ctx.overrides.get(userId), channels: ctx.channels.get(userId), quiet: ctx.quiet.get(userId), now }),
    ])
  );

  const needLocale = isKeyed(input.title) || isKeyed(input.body) || [...decisions.values()].some((d) => d.external.length > 0);
  const locales = needLocale ? await loadLocales(userIds) : new Map<string, string>();
  const render = (userId: string) => {
    const locale = locales.get(userId);
    return {
      locale: locale ?? "ru",
      title: renderNotifText(input.title, locale),
      body: input.body === undefined ? undefined : renderNotifText(input.body, locale),
    };
  };

  // 1) Bell rows (in each recipient's language), unless the user switched the bell off for this event.
  const inappUsers = userIds.filter((u) => decisions.get(u)!.inapp);
  let created: DispatchedRow[] = [];
  if (inappUsers.length > 0) {
    created = (await prisma.notification.createManyAndReturn({
      data: inappUsers.map((userId) => {
        const r = render(userId);
        return { userId, type: input.type, title: r.title, body: r.body, link: input.link };
      }),
    })) as DispatchedRow[];
    for (const userId of inappUsers) emitNotification(userId);
  }

  // 2) Web Push + external channels — fire-and-forget.
  for (const userId of userIds) {
    const d = decisions.get(userId)!;
    if (d.webpush) {
      const r = render(userId);
      sendPushToUser(userId, { title: r.title, body: r.body, url: input.link }).catch(() => {});
      // The Android app (FCM) is the same «В приложении» channel: same preference cell, same quiet hours. No-op until
      // FCM_SERVICE_ACCOUNT_FILE/JSON is configured (src/lib/fcm.ts).
      sendFcmToUser(userId, payloadForNotification({ type: input.type, event, title: r.title, body: r.body, link: input.link })).catch(() => {});
    }
  }
  const jobs: Array<{ row: ChannelRow; msg: ChannelMessage }> = [];
  for (const userId of userIds) {
    const d = decisions.get(userId)!;
    if (d.external.length === 0) continue;
    const r = render(userId);
    const msg = withFullContent({ title: r.title, body: r.body, link: input.link, locale: r.locale }, input.full, userId);
    for (const ch of d.external) jobs.push({ row: ch as ChannelRow, msg });
  }
  if (jobs.length > 0) {
    void mapLimit(jobs, 8, async ({ row, msg }) => {
      const verdict = gate().check(row.id, `${msg.title}|${msg.body ?? ""}|${msg.link ?? ""}${msg.fullText ? "|" + fullTextSig(msg.fullText) : ""}`);
      if (!verdict.allowed) return;
      const message = verdict.suppressedBefore ? { ...msg, suppressed: verdict.suppressedBefore } : msg;
      let result: SendResult;
      try {
        result = await ADAPTERS[row.channel].send(row, message);
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "send failed" };
      }
      await recordResult(row, result);
    }).catch(() => {});
  }

  return created;
}
