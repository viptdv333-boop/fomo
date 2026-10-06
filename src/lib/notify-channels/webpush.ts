import { isPushConfigured, sendPushToUser } from "@/lib/push";
import { isFcmConfigured, sendFcmToUser } from "@/lib/fcm";
import { absoluteLink, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * Web Push (browser / installed PWA). Not a NotificationChannel row: the
 * devices live in PushSubscription (browsers) and FcmToken (the Android app).
 * This wrapper only gives it the same send(row, message) shape as the other
 * adapters; `row` is { userId }.
 */
export function isConfigured(): boolean {
  return isPushConfigured() || isFcmConfigured();
}

export async function send(row: Pick<ChannelRowLite, "userId">, msg: ChannelMessage): Promise<SendResult> {
  if (!isPushConfigured() && !isFcmConfigured()) return { ok: false, error: "Push is not configured" };
  // The service worker opens `url` as given; keep it a site-relative path when it is one.
  const url = msg.link && !/^https?:\/\//i.test(msg.link) ? msg.link : absoluteLink(msg.link, msg.locale);
  const web = isPushConfigured() ? await sendPushToUser(row.userId, { title: msg.title, body: msg.body, url }) : 0;
  const app = isFcmConfigured() ? (await sendFcmToUser(row.userId, { title: msg.title, body: msg.body, link: msg.link, type: "system", event: "system" })).sent : 0;
  return web + app > 0 ? { ok: true } : { ok: false, error: "no devices" };
}
