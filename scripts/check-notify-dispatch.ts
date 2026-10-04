/* Decision logic of the notification dispatcher: defaults, overrides, always-on,
   quiet hours, channel states, per-recipient locale, type→event map, anti-spam gate,
   failure bookkeeping. No DB, no network.
   Run: npx tsx scripts/check-notify-dispatch.ts   (exit code 1 on a failed assertion) */
import {
  EVENTS,
  EVENT_FOR_TYPE,
  EVENT_IDS,
  channelAllowed,
  defaultEnabled,
  eventForType,
  isEnabled,
  isQuietNow,
  localMinutes,
  prefKey,
  type QuietHours,
} from "../src/lib/notification-events";
import { SendGate, decide, type ChannelLite } from "../src/lib/notify-decide";
import { renderNotifText } from "../src/lib/notif-render";
import { MAX_HARD_FAILS, nextChannelState } from "../src/lib/notify-dispatch";
import { channelStatus, maskAddress } from "../src/lib/notify-link";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const tg: ChannelLite = { id: "c1", channel: "telegram", address: "123", verified: true, enabled: true };
const mail: ChannelLite = { id: "c2", channel: "email", address: "a@b.c", verified: true, enabled: true };

/* ---- 1. defaults: nobody gains/loses anything unexpectedly ---- */
for (const ev of EVENT_IDS) {
  const def = EVENTS.find((e) => e.id === ev)!;
  if (def.alwaysOn) continue;
  eq(`default ${ev}: bell on`, defaultEnabled(ev, "inapp"), true);
  eq(`default ${ev}: web push on (as before the feature)`, defaultEnabled(ev, "webpush"), true);
}
eq("default: nobody has external channels -> exactly bell + push, nothing else", decide({ event: "dm" }), { inapp: true, webpush: true, external: [], heldByQuiet: false });
eq("default e-mail is OFF only for events that were never e-mailed? (a connected channel opts in: personal events on)", [defaultEnabled("dm", "email"), defaultEnabled("chat_room_message", "email"), defaultEnabled("new_comment_in_subscribed_channel", "telegram")], [true, false, false]);

/* ---- 2. overrides win over defaults, per cell ---- */
const ov = new Map([[prefKey("dm", "telegram"), false], [prefKey("chat_room_message", "telegram"), true], [prefKey("dm", "webpush"), false], [prefKey("dm", "inapp"), false]]);
eq("override off beats default on (telegram dm)", isEnabled("dm", "telegram", ov), false);
eq("override on beats default off (telegram room msg)", isEnabled("chat_room_message", "telegram", ov), true);
eq("override as plain object works too", isEnabled("dm", "telegram", { "dm:telegram": false }), false);
eq("decide: dm with bell+push off, telegram off, email default on", decide({ event: "dm", overrides: ov, channels: [tg, mail] }), { inapp: false, webpush: false, external: [mail], heldByQuiet: false });
eq("other events unaffected by a dm override", isEnabled("mention", "telegram", ov), true);

/* ---- 3. always-on (system/security) ---- */
eq("system: cannot be overridden off", isEnabled("system", "inapp", { "system:inapp": false }), true);
eq("system: e-mail always on even if overridden off", isEnabled("system", "email", { "system:email": false }), true);
eq("system: only in-app + e-mail exist", ["inapp", "webpush", "email", "telegram", "whatsapp", "max", "vk", "webhook"].map((c) => channelAllowed("system", c as never)), [true, false, true, false, false, false, false, false]);
eq("system: telegram override on is ignored", isEnabled("system", "telegram", { "system:telegram": true }), false);
const quiet: QuietHours = { enabled: true, startMin: 23 * 60, endMin: 8 * 60, timezone: "UTC" };
eq("system: goes through quiet hours", decide({ event: "system", channels: [mail], quiet, now: new Date("2026-10-04T02:00:00Z") }), { inapp: true, webpush: false, external: [mail], heldByQuiet: false });

