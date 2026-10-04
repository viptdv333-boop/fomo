/* Calendar reminders («колокольчик»): lead-time math, which rows are due, dedupe / claim semantics with two scheduler instances,
   retry after a failed send, the cap, the notification text, the /calendar#date deep link. No DB, no network.
   Run: npx tsx scripts/check-calendar-reminders.ts   (exit code 1 on a failed assertion) */
import {
  DEFAULT_LEAD_MIN,
  KEEP_AFTER_MS,
  LATE_GRACE_MS,
  LEAD_OPTIONS,
  MAX_ACTIVE_REMINDERS,
  calendarLink,
  canAddReminder,
  canSetReminder,
  candidateFrom,
  candidateTo,
  dueAt,
  eventDayUtc,
  isValidLead,
  minutesLeft,
  minutesText,
  reminderBody,
  selectDue,
  verdict,
} from "../src/lib/calendar/reminder-logic";
import { runDueReminders, type ReminderRow, type ReminderStore } from "../src/lib/calendar/reminder-run";
import { offsetForDay, parseCalendarHash } from "../src/lib/calendar/hash";
import { translate } from "../src/lib/i18n/dictionaries";
import { glossaryBrief } from "../src/lib/calendar/glossary";
import { eventForType } from "../src/lib/notification-events";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 5, 12, 30, 0); // the release: 2026-10-05 12:30 UTC

/* ---- 1. lead-time math ---- */
eq("dueAt: 15 min before", dueAt(T0, 15), T0 - 15 * MIN);
eq("dueAt: 0 = at the release", dueAt(T0, 0), T0);
eq("minutesLeft rounds (14 min 40 s -> 15)", minutesLeft(T0, T0 - 14 * MIN - 40_000), 15);
eq("minutesLeft rounds down (14 min 20 s -> 14)", minutesLeft(T0, T0 - 14 * MIN - 20_000), 14);
eq("minutesLeft never negative", minutesLeft(T0, T0 + 5 * MIN), 0);
eq("lead options are valid and include the default", [LEAD_OPTIONS.every(isValidLead), (LEAD_OPTIONS as readonly number[]).includes(DEFAULT_LEAD_MIN)], [true, true]);
eq("isValidLead rejects negatives, fractions, > 24 h, strings", [isValidLead(-1), isValidLead(1.5), isValidLead(1441), isValidLead("15"), isValidLead(0), isValidLead(1440)], [false, false, false, false, true, true]);

/* ---- 2. verdict / selectDue ---- */
const row = (id: string, leadMin: number, eventTs = T0, notifiedAt: number | null = null) => ({ id, eventTs, leadMin, notifiedAt });
eq("verdict: before the moment -> wait", verdict(row("a", 15), T0 - 16 * MIN), "wait");
eq("verdict: exactly at the moment -> send", verdict(row("a", 15), T0 - 15 * MIN), "send");
eq("verdict: during the window -> send", verdict(row("a", 15), T0 - 3 * MIN), "send");
eq("verdict: at the release itself still sends", verdict(row("a", 0), T0), "send");
eq("verdict: lead 0 waits until the release", verdict(row("a", 0), T0 - 1), "wait");
eq("verdict: late by less than the grace -> send", verdict(row("a", 0), T0 + LATE_GRACE_MS), "send");
eq("verdict: late by more than the grace -> late (dropped, not sent)", verdict(row("a", 0), T0 + LATE_GRACE_MS + 1), "late");
eq("verdict: already notified -> done (even when due)", verdict(row("a", 15, T0, T0 - 14 * MIN), T0 - 10 * MIN), "done");
eq("selectDue: only due rows, soonest release first, ties by id", selectDue([row("c", 15, T0 + 30 * MIN), row("b", 15, T0), row("a", 15, T0), row("w", 15, T0 + 60 * MIN), row("n", 15, T0, 1)], T0 - 2 * MIN).map((r) => r.id), ["a", "b"]);
eq("candidate query window covers the longest lead and the grace", [candidateFrom(T0), candidateTo(T0)], [T0 - LATE_GRACE_MS, T0 + 1440 * MIN]);

