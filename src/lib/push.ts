import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@fomo.spot";

const PUSH_ENABLED = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (PUSH_ENABLED) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
}

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

/// Sends a Web Push notification to every device the user has subscribed
/// from. Best-effort: a dead subscription (device unsubscribed, browser data
/// cleared) makes the push service respond 404/410, at which point we prune
/// that row so it stops being retried on every future notification.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!PUSH_ENABLED) {
    console.error("[push] VAPID keys not configured — skipping send");
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(
            `[push] send failed for subscription ${sub.id} (status ${err?.statusCode}):`,
            err?.body || err?.message || err
          );
        }
      }
    })
  );
}
