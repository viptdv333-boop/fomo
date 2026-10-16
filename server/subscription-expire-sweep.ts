/**
 * Finished paid subscriptions: every ~10 minutes flip «active» rows whose endDate has passed to «expired» (and tell the
 * subscriber once, event subscription_changes), and delete rows that have been expired for more than EXPIRED_KEEP_DAYS (default 14).
 * That is what makes the channel owner's «Участники» list drop people whose term is over (the expired go to a collapsed section
 * for 14 days, then disappear). Payments stay in PaymentRequest, so nobody's income figures change. Rules + the pass itself:
 * src/lib/subscription-expire.ts.
 *
 * SUBSCRIPTION_EXPIRE_SWEEP=0 switches it off; SUBSCRIPTION_EXPIRE_SWEEP_MS changes the period (default 10 min, min 30 s);
 * EXPIRED_KEEP_DAYS changes the retention.
 * Next-free imports only (same rule as alert-scheduler.ts).
 */

import { prisma } from "../src/lib/prisma";
import { dispatchNotification } from "../src/lib/notify-dispatch";
import { keepDaysFromEnv, runExpireSweep, type ExpireDb } from "../src/lib/subscription-expire";

const DEFAULT_TICK_MS = 10 * 60 * 1000;

const g = globalThis as unknown as { subscriptionExpireSweepTimer?: ReturnType<typeof setInterval> };

export function startSubscriptionExpireSweep() {
  if (process.env.SUBSCRIPTION_EXPIRE_SWEEP === "0") return;
  if (g.subscriptionExpireSweepTimer) return;
  const ms = Math.max(30_000, Number(process.env.SUBSCRIPTION_EXPIRE_SWEEP_MS) || DEFAULT_TICK_MS);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runExpireSweep(prisma as unknown as ExpireDb, (n) => dispatchNotification(n), {
        keepDays: keepDaysFromEnv(process.env.EXPIRED_KEEP_DAYS),
      });
      if (r.expired > 0 || r.deleted > 0) {
        console.log(`[SubscriptionExpire] expired ${r.expired} (notified ${r.notified}), deleted ${r.deleted}`);
      }
    } catch (e) {
      console.error("[SubscriptionExpire]", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 45_000); // not during boot
  g.subscriptionExpireSweepTimer = setInterval(run, ms);
}
