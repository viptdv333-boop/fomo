/* Early renewal of a channel subscription: the extension arithmetic (src/lib/subscription-renew.ts), the renewal texts
   (src/lib/subscription-welcome.ts) and that every locale carries the new keys.
   Run: npx tsx scripts/check-subscription-renew.ts   (exit code 1 on a failed assertion) */
import {
  DAY_MS,
  MAX_AHEAD_DAYS,
  canOfferRenewal,
  daysAhead,
  extendedEnd,
  formatValidUntil,
  isActiveTerm,
  isLifetimeEnd,
  isRenewal,
  renewalBase,
  tooFarAhead,
} from "../src/lib/subscription-renew";
import { subscriptionNotice, welcomeDmText } from "../src/lib/subscription-welcome";
import { DICTIONARIES } from "../src/lib/i18n/dictionaries";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const now = new Date("2026-10-16T12:00:00.000Z");
const at = (days: number) => new Date(now.getTime() + days * DAY_MS);
const iso = (d: Date) => d.toISOString();

// ---- first purchase / nothing to extend ----
eq("no subscription: now + 30", iso(extendedEnd(null, 30, now)), iso(at(30)));
eq("no subscription is not a renewal", isRenewal(null, now), false);

// ---- active: the remaining days are kept ----
const active10 = { status: "active", endDate: at(10) };
eq("active 10 days left + 30 = 40 days", iso(extendedEnd(active10, 30, now)), iso(at(40)));
eq("active is a renewal", isRenewal(active10, now), true);
eq("active base = current end", iso(renewalBase(active10, now)), iso(at(10)));
eq("never shorter than before", extendedEnd(active10, 1, now).getTime() > active10.endDate.getTime(), true);

// ---- expired / cancelled: restart from now ----
eq("expired yesterday: now + 30", iso(extendedEnd({ status: "active", endDate: at(-1) }, 30, now)), iso(at(30)));
eq("expired is not a renewal", isRenewal({ status: "active", endDate: at(-1) }, now), false);
eq("cancelled with a stale future end: now + 30", iso(extendedEnd({ status: "cancelled", endDate: at(20) }, 30, now)), iso(at(30)));
eq("cancelled is not active", isActiveTerm({ status: "cancelled", endDate: at(20) }, now), false);

// ---- boundary ----
eq("ends exactly now: not active", isActiveTerm({ status: "active", endDate: now }, now), false);
eq("ends exactly now: now + 30", iso(extendedEnd({ status: "active", endDate: now }, 30, now)), iso(at(30)));
eq("ends 1 ms from now: active", isActiveTerm({ status: "active", endDate: new Date(now.getTime() + 1) }, now), true);
eq("ends 1 ms from now: keeps the ms", extendedEnd({ status: "active", endDate: new Date(now.getTime() + 1) }, 7, now).getTime(), now.getTime() + 1 + 7 * DAY_MS);
eq("string date accepted", iso(extendedEnd({ status: "active", endDate: iso(at(5)) }, 30, now)), iso(at(35)));

// ---- stacking: renewals add up, order does not matter ----
let sub = { status: "active", endDate: at(3) };
for (let i = 0; i < 5; i++) sub = { status: "active", endDate: extendedEnd(sub, 30, now) };
eq("5 renewals of 30 days on 3 left = 153 days", iso(sub.endDate), iso(at(153)));
const a = extendedEnd({ status: "active", endDate: extendedEnd(active10, 30, now) }, 90, now);
const b = extendedEnd({ status: "active", endDate: extendedEnd(active10, 90, now) }, 30, now);
eq("different tariffs stack in any order", iso(a), iso(b));
eq("a long period on top of the remainder", iso(extendedEnd(active10, 365, now)), iso(at(375)));

// ---- junk periods never move the date backwards ----
eq("0 days adds nothing", iso(extendedEnd(active10, 0, now)), iso(at(10)));
eq("negative days add nothing", iso(extendedEnd(active10, -5, now)), iso(at(10)));
eq("NaN days add nothing", iso(extendedEnd(active10, NaN, now)), iso(at(10)));
eq("fractional days floor", iso(extendedEnd(null, 30.9, now)), iso(at(30)));

// ---- horizon and lifetime ----
eq("daysAhead", daysAhead(at(10), now), 10);
eq("daysAhead past = 0", daysAhead(at(-3), now), 0);
eq("daysAhead null = 0", daysAhead(null, now), 0);
eq("normal end is not lifetime", isLifetimeEnd(at(365), now), false);
eq("year 2100 is lifetime", isLifetimeEnd(new Date("2100-01-01"), now), true);
eq("not too far: 30 on 10 left", tooFarAhead(active10, 30, now), false);
eq("too far: exactly at the limit is allowed", tooFarAhead({ status: "active", endDate: at(MAX_AHEAD_DAYS - 30) }, 30, now), false);
eq("too far: one day over the limit", tooFarAhead({ status: "active", endDate: at(MAX_AHEAD_DAYS - 29) }, 30, now), true);
eq("expired is never too far", tooFarAhead({ status: "active", endDate: at(-1) }, 365, now), false);

