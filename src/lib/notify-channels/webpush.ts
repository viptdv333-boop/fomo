import { isPushConfigured, sendPushToUser } from "@/lib/push";
import { absoluteLink, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * Web Push (browser / installed PWA). Not a NotificationChannel row: the
 * devices live in PushSubscription. This wrapper only gives it the same
 * send(row, message) shape as the other adapters; `row` is { userId }.
 */
export function isConfigured(): boolean {
  return isPushConfigured();
}

export async function send(row: Pick<ChannelRowLite, "userId">, msg: ChannelMessage): Promise<SendResult> {
  if (!isPushConfigured()) return { ok: false, error: "VAPID keys are not configured" };
  // The service worker opens `url` as given; keep it a site-relative path when it is one.
  const url = msg.link && !/^https?:\/\//i.test(msg.link) ? msg.link : absoluteLink(msg.link, msg.locale);
  const sent = await sendPushToUser(row.userId, { title: msg.title, body: msg.body, url });
  return sent > 0 ? { ok: true } : { ok: false, error: "no devices" };
}
