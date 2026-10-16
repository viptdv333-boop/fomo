/* Finished paid subscriptions: which rows expire / get deleted, idempotency, renewal after «expired», the sweep itself on a fake
   in-memory db, the notification wiring and the locale keys.
   Run: npx tsx scripts/check-subscription-expire.ts   (exit code 1 on a failed assertion) */
import {
  DAY_MS,
  DEFAULT_KEEP_DAYS,
  activeSubWhere,
  keepDaysFromEnv,
  runExpireSweep,
  shouldDelete,
  shouldExpire,
  shouldNotifyExpired,
  splitMembers,
  type ExpireDb,
  type ExpireNotice,
  type ExpiredSub,
} from "../src/lib/subscription-expire";
import { extendedEnd, isActiveTerm, isRenewal } from "../src/lib/subscription-renew";
import { eventForType } from "../src/lib/notification-events";
import { typeLabelKey } from "../src/lib/notif-inbox";
import { tabForNotifType } from "../src/lib/app-badges";
import { DICTIONARIES } from "../src/lib/i18n/dictionaries";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const now = new Date("2026-10-16T12:00:00.000Z");
const at = (days: number) => new Date(now.getTime() + days * DAY_MS);

// ---- pure rules ----
eq("active + past end -> expire", shouldExpire({ id: "a", status: "active", endDate: at(-1) }, now), true);
eq("active + future end -> keep", shouldExpire({ id: "a", status: "active", endDate: at(1) }, now), false);
eq("end exactly now is not yet expired", shouldExpire({ id: "a", status: "active", endDate: now }, now), false);
eq("already expired -> nothing to expire (idempotent)", shouldExpire({ id: "a", status: "expired", endDate: at(-1) }, now), false);
eq("cancelled is not touched", shouldExpire({ id: "a", status: "cancelled", endDate: at(-1) }, now), false);
eq("lifetime grant stays", shouldExpire({ id: "a", status: "active", endDate: at(365 * 60) }, now), false);

eq("expired 13 d ago is kept", shouldDelete({ id: "a", status: "expired", endDate: at(-13) }, now, 14), false);
eq("expired 15 d ago is deleted", shouldDelete({ id: "a", status: "expired", endDate: at(-15) }, now, 14), true);
eq("stale active 20 d past is deleted too", shouldDelete({ id: "a", status: "active", endDate: at(-20) }, now, 14), true);
eq("future end is never deleted", shouldDelete({ id: "a", status: "expired", endDate: at(3) }, now, 14), false);
eq("cancelled is never deleted by the job", shouldDelete({ id: "a", status: "cancelled", endDate: at(-90) }, now, 14), false);
eq("keepDays 0: expired yesterday goes", shouldDelete({ id: "a", status: "expired", endDate: at(-1) }, now, 0), true);

eq("notice for a term that ended 1 d ago", shouldNotifyExpired({ id: "a", status: "active", endDate: at(-1) }, now), true);
eq("no notice for old backlog (20 d)", shouldNotifyExpired({ id: "a", status: "active", endDate: at(-20) }, now), false);
eq("no notice for a future end", shouldNotifyExpired({ id: "a", status: "active", endDate: at(2) }, now), false);

eq("EXPIRED_KEEP_DAYS unset -> 14", keepDaysFromEnv(undefined), 14);
eq("EXPIRED_KEEP_DAYS 30", keepDaysFromEnv("30"), 30);
eq("EXPIRED_KEEP_DAYS 0", keepDaysFromEnv("0"), 0);
eq("EXPIRED_KEEP_DAYS junk -> 14", keepDaysFromEnv("abc"), 14);
eq("EXPIRED_KEEP_DAYS negative -> 14", keepDaysFromEnv("-5"), 14);

const list = [
  { id: "1", isActive: true },
  { id: "2", isActive: false },
  { id: "3", isActive: true },
];
eq("owner panel split", splitMembers(list), { active: [list[0], list[2]], expired: [list[1]] });
eq("counter filter", JSON.stringify(activeSubWhere(now)), JSON.stringify({ status: "active", endDate: { gt: now } }));

// ---- renewal after «expired» behaves like a lapsed row ----
const expiredRow = { status: "expired", endDate: at(-5) };
eq("expired row is not an active term", isActiveTerm(expiredRow, now), false);
eq("payment on an expired row is not a renewal (restart)", isRenewal(expiredRow, now), false);
eq("expired row restarts from now (+30 d)", extendedEnd(expiredRow, 30, now).toISOString(), at(30).toISOString());
eq("active row still extends from its end", extendedEnd({ status: "active", endDate: at(10) }, 30, now).toISOString(), at(40).toISOString());