/* ---- 3. cap and "can be set" ---- */
eq("cap: 199 active -> one more fits, 200 -> not", [canAddReminder(MAX_ACTIVE_REMINDERS - 1), canAddReminder(MAX_ACTIVE_REMINDERS)], [true, false]);
eq("cap is 200", MAX_ACTIVE_REMINDERS, 200);
eq("canSetReminder: future yes, past/now no, NaN no", [canSetReminder(T0, T0 - 1), canSetReminder(T0, T0), canSetReminder(T0, T0 + 1), canSetReminder(NaN, T0)], [true, false, false, false]);
eq("rows are kept two days after the release", KEEP_AFTER_MS, 2 * 24 * 60 * MIN);

async function main() {
/* ---- 4. claim semantics: two scheduler instances over one table ---- */
function makeTable(rows: ReminderRow[]) {
  const notified = new Map<string, number | null>(rows.map((r) => [r.id, null]));
  const store: ReminderStore = {
    async candidates(from, to) {
      await Promise.resolve();
      return rows.filter((r) => notified.get(r.id) === null && r.eventTs >= from && r.eventTs <= to);
    },
    async claim(id, at) {
      await Promise.resolve(); // yields: the other instance interleaves here
      if (notified.get(id) !== null) return false; // WHERE notifiedAt IS NULL
      notified.set(id, at);
      return true;
    },
    async release(id, at) {
      if (notified.get(id) === at) notified.set(id, null);
    },
  };
  return { store, notified };
}
const R = (id: string, leadMin: number, eventTs = T0, userId = "u1"): ReminderRow => ({ id, userId, eventTs, title: "ИПЦ США", country: "US", impact: 3, category: "inflation", gk: null, leadMin });

{
  const { store, notified } = makeTable([R("r1", 15), R("r2", 15), R("r3", 60), R("r4", 5)]);
  const sentBy: Record<string, string[]> = { A: [], B: [] };
  const now = T0 - 14 * MIN; // r1, r2, r3 are due (r3's moment passed 46 min ago), r4 (5 min) is not
  const [a, b] = await Promise.all([
    runDueReminders(store, async (r) => void sentBy.A.push(r.id), now),
    runDueReminders(store, async (r) => void sentBy.B.push(r.id), now),
  ]);
  const all = [...sentBy.A, ...sentBy.B].sort();
  eq("two instances at once: every due reminder is sent exactly once", all, ["r1", "r2", "r3"]);
  eq("two instances: sent counts add up, the rest are lost claims", [a.sent + b.sent, a.lostClaim + b.lostClaim], [3, 3]);
  eq("not-yet-due reminder is untouched", notified.get("r4"), null);
  const again = await runDueReminders(store, async (r) => void sentBy.A.push(r.id), now + 30_000);
  eq("next tick: nothing is sent twice", [again.sent, again.lostClaim, again.failed], [0, 0, 0]);
  const later = await runDueReminders(store, async (r) => void sentBy.A.push(r.id), T0 - 4 * MIN);
  eq("later tick sends r4 once", [later.sent, sentBy.A.includes("r4") || sentBy.B.includes("r4")], [1, true]);
}
{
  // a restart: the claim is in the table, the "new process" finds nothing to send
  const { store } = makeTable([R("x", 15)]);
  const first: string[] = [];
  await runDueReminders(store, async (r) => void first.push(r.id), T0 - 10 * MIN);
  const afterRestart: string[] = [];
  await runDueReminders(store, async (r) => void afterRestart.push(r.id), T0 - 9 * MIN);
  eq("restart: no duplicate", [first, afterRestart], [["x"], []]);
}
{
  // a failed send gives the claim back; the next tick retries; a release that comes too late is dropped
  const { store, notified } = makeTable([R("f", 15)]);
  let calls = 0;
  const errors: string[] = [];
  const r1 = await runDueReminders(store, async () => { calls++; throw new Error("db down"); }, T0 - 10 * MIN, (row) => errors.push(row.id));
  eq("failed send: counted, reported, claim released", [r1.sent, r1.failed, errors, notified.get("f")], [0, 1, ["f"], null]);
  const r2 = await runDueReminders(store, async () => { calls++; }, T0 - 9 * MIN);
  eq("retry on the next tick succeeds", [r2.sent, calls, notified.get("f") !== null], [1, 2, true]);
  const { store: s2 } = makeTable([R("g", 15)]);
  const r3 = await runDueReminders(s2, async () => { throw new Error("x"); }, T0 + LATE_GRACE_MS + 1);
  eq("long after the release nothing is retried", [r3.sent, r3.failed, r3.lostClaim], [0, 0, 0]);
}
{
  // one user's failure does not stop the others
  const { store } = makeTable([R("p", 15), R("q", 15)]);
  const out: string[] = [];
  const r = await runDueReminders(store, async (row) => { if (row.id === "p") throw new Error("boom"); out.push(row.id); }, T0 - 10 * MIN);
  eq("one failing row does not block the next", [r.sent, r.failed, out], [1, 1, ["q"]]);
}

/* ---- 5. the notification ---- */
const tr = (locale: string) => (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
const body = (locale: string, minutes: number, brief: string | null = null, impact = 3, country = "США") =>
  reminderBody({ eventTs: T0, now: T0 - minutes * MIN, country, impact, locale, brief }, tr(locale));
eq("ru: «Через 15 минут · США · важность высокая»", body("ru", 15), "Через 15 минут · США · важность высокая");
eq("ru plurals: 1 минуту / 2 минуты / 5 минут / 21 минуту", [1, 2, 5, 21].map((n) => minutesText(n, "ru", tr("ru"))), ["1 минуту", "2 минуты", "5 минут", "21 минуту"]);
eq("ru: at the release time", body("ru", 0), "Выходит сейчас · США · важность высокая");
eq("ru: the brief goes on its own line", body("ru", 5, "Всплеск волатильности в долларе").split("\n"), ["Через 5 минут · США · важность высокая", "Всплеск волатильности в долларе"]);
eq("en: In 15 minutes", body("en", 15, null, 2, "USA"), "In 15 minutes · USA · medium importance");
eq("en plural: 1 minute", minutesText(1, "en", tr("en")), "1 minute");
eq("cn: no plural forms, still renders", body("cn", 5, null, 1, "美国"), "5 分钟后 · 美国 · 重要性低");
eq("unknown impact is omitted", body("ru", 15, null, 9, "США"), "Через 15 минут · США");
eq("no country is omitted", body("ru", 15, null, 3, ""), "Через 15 минут · важность высокая");
eq("glossary brief exists server-side for a known category (ru) and is Russian-only", [Boolean(glossaryBrief("~inflation", "ru", "US")), glossaryBrief("~inflation", "en", "US")], [true, null]);
eq("type -> event for the preference matrix", eventForType("calendar_reminder"), "calendar_reminder");

/* ---- 6. deep link ---- */
eq("link /calendar#<UTC date of the release>", [eventDayUtc(T0), calendarLink(T0)], ["2026-10-05", "/calendar#2026-10-05"]);
eq("link: a release just after UTC midnight", calendarLink(Date.UTC(2026, 9, 6, 0, 5)), "/calendar#2026-10-06");
eq("hash parse: valid / invalid / not a date", [parseCalendarHash("#2026-10-05"), parseCalendarHash("#2026-13-05"), parseCalendarHash("#2026-02-30"), parseCalendarHash("#x"), parseCalendarHash("")], ["2026-10-05", null, null, null, null]);
eq("hash -> grid window offset (28-day steps from the window start)", [offsetForDay("2026-09-28", "2026-10-05"), offsetForDay("2026-09-28", "2026-10-25"), offsetForDay("2026-09-28", "2026-10-26"), offsetForDay("2026-09-28", "2026-09-20")], [0, 0, 1, -1]);

if (fails > 0) {
  console.log(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log("\nall calendar-reminder checks passed");
}

void main();
