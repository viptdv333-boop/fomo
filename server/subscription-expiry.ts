/**
 * "Подписка скоро закончится": every few hours, remind subscribers whose paid-channel subscription ends
 * within EXPIRY_DAYS days (event `subscription_expiring` of the notification preferences).
 *
 * OFF unless SUBSCRIPTION_EXPIRY_NOTICE=1 — it is a notification the site never sent before, so it is
 * switched on deliberately by the owner. A reminder is sent once per subscription end: the previous reminder
 * is looked up in the bell table (type "subscription_expiring", same link) instead of a new column.
 * Next-free imports only (same rule as alert-scheduler.ts).
 */

import { prisma } from "../src/lib/prisma";
import { dispatchNotification } from "../src/lib/notify-dispatch";

const TICK_MS = 6 * 60 * 60 * 1000;
const EXPIRY_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

const g = globalThis as unknown as { subscriptionExpiryTimer?: ReturnType<typeof setInterval> };

async function tick() {
  const now = new Date();
  const subs = await prisma.subscription.findMany({
    where: { status: "active", endDate: { gt: now, lte: new Date(now.getTime() + EXPIRY_DAYS * DAY) }, tariffId: { not: null } },
    select: { id: true, subscriberId: true, endDate: true, tariff: { select: { id: true, slug: true, name: true } } },
  });
  if (subs.length === 0) return;

  const linkOf = (s: (typeof subs)[number]) => `/channels/${s.tariff?.slug || s.tariff?.id}`;
  const already = await prisma.notification.findMany({
    where: {
      type: "subscription_expiring",
      userId: { in: [...new Set(subs.map((s) => s.subscriberId))] },
      createdAt: { gt: new Date(now.getTime() - (EXPIRY_DAYS + 2) * DAY) },
    },
    select: { userId: true, link: true },
  });
  const seen = new Set(already.map((n) => `${n.userId}|${n.link}`));

  for (const s of subs) {
    if (!s.tariff) continue;
    const link = linkOf(s);
    if (seen.has(`${s.subscriberId}|${link}`)) continue;
    seen.add(`${s.subscriberId}|${link}`);
    const days = Math.max(1, Math.ceil((s.endDate.getTime() - now.getTime()) / DAY));
    await dispatchNotification({
      recipients: [s.subscriberId],
      type: "subscription_expiring",
      title: { key: "ns.notif.subExpiring.title", vars: { channel: s.tariff.name, days } },
      body: { key: "ns.notif.subExpiring.body" },
      link,
    });
  }
}

export function startSubscriptionExpiryNotices() {
  if (process.env.SUBSCRIPTION_EXPIRY_NOTICE !== "1") return;
  if (g.subscriptionExpiryTimer) return;
  const run = () => tick().catch((e) => console.error("[SubscriptionExpiry]", e instanceof Error ? e.message : e));
  setTimeout(run, 60_000); // not during boot
  g.subscriptionExpiryTimer = setInterval(run, TICK_MS);
  console.log("[SubscriptionExpiry] reminders enabled");
}