// ---- the sweep on a fake db ----
type Row = { id: string; subscriberId: string; status: string; endDate: Date; tariff: ExpiredSub["tariff"] };
function fakeDb(rows: Row[]): ExpireDb & { rows: Row[]; updateCalls: number } {
  const match = (r: Row, w: any): boolean => {
    if (w.id !== undefined && r.id !== w.id) return false;
    if (w.status !== undefined && r.status !== w.status) return false;
    if (w.endDate?.lt && !(r.endDate.getTime() < new Date(w.endDate.lt).getTime())) return false;
    return true;
  };
  const db = {
    rows,
    updateCalls: 0,
    subscription: {
      async findMany(args: any) {
        const out = rows.filter((r) => match(r, args.where)).slice(0, args.take ?? 1e9);
        return out.map((r) => ({ id: r.id, subscriberId: r.subscriberId, endDate: r.endDate, tariff: r.tariff }));
      },
      async updateMany(args: any) {
        db.updateCalls++;
        let n = 0;
        for (const r of rows) if (match(r, args.where)) { Object.assign(r, args.data); n++; }
        return { count: n };
      },
      async deleteMany(args: any) {
        let n = 0;
        for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], args.where)) { rows.splice(i, 1); n++; }
        return { count: n };
      },
    },
  };
  return db as any;
}
const ch = { id: "t1", slug: "gold", name: "Gold" };
const mk = (id: string, status: string, days: number, tariff: Row["tariff"] = ch): Row => ({ id, subscriberId: "u-" + id, status, endDate: at(days), tariff });

async function main() {
  const rows: Row[] = [
    mk("fresh", "active", -1),         // just ended -> expire + notice
    mk("running", "active", 5),        // still running -> untouched
    mk("old-active", "active", -40),   // stale 'active' -> expire silently, then deleted
    mk("exp-recent", "expired", -3),   // already expired, kept
    mk("exp-old", "expired", -20),     // expired long ago -> deleted
    mk("cancelled", "cancelled", -60), // owner removed -> not touched by the job
    mk("legacy", "active", -2, null),  // author-wide legacy sub: expires, no channel to link -> no notice
  ];
  const db = fakeDb(rows);
  const notices: ExpireNotice[] = [];
  const res = await runExpireSweep(db, async (n) => void notices.push(n), { now, keepDays: 14 });
  eq("first pass counts", res, { expired: 3, notified: 1, deleted: 2 });
  eq("rows left", rows.map((r) => `${r.id}:${r.status}`).sort(), ["cancelled:cancelled", "exp-recent:expired", "fresh:expired", "legacy:expired", "running:active"]);
  eq("one notice, to the right user and channel", notices.map((n) => [n.recipients[0], n.type, n.link, n.title.vars.channel]), [["u-fresh", "subscription_expired", "/channels/gold", "Gold"]]);

  const again = await runExpireSweep(db, async (n) => void notices.push(n), { now, keepDays: 14 });
  eq("second pass is a no-op (idempotent, no second notice)", [again, notices.length], [{ expired: 0, notified: 0, deleted: 0 }, 1]);

  // a renewal that lands between the read and the write wins: the compare-and-set skips it
  const race: Row[] = [mk("raced", "active", -1)];
  const rdb = fakeDb(race);
  const realFind = rdb.subscription.findMany;
  rdb.subscription.findMany = async (a) => {
    const got = await realFind(a);
    race[0].endDate = at(30); // the subscriber paid right now
    return got;
  };
  const rr = await runExpireSweep(rdb, async () => {}, { now, keepDays: 14 });
  eq("renewed row survives the sweep", [rr.expired, race[0].status, race.length], [0, "active", 1]);

  // an expired row that is paid for again becomes a normal active one and is not swept
  const back: Row[] = [mk("back", "expired", -3)];
  back[0].status = "active";
  back[0].endDate = extendedEnd(expiredRow, 30, now);
  const br = await runExpireSweep(fakeDb(back), async () => {}, { now, keepDays: 14 });
  eq("re-activated row is left alone", [br, back[0].status], [{ expired: 0, notified: 0, deleted: 0 }, "active"]);

  // a failing notifier never blocks the status change
  const nf: Row[] = [mk("n1", "active", -1), mk("n2", "active", -1)];
  const nr = await runExpireSweep(fakeDb(nf), async () => { throw new Error("boom"); }, { now, keepDays: 14 });
  eq("notify failure does not stop the sweep", [nr.expired, nr.notified, nf.map((r) => r.status)], [2, 0, ["expired", "expired"]]);

  // big backlog: more than one batch
  const many: Row[] = Array.from({ length: 1234 }, (_, i) => mk("m" + i, "active", -1 - (i % 10) / 10));
  const mr = await runExpireSweep(fakeDb(many), async () => {}, { now, keepDays: 14 });
  eq("backlog over several batches", [mr.expired, many.every((r) => r.status === "expired")], [1234, true]);

  // ---- notification wiring ----
  eq("event of subscription_expired", eventForType("subscription_expired"), "subscription_changes");
  eq("type has a plain-words label", typeLabelKey("subscription_expired"), "appprof.nt.subscription_expired");
  eq("lights up the profile tab", tabForNotifType("subscription_expired"), "me");
  const keys = ["ns.notif.subExpired.title", "ns.notif.subExpired.body", "appprof.nt.subscription_expired", "channel2.expiredSection", "channel2.expiredHint", "channel2.clearExpired", "channel2.clearExpiredConfirm", "channel2.clearExpiredFailed", "channel2.removeExpiredConfirm"];
  for (const loc of ["ru", "en", "cn"] as const) {
    eq(`locale ${loc} has all ${keys.length} keys`, keys.filter((k) => !DICTIONARIES[loc][k]), []);
  }
  eq("default retention", DEFAULT_KEEP_DAYS, 14);

  console.log(fails === 0 ? "\nAll checks passed" : `\n${fails} check(s) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
void main();