// ---- who gets the «Продлить» button ----
eq("offer: active term", canOfferRenewal({ endDate: iso(at(10)), price: 500, durationDays: 30, now }), true);
eq("no offer: expired", canOfferRenewal({ endDate: iso(at(-1)), price: 500, durationDays: 30, now }), false);
eq("no offer: no end date", canOfferRenewal({ endDate: null, price: 500, durationDays: 30, now }), false);
eq("no offer: empty end date", canOfferRenewal({ endDate: "", price: 500, durationDays: 30, now }), false);
eq("no offer: junk end date", canOfferRenewal({ endDate: "soon", price: 500, durationDays: 30, now }), false);
eq("no offer: lifetime", canOfferRenewal({ endDate: "2100-01-01", price: 500, durationDays: 30, now }), false);
eq("no offer: free tariff", canOfferRenewal({ endDate: iso(at(10)), price: 0, durationDays: 30, now }), false);
eq("no offer: no period", canOfferRenewal({ endDate: iso(at(10)), price: 500, durationDays: 0, now }), false);
eq("no offer: paid too far ahead", canOfferRenewal({ endDate: iso(at(MAX_AHEAD_DAYS)), price: 500, durationDays: 30, now }), false);

// ---- date label ----
eq("ru label dd.mm.yyyy", formatValidUntil("2026-11-12T10:00:00Z", "ru"), "12.11.2026");
eq("junk label empty", formatValidUntil("nope", "ru"), "");
eq("null label empty", formatValidUntil(null, "ru"), "");

// ---- texts: «Подписка продлена до …» ----
const ru = (key: string, vars?: Record<string, string | number>) => {
  const raw = DICTIONARIES.ru[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_m, k) => String(vars?.[k] ?? `{${k}}`));
};
const ch = { id: "t1", name: "Сетапы", slug: "setups", hasChat: true };
const end = new Date("2026-11-12T10:00:00Z");
const dm = welcomeDmText(ru, ch, end, 30, "notif.dm.subscriptionWelcome", true);
eq("renewed DM names the channel, the date and says «продлена»", dm.includes("«Сетапы»") && dm.includes("12.11.2026") && dm.includes("продлена"), true);
eq("renewed DM links the channel", dm.includes("/channels/setups"), true);
eq("first purchase DM unchanged", welcomeDmText(ru, ch, end, 30, "notif.dm.subscriptionWelcome").includes("Спасибо за подписку"), true);
eq("legacy renewed DM has the date", welcomeDmText(ru, null, end, 30, "notif.dm.subscriptionWelcome", true).includes("12.11.2026"), true);
const n = subscriptionNotice(ch, end, { days: 30, amount: 500, renewed: true });
eq("renewed notice title", n.title, { key: "notif.subscription.channelRenewed.title", vars: { channel: "Сетапы" } });
eq("renewed notice links the channel", n.link, "/channels/setups");
eq("first purchase notice unchanged", subscriptionNotice(ch, end, { days: 30, amount: 500 }).title, { key: "notif.subscription.channelDone.title", vars: { channel: "Сетапы" } });
eq("legacy renewed notice", subscriptionNotice(null, end, { days: 30, renewed: true, sellerName: "Анна" }).title, { key: "notif.subscription.renewed.title", vars: { name: "Анна" } });

// ---- every language has every new key ----
const keys = [
  "notif.dm.channelRenewed", "notif.dm.subscriptionRenewed", "notif.subscription.channelRenewed.title",
  "notif.subscription.renewed.title", "notif.subscription.renewed.body", "notif.err.subscriptionTooFar", "notif.err.tooManyPayments",
  "api.subscriptionTooFar", "api.tooManyPayments",
  "appch.renew", "appch.renewFor", "appch.renewUntil", "appch.renewHint", "appch.buy.renewTitle", "appch.buy.doneRenew",
  "channel2.renew", "channel2.activeUntil", "channel2.renewHint",
  "pay.titleRenew", "pay.renewNote", "pay.successRenew",
];
for (const loc of ["ru", "en", "cn"] as const) {
  const missing = keys.filter((k) => !DICTIONARIES[loc][k]);
  eq(`locale ${loc} has all ${keys.length} renewal keys`, missing, []);
}

console.log(fails === 0 ? "\nAll checks passed" : `\n${fails} check(s) FAILED`);
process.exit(fails === 0 ? 0 : 1);
