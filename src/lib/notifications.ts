import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { canAccessRoom } from "@/lib/channel-access";
import { tFor } from "@/lib/i18n/server";

// Access the global IO instance set by server/socket.ts
const globalForIO = globalThis as unknown as { io: any };

function emitNotification(userId: string) {
  const io = globalForIO.io;
  if (io) {
    io.to(`user_${userId}`).emit("new_notification");
  }
}

/// A placeholder value: user-provided text (idea title, display name, channel
/// name…) goes in as-is; `{ key }` is itself translated for the recipient —
/// for server fallbacks like "Покупатель" when a name is missing.
export type NotifVar = string | number | { key: string };

/// Notification text: a plain string is stored/sent verbatim (user-generated
/// content, e.g. a comment preview); `{ key, vars }` is translated into each
/// recipient's own User.locale.
export type NotifText = string | { key: string; vars?: Record<string, NotifVar> };

function isKeyed(text: NotifText | undefined): boolean {
  return typeof text === "object" && text !== null;
}

/// Renders a NotifText for one locale. `escapeVar` is applied to every
/// substituted value (Telegram HTML escaping) — never to the template itself,
/// so markup in the dictionary (<b>) survives.
export function renderNotifText(
  text: NotifText,
  locale: string | null | undefined,
  escapeVar?: (s: string) => string
): string {
  if (typeof text === "string") return text;
  const t = tFor(locale);
  let vars: Record<string, string | number> | undefined;
  if (text.vars) {
    vars = {};
    for (const [k, v] of Object.entries(text.vars)) {
      const raw = typeof v === "object" && v !== null ? t(v.key) : v;
      vars[k] = escapeVar ? escapeVar(String(raw)) : raw;
    }
  }
  return t(text.key, vars);
}

/// Recipients' saved languages in ONE query. Skipped entirely when every text
/// is a plain string, so user-generated notifications cost no extra query.
export async function loadUserLocales(
  userIds: string[],
  ...texts: (NotifText | undefined)[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0 || !texts.some(isKeyed)) return map;
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, locale: true },
  });
  for (const u of users) map.set(u.id, u.locale);
  return map;
}

/// Writes one Notification row per recipient (each in their own language),
/// then fires the socket ping and push with the same translated strings.
async function deliver(
  recipients: string[],
  type: string,
  title: NotifText,
  body: NotifText | undefined,
  link: string | undefined
) {
  const locales = await loadUserLocales(recipients, title, body);
  const rows = recipients.map((userId) => {
    const locale = locales.get(userId);
    return {
      userId,
      type,
      title: renderNotifText(title, locale),
      body: body === undefined ? undefined : renderNotifText(body, locale),
      link,
    };
  });

  await prisma.notification.createMany({ data: rows });

  for (const row of rows) {
    emitNotification(row.userId);
    sendPushToUser(row.userId, { title: row.title, body: row.body, url: link }).catch(() => {});
  }
}

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: NotifText;
  body?: NotifText;
  link?: string;
}

export async function createNotification({
  userId,
  type,
  title,
  body,
  link,
}: CreateNotificationParams) {
  const locale = (await loadUserLocales([userId], title, body)).get(userId);
  const titleText = renderNotifText(title, locale);
  const bodyText = body === undefined ? undefined : renderNotifText(body, locale);

  const notification = await prisma.notification.create({
    data: { userId, type, title: titleText, body: bodyText, link },
  });
  emitNotification(userId);
  sendPushToUser(userId, { title: titleText, body: bodyText, url: link }).catch(() => {});
  return notification;
}

export async function notifyFollowers(
  authorId: string,
  type: string,
  title: NotifText,
  body?: NotifText,
  link?: string
) {
  const followers = await prisma.follow.findMany({
    where: { authorId },
    select: { followerId: true },
  });

  if (followers.length === 0) return;

  await deliver(
    followers.map((f) => f.followerId),
    type,
    title,
    body,
    link
  );
}

// Every message in a room, not just @mentions — opt-in via the болталка bell
// (ChatRoomNotify). excludeUserId is always the sender, so a message never
// notifies its own author.
export async function notifyRoomSubscribers(
  roomId: string,
  excludeUserIds: string[],
  type: string,
  title: NotifText,
  body?: NotifText,
  link?: string
) {
  const subscribers = await prisma.chatRoomNotify.findMany({
    where: { roomId, userId: { notIn: excludeUserIds } },
    select: { userId: true },
  });
  if (subscribers.length === 0) return;

  // Re-check access on every send, not just at subscribe time — a private
  // room can remove a member, or a paid channel's subscription can lapse,
  // after the ChatRoomNotify row was created; without this a stale row
  // would keep leaking message previews via notification/push.
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  if (!room) return;

  let candidateIds = subscribers.map((s) => s.userId);
  if (room.ownerId) {
    const members = await prisma.chatRoomMember.findMany({
      where: { roomId, userId: { in: candidateIds } },
      select: { userId: true },
    });
    candidateIds = members.map((m) => m.userId);
  }
  if (candidateIds.length === 0) return;

  const allowed = await Promise.all(
    candidateIds.map(async (userId) => ((await canAccessRoom(prisma, roomId, userId)) ? userId : null))
  );
  const recipients = allowed.filter((id): id is string => id !== null);
  if (recipients.length === 0) return;

  await deliver(recipients, type, title, body, link);
}

// New post in a paid channel — every active subscriber, not just those who
// enabled the Telegram toggle. The author never notifies themselves.
export async function notifyChannelSubscribers(
  tariffId: string,
  excludeUserIds: string[],
  title: NotifText,
  body?: NotifText,
  link?: string,
  type = "channel_post"
) {
  const subs = await prisma.subscription.findMany({
    where: {
      tariffId,
      status: "active",
      endDate: { gt: new Date() },
      subscriberId: { notIn: excludeUserIds },
    },
    select: { subscriberId: true },
  });
  const recipients = [...new Set(subs.map((s) => s.subscriberId))];
  if (recipients.length === 0) return;

  await deliver(recipients, type, title, body, link);
}
