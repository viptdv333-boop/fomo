/**
 * Terminal price alerts: every ~15 s load the active alerts, fetch one batch of quotes for their
 * instruments, evaluate them (src/lib/alerts/evaluate.ts) and notify the owner on a trigger.
 * Notifications are delivered here directly (bell row + socket "new_notification" + web push), translated
 * per recipient locale. src/lib/notifications.ts is NOT imported: it pulls next/headers, which throws an
 * AsyncLocalStorage invariant when loaded in this custom-server context. Keep the imports below Next-free.
 * Never throws out of the interval; does nothing without alerts.
 */

import { prisma } from "../src/lib/prisma";
import { getBatchQuotes, type QuoteRequest } from "../src/lib/quotes";
import { sendPushToUser } from "../src/lib/push";
import { translate } from "../src/lib/i18n/dictionaries";
import { evaluateAlert, parseLineSpec, type AlertPatch, type AlertState } from "../src/lib/alerts/evaluate";

const TICK_MS = 15_000;

const globalForScheduler = globalThis as unknown as { alertSchedulerTimer?: ReturnType<typeof setInterval> };

/** Compact price text for notifications: no float noise, no forced decimals. */
function fmt(n: number): string {
  return String(Number(n.toPrecision(7)));
}

async function tick() {
  const alerts = await prisma.priceAlert.findMany({ where: { status: "active" } });
  if (alerts.length === 0) return;

  const wanted = new Map<string, QuoteRequest>();
  for (const a of alerts) {
    if (a.source !== "moex" && a.source !== "bybit") continue;
    wanted.set(`${a.source}:${a.dataTicker}`, { source: a.source, ticker: a.dataTicker });
  }
  const quotes = wanted.size > 0 ? await getBatchQuotes([...wanted.values()]) : {};
  const now = Date.now();

  for (const a of alerts) {
    try {
      const state: AlertState = {
        kind: a.kind,
        condition: a.condition,
        price: a.price,
        line: parseLineSpec(a.line),
        status: a.status,
        lastSide: a.lastSide,
        repeat: a.repeat,
        expiresAt: a.expiresAt ? a.expiresAt.getTime() : null,
        lastTriggerAt: a.lastTriggerAt ? a.lastTriggerAt.getTime() : null,
        triggerCount: a.triggerCount,
      };
      const price = quotes[`${a.source}:${a.dataTicker}`]?.price ?? 0;
      // no quote: still let expiry / ended lines be handled (price 0 never crosses)
      const res = evaluateAlert(state, price, now);
      if (!res.patch) continue;

      const data = toRow(res.patch);
      // guard on status so a pause/delete made meanwhile by the user is not overwritten
      const upd = await prisma.priceAlert.updateMany({ where: { id: a.id, status: "active" }, data });
      if (upd.count === 0 || !res.triggered || res.level === null) continue;

      await notifyOwner(a, price, res.level);
    } catch (err) {
      console.error("[AlertScheduler] alert", a.id, err);
    }
  }
}

/** Bell row + socket ping + push for one trigger, in the owner's own language. */
async function notifyOwner(
  a: { userId: string; ticker: string; dataTicker: string; source: string; kind: string; condition: string; message: string | null },
  price: number,
  level: number
) {
  const user = await prisma.user.findUnique({ where: { id: a.userId }, select: { locale: true } });
  const locale = user?.locale ?? "ru";
  const title = a.message
    ? translate(locale, "alerts.notif.titleMsg", { ticker: a.ticker, message: a.message })
    : translate(locale, "alerts.notif.title", { ticker: a.ticker });
  const body = translate(locale, `alerts.notif.body.${a.kind}.${a.condition}`, { price: fmt(price), level: fmt(level) });
  const link = `/terminal?symbol=${encodeURIComponent(a.dataTicker)}&source=${a.source}`;

  await prisma.notification.create({ data: { userId: a.userId, type: "price_alert", title, body, link } });
  (globalThis as unknown as { io?: { to(room: string): { emit(ev: string): void } } }).io?.to(`user_${a.userId}`).emit("new_notification");
  sendPushToUser(a.userId, { title, body, url: link }).catch(() => {});
}

function toRow(p: AlertPatch) {
  return {
    ...(p.status !== undefined ? { status: p.status } : {}),
    ...(p.lastSide !== undefined ? { lastSide: p.lastSide } : {}),
    ...(p.triggeredAt !== undefined ? { triggeredAt: new Date(p.triggeredAt) } : {}),
    ...(p.lastTriggerAt !== undefined ? { lastTriggerAt: new Date(p.lastTriggerAt) } : {}),
    ...(p.triggerCount !== undefined ? { triggerCount: p.triggerCount } : {}),
  };
}

export function startAlertScheduler() {
  if (globalForScheduler.alertSchedulerTimer) return;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error("[AlertScheduler] tick failed:", err);
    } finally {
      running = false;
    }
  }, TICK_MS);
  timer.unref?.();
  globalForScheduler.alertSchedulerTimer = timer;
  console.log("[AlertScheduler] Started");
}
