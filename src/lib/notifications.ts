import { prisma } from "@/lib/prisma";
import { canAccessRoom } from "@/lib/channel-access";
import { dispatchNotification } from "@/lib/notify-dispatch";
import { isKeyed, renderNotifText, type NotifText, type NotifVar } from "@/lib/notif-render";
import type { EventId } from "@/lib/notification-events";
import type { NotifFull } from "@/lib/notify-text";

// The rendering helpers moved to notif-render.ts (Next-free) so the custom
// server can use them; re-exported here for the existing importers.
export { renderNotifText };
export type { NotifText, NotifVar };

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

/// Every notification goes through src/lib/notify-dispatch.ts: it writes the
/// bell row (each recipient's own language) and — per the user's event
/// preferences (NotificationPref) and connected channels — Web Push, e-mail,
/// Telegram, WhatsApp, MAX, VK and webhook. `type` maps to an event through
/// EVENT_FOR_TYPE in notification-events.ts (pass `event` to override).
async function deliver(
  recipients: string[],
  type: string,
  title: NotifText,
  body: NotifText | undefined,
  link: string | undefined,
  event?: EventId,
  full?: NotifFull
) {
  await dispatchNotification({ recipients, type, title, body, link, event, full });
}

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: NotifText;
  body?: NotifText;
  link?: string;
  /// Preference event; defaults to the one mapped from `type`.
  event?: EventId;
  /// Full content for the external channels (e-mail / Telegram / ...); the bell keeps `body`.
  full?: NotifFull;
}

export async function createNotification({
  userId,
  type,
  title,
  body,
  link,
  event,
  full,
}: CreateNotificationParams) {
  const rows = await dispatchNotification({ recipients: [userId], type, title, body, link, event, full });
  // null when the user switched the bell off for this event.
  return rows[0] ?? null;
}

export async function notifyFollowers(
  authorId: string,
  type: string,
  title: NotifText,
  body?: NotifText,
  link?: string,
  full?: NotifFull & {
    /// The item is a single paid idea: its text is readable only with an active subscription to the
    /// author (the same rule as GET /api/ideas/[id]). Followers without one keep the teaser.
    paywalled?: boolean;
  }
) {
  const followers = await prisma.follow.findMany({
    where: { authorId },
    select: { followerId: true },
  });

  if (followers.length === 0) return;
  const recipients = followers.map((f) => f.followerId);

  let fullOut: NotifFull | undefined = full;
  if (full?.paywalled) {
    const subs = await prisma.subscription.findMany({
      where: { authorId, subscriberId: { in: recipients }, status: "active", endDate: { gt: new Date() } },
      select: { subscriberId: true },
    });
    fullOut = { ...full, fullTextFor: [...new Set(subs.map((s) => s.subscriberId))] };
  }

  await deliver(recipients, type, title, body, link, undefined, fullOut);
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
  link?: string,
  full?: NotifFull
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

  // Every recipient passed the member + canAccessRoom check above, so the message text is theirs to read.
  await deliver(recipients, type, title, body, link, undefined, full);
}

// New post in a paid channel — every active subscriber, not just those who
// enabled the Telegram toggle. The author never notifies themselves.
export async function notifyChannelSubscribers(
  tariffId: string,
  excludeUserIds: string[],
  title: NotifText,
  body?: NotifText,
  link?: string,
  type = "channel_post",
  full?: NotifFull
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

  // Recipients are exactly the channel's active subscribers — the audience that may read its posts.
  await deliver(recipients, type, title, body, link, undefined, full);
}