/* ---- 4. channel state: disabled / unverified / no address are skipped ---- */
eq("unverified channel skipped", decide({ event: "dm", channels: [{ ...tg, verified: false }] }).external, []);
eq("disabled channel skipped", decide({ event: "dm", channels: [{ ...tg, enabled: false }] }).external, []);
eq("channel without address skipped", decide({ event: "dm", channels: [{ ...tg, address: null }] }).external, []);
eq("connected channel carries personal event", decide({ event: "dm", channels: [tg] }).external.map((c) => c.id), ["c1"]);
eq("noisy event not sent to a freshly connected channel", decide({ event: "chat_room_message", channels: [tg] }).external, []);

/* ---- 5. quiet hours ---- */
eq("localMinutes UTC 02:30", localMinutes(new Date("2026-10-04T02:30:00Z"), "UTC"), 150);
eq("localMinutes Moscow = UTC+3", localMinutes(new Date("2026-10-04T02:30:00Z"), "Europe/Moscow"), 330);
eq("localMinutes bad zone falls back to UTC", localMinutes(new Date("2026-10-04T02:30:00Z"), "Nope/Zone"), 150);
eq("quiet wraps midnight: 02:00 inside 23:00-08:00", isQuietNow(quiet, new Date("2026-10-04T02:00:00Z")), true);
eq("quiet: 12:00 outside", isQuietNow(quiet, new Date("2026-10-04T12:00:00Z")), false);
eq("quiet: boundary start inclusive", isQuietNow(quiet, new Date("2026-10-04T23:00:00Z")), true);
eq("quiet: boundary end exclusive", isQuietNow(quiet, new Date("2026-10-04T08:00:00Z")), false);
eq("quiet: same-day window 13-15", isQuietNow({ enabled: true, startMin: 780, endMin: 900, timezone: "UTC" }, new Date("2026-10-04T14:00:00Z")), true);
eq("quiet: disabled never", isQuietNow({ ...quiet, enabled: false }, new Date("2026-10-04T02:00:00Z")), false);
eq("quiet: start==end never", isQuietNow({ ...quiet, endMin: quiet.startMin }, new Date("2026-10-04T02:00:00Z")), false);
eq("quiet: time zone respected (02:00 UTC is 05:00 Moscow, still inside; 06:00 UTC is 09:00 Moscow, outside)", [isQuietNow({ ...quiet, timezone: "Europe/Moscow" }, new Date("2026-10-04T02:00:00Z")), isQuietNow({ ...quiet, timezone: "Europe/Moscow" }, new Date("2026-10-04T06:00:00Z"))], [true, false]);
eq("quiet hours: only the bell is delivered", decide({ event: "dm", channels: [tg, mail], quiet, now: new Date("2026-10-04T02:00:00Z") }), { inapp: true, webpush: false, external: [], heldByQuiet: true });
eq("outside quiet hours: everything flows", decide({ event: "dm", channels: [tg], quiet, now: new Date("2026-10-04T12:00:00Z") }).webpush, true);

/* ---- 6. every type string used in the codebase maps to a real event ---- */
const usedTypes = ["chat_mention", "chat_reply", "chat_room_message", "new_comment", "comment_reply", "new_message", "new_idea", "channel_post", "channel_comment", "new_follower", "subscription_extended", "subscription_removed", "subscription", "payment", "room_join", "price_alert", "report", "broadcast", "email_broadcast"];
eq("all known types are mapped explicitly", usedTypes.filter((t) => !(t in EVENT_FOR_TYPE)), []);
eq("all mapped events exist in the catalog", Object.values(EVENT_FOR_TYPE).filter((e) => !EVENT_IDS.includes(e)), []);
eq("unknown type falls back to system", eventForType("something_new"), "system");
eq("a few mappings", [eventForType("chat_mention"), eventForType("new_message"), eventForType("channel_post"), eventForType("payment"), eventForType("price_alert")], ["mention", "dm", "new_post_in_subscribed_channel", "payment_events", "price_alert"]);

