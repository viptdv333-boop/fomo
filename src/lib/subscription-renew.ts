/// Pure arithmetic of «продлить подписку заранее» (no DB, no next/*): used by lib/subscriptions.ts (the one place that
/// writes the end date), the payment routes and the UIs. Check: npx tsx scripts/check-subscription-renew.ts
///
/// The rule: a payment never takes days away. end = max(now, currentEnd) + period, where currentEnd counts only while the
/// subscription is active and not yet over (status "active" and endDate > now); a cancelled / expired one restarts from now.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead a subscriber may pay (days from now). Stops a runaway pile of renewals; the owner's free grants are not limited. */
export const MAX_AHEAD_DAYS = 1095;

/** An end date this far away is treated as «навсегда» (a free / lifetime grant): nothing to renew. */
export const LIFETIME_YEARS = 50;

export type SubTerm = { status: string; endDate: Date | string | number };

function ms(v: Date | string | number): number {
  return new Date(v).getTime();
}

/** Active right now: status "active" and the term has not ended (the same condition findActiveSubscription uses). */
export function isActiveTerm(sub: SubTerm | null | undefined, now: Date = new Date()): boolean {
  if (!sub) return false;
  const e = ms(sub.endDate);
  return sub.status === "active" && Number.isFinite(e) && e > now.getTime();
}

/** The date a new period is added to: the current end while the term is active, otherwise now. */
export function renewalBase(sub: SubTerm | null | undefined, now: Date = new Date()): Date {
  return isActiveTerm(sub, now) ? new Date(ms(sub!.endDate)) : new Date(now.getTime());
}

/** New end date after paying for `durationDays`. Invalid periods (<1, NaN) add nothing beyond the base. */
export function extendedEnd(sub: SubTerm | null | undefined, durationDays: number, now: Date = new Date()): Date {
  const days = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 0;
  return new Date(renewalBase(sub, now).getTime() + days * DAY_MS);
}

/** True when this payment extends a running term (as opposed to starting / restarting one). */
export function isRenewal(sub: SubTerm | null | undefined, now: Date = new Date()): boolean {
  return isActiveTerm(sub, now);
}

/** Whole days between now and the end (0 when over). */
export function daysAhead(endDate: Date | string | number | null | undefined, now: Date = new Date()): number {
  if (endDate === null || endDate === undefined) return 0;
  const e = ms(endDate);
  if (!Number.isFinite(e)) return 0;
  return Math.max(0, Math.ceil((e - now.getTime()) / DAY_MS));
}

/** An end date so far ahead that the subscription is effectively unlimited. */
export function isLifetimeEnd(endDate: Date | string | number | null | undefined, now: Date = new Date()): boolean {
  if (endDate === null || endDate === undefined) return false;
  const e = ms(endDate);
  return Number.isFinite(e) && e - now.getTime() > LIFETIME_YEARS * 365 * DAY_MS;
}

/** The payment would push the end date past the allowed horizon (MAX_AHEAD_DAYS from now). */
export function tooFarAhead(sub: SubTerm | null | undefined, durationDays: number, now: Date = new Date()): boolean {
  if (!isActiveTerm(sub, now)) return false;
  return extendedEnd(sub, durationDays, now).getTime() - now.getTime() > MAX_AHEAD_DAYS * DAY_MS;
}

/**
 * Whether the «Продлить» action is offered: an active, non-lifetime term of a channel whose tariff can actually be paid
 * (positive price, a real period). A cancelled / expired term is not a renewal - the normal «Оформить» flow applies.
 */
export function canOfferRenewal(p: {
  endDate: Date | string | number | null | undefined;
  price: number;
  durationDays: number;
  now?: Date;
}): boolean {
  const now = p.now ?? new Date();
  if (p.endDate === null || p.endDate === undefined || p.endDate === "") return false;
  const e = ms(p.endDate);
  if (!Number.isFinite(e) || e <= now.getTime()) return false;
  if (isLifetimeEnd(p.endDate, now)) return false;
  if (!(Number(p.price) > 0) || !(Number(p.durationDays) >= 1)) return false;
  return !tooFarAhead({ status: "active", endDate: p.endDate }, Number(p.durationDays), now);
}

/** «12.11.2026» (ru) / «11/12/2026» (en) / «2026/11/12» (cn): the date the subscription is valid until, in the viewer's language. */
export function formatValidUntil(endDate: Date | string | number | null | undefined, locale: string): string {
  if (endDate === null || endDate === undefined || endDate === "") return "";
  const d = new Date(endDate);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(locale === "en" ? "en-US" : locale === "cn" ? "zh-CN" : "ru-RU");
}