/* ---- 7. per-recipient locale rendering ---- */
const text = { key: "notif.newFollower.title", vars: { name: "Anna" } };
eq("locale ru", renderNotifText(text, "ru"), "Anna подписался на вас");
eq("locale en differs", renderNotifText(text, "en") !== renderNotifText(text, "ru"), true);
eq("locale cn differs", renderNotifText(text, "cn") !== renderNotifText(text, "en"), true);
eq("unknown locale -> ru", renderNotifText(text, "xx"), renderNotifText(text, "ru"));
eq("plain string verbatim", renderNotifText("<b>x</b>", "en"), "<b>x</b>");
eq("{key} var translated per locale", renderNotifText({ key: "notif.newFollower.title", vars: { name: { key: "notif.fallback.user" } } }, "ru"), "Пользователь подписался на вас");

/* ---- 8. anti-spam gate ---- */
{
  const g = new SendGate(3, 60_000, 30_000);
  const t0 = 1_000_000;
  const r = [0, 1, 2, 3, 4].map((i) => g.check("ch", `msg${i}`, t0 + i));
  eq("gate: first 3 pass, 4th and 5th dropped", r.map((x) => x.allowed), [true, true, true, false, false]);
  eq("gate: duplicate inside the dedupe window dropped silently", g.check("other", "same", t0).allowed && !g.check("other", "same", t0 + 1000).allowed, true);
  const after = g.check("ch", "msg-new", t0 + 61_000);
  eq("gate: next window opens and reports 2 suppressed", [after.allowed, after.suppressedBefore], [true, 2]);
  eq("gate: suppressed counter is reported only once", g.check("ch", "msg-new2", t0 + 62_000).suppressedBefore, 0);
  eq("gate: channels are independent", g.check("ch2", "msg0", t0 + 5).allowed, true);
  eq("gate: same text allowed again after the dedupe window", g.check("other", "same", t0 + 31_000).allowed, true);
}

/* ---- 9. failure bookkeeping ---- */
{
  const base = { failCount: 0, lastError: null as string | null, lastSentAt: new Date(Date.now() - 3_600_000) };
  eq("ok after quiet period refreshes lastSentAt", nextChannelState(base, { ok: true })?.data.failCount, 0);
  eq("ok right after ok writes nothing", nextChannelState({ failCount: 0, lastError: null, lastSentAt: new Date() }, { ok: true }), null);
  eq("ok clears an old error", nextChannelState({ failCount: 2, lastError: "x", lastSentAt: new Date() }, { ok: true })?.data, { lastSentAt: (nextChannelState({ failCount: 2, lastError: "x", lastSentAt: new Date() }, { ok: true })!.data.lastSentAt), lastError: null, failCount: 0 });
  const soft = nextChannelState(base, { ok: false, error: "timeout" })!;
  eq("soft failure records the error, no counting, never disables", [soft.data.lastError, soft.data.failCount, soft.disabled], ["timeout", undefined, false]);
  const hard1 = nextChannelState(base, { ok: false, error: "Forbidden: bot was blocked by the user", permanent: true })!;
  eq("first hard failure counts", [hard1.data.failCount, hard1.disabled], [1, false]);
  const hardN = nextChannelState({ ...base, failCount: MAX_HARD_FAILS - 1 }, { ok: false, error: "blocked", permanent: true })!;
  eq("Nth consecutive hard failure disables the channel", [hardN.data.enabled, hardN.disabled], [false, true]);
  eq("long errors are truncated", nextChannelState(base, { ok: false, error: "x".repeat(1000) })!.data.lastError!.length, 300);
}

/* ---- 10. card status + masking ---- */
eq("status: not configured wins", channelStatus(false, { verified: true, enabled: true, lastError: null }), "not_configured");
eq("status: no row", channelStatus(true, null), "not_connected");
eq("status: unverified", channelStatus(true, { verified: false, enabled: true, lastError: null }), "pending");
eq("status: paused", channelStatus(true, { verified: true, enabled: false, lastError: null }), "paused");
eq("status: error", channelStatus(true, { verified: true, enabled: true, lastError: "x" }), "error");
eq("status: connected", channelStatus(true, { verified: true, enabled: true, lastError: null }), "connected");
eq("mask email", maskAddress("email", "alex@gmail.com"), "a***@gmail.com");
eq("mask phone", maskAddress("whatsapp", "79001234567"), "+79•••••567");
eq("mask webhook hides the path/token", maskAddress("webhook", "https://hooks.slack.com/services/T000/B000/SECRET"), "https://hooks.slack.com/•••");

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
