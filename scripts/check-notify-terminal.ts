/* Terminal notifications: which notification type each alert kind emits, per-alert cooldown in the evaluator, the create/patch
   schema (cooldown, horizontal ray), the per-user defaults (Settings -> Notifications -> Terminal) and what the terminal announces.
   No DB, no network.   Run: npx tsx scripts/check-notify-terminal.ts   (exit code 1 on a failed assertion) */
import { REPEAT_COOLDOWN_MS, alertLevel, cooldownMs, evaluateAlert, type AlertState } from "../src/lib/alerts/evaluate";
import { createSchema, patchSchema } from "../src/app/api/terminal/alerts/schema";
import { alertNotifType } from "../server/alert-scheduler";
import { eventForType } from "../src/lib/notification-events";
import {
  COOLDOWN_OPTIONS,
  DEFAULT_TERMINAL_NOTIFY,
  EXPIRY_OPTIONS,
  REMINDER_LEAD_OPTIONS,
  alertFormDefaults,
  expiryFromDefaults,
  isTerminalAlertType,
  onlyTerminalAlerts,
  pickToAnnounce,
  sanitizeTerminalNotify,
} from "../src/lib/terminal-alert-defaults";
import { translate } from "../src/lib/i18n/dictionaries";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ---- 1. the type each alert kind emits ---- */
eq("kind=line -> line_alert", alertNotifType("line"), "line_alert");
eq("kind=price -> price_alert (old rows keep their type)", alertNotifType("price"), "price_alert");
eq("unknown kind -> price_alert", alertNotifType("whatever"), "price_alert");
eq("both types resolve to their own switchable event", [eventForType(alertNotifType("line")), eventForType(alertNotifType("price"))], ["line_alert", "price_alert"]);
eq("notification texts exist for every kind x condition x locale", ["price", "line"].flatMap((k) => ["cross", "up", "down"].flatMap((c) => ["ru", "en", "cn"].map((l) => translate(l, `alerts.notif.body.${k}.${c}`, { price: "1", level: "2" }).startsWith("alerts.notif")))).some(Boolean), false);

/* ---- 2. per-alert cooldown ---- */
const base: AlertState = { kind: "price", condition: "cross", price: 100, line: null, status: "active", lastSide: 1, repeat: true, expiresAt: null, lastTriggerAt: null, triggerCount: 0 };
const NOW = 1_800_000_000_000;
eq("cooldownMs: default one minute", [cooldownMs({}), REPEAT_COOLDOWN_MS], [60_000, 60_000]);
eq("cooldownMs: own minutes, clamped to 1..1440, junk -> default", [cooldownMs({ cooldownMin: 15 }), cooldownMs({ cooldownMin: 99999 }), cooldownMs({ cooldownMin: 0 }), cooldownMs({ cooldownMin: null }), cooldownMs({ cooldownMin: NaN })], [900_000, 86_400_000, 60_000, 60_000, 60_000]);
{
  const fired = { ...base, lastTriggerAt: NOW - 10 * 60_000, cooldownMin: 15 };
  eq("repeat with a 15 min cooldown: 10 min after the last firing a flip is silent", evaluateAlert(fired, 99, NOW).triggered, false);
  eq("... and the side is still remembered", evaluateAlert(fired, 99, NOW).patch, { lastSide: -1 });
  eq("repeat with a 15 min cooldown: 16 min after it fires again", evaluateAlert({ ...fired, lastTriggerAt: NOW - 16 * 60_000 }, 99, NOW).triggered, true);
  eq("the same flip with the old fixed minute (no cooldownMin) fires", evaluateAlert({ ...base, lastTriggerAt: NOW - 10 * 60_000 }, 99, NOW).triggered, true);
  eq("once (repeat=false) ignores the cooldown and ends the alert", evaluateAlert({ ...base, repeat: false, cooldownMin: 60 }, 99, NOW).patch?.status, "triggered");
}

/* ---- 3. a horizontal ray can carry an alert ---- */
{
  const hray = { kind: "line", price: null, line: { tool: "hray", p1: { t: NOW - 1000, p: 250 }, p2: { t: NOW - 1000, p: 250 } } };
  eq("hray level is constant from its anchor", alertLevel(hray, NOW), { state: "ok", level: 250 });
  const mk = (tool: string) => ({ kind: "line", ticker: "SBER", dataTicker: "SBER", source: "moex", line: { tool, p1: { t: 1, p: 2 }, p2: { t: 3, p: 4 } } });
  eq("schema accepts hline / hray / trend / ray / extended", ["hline", "hray", "trend", "ray", "extended"].map((t) => createSchema.safeParse(mk(t)).success), [true, true, true, true, true]);
  eq("schema rejects other drawings", createSchema.safeParse(mk("rect")).success, false);
}

/* ---- 4. create / patch schema: cooldown ---- */
{
  const create = (extra: object) => createSchema.safeParse({ source: "moex", ticker: "SBER", dataTicker: "SBER", price: 100, ...extra });
  const ok = create({ repeat: true, cooldownMin: 15 });
  eq("create: cooldownMin accepted", ok.success && ok.data.cooldownMin, 15);
  eq("create: default cooldown is one minute (as before)", (create({}) as { data: { cooldownMin: number } }).data.cooldownMin, 1);
  eq("create: 0 / 1441 / 2.5 rejected", [0, 1441, 2.5].map((m) => create({ cooldownMin: m }).success), [false, false, false]);
  eq("patch: cooldown optional and validated", [patchSchema.safeParse({ cooldownMin: 5 }).success, patchSchema.safeParse({}).success, patchSchema.safeParse({ cooldownMin: 0 }).success], [true, true, false]);
}

/* ---- 5. per-user defaults ---- */
eq("defaults: once, 1 min, never expires, sound + pop-up on, remind 15 min before", DEFAULT_TERMINAL_NOTIFY, { repeat: false, cooldownMin: 1, expiryDays: 0, sound: true, popup: true, reminderLeadMin: 15 });
eq("sanitize: nothing / junk -> defaults", [sanitizeTerminalNotify(undefined), sanitizeTerminalNotify("x"), sanitizeTerminalNotify(null), sanitizeTerminalNotify([])], [DEFAULT_TERMINAL_NOTIFY, DEFAULT_TERMINAL_NOTIFY, DEFAULT_TERMINAL_NOTIFY, DEFAULT_TERMINAL_NOTIFY]);
eq("sanitize: valid values survive", sanitizeTerminalNotify({ repeat: true, cooldownMin: 15, expiryDays: 7, sound: false, popup: false, reminderLeadMin: 60 }), { repeat: true, cooldownMin: 15, expiryDays: 7, sound: false, popup: false, reminderLeadMin: 60 });
eq("sanitize: values outside the offered options fall back one by one", sanitizeTerminalNotify({ repeat: "yes", cooldownMin: 7, expiryDays: 3, sound: 1, popup: false, reminderLeadMin: 1 }), { ...DEFAULT_TERMINAL_NOTIFY, popup: false });
eq("sanitize ignores unknown keys", Object.keys(sanitizeTerminalNotify({ evil: 1 })).sort(), Object.keys(DEFAULT_TERMINAL_NOTIFY).sort());
eq("every offered option survives sanitize", [COOLDOWN_OPTIONS.every((m) => sanitizeTerminalNotify({ cooldownMin: m }).cooldownMin === m), EXPIRY_OPTIONS.every((d) => sanitizeTerminalNotify({ expiryDays: d }).expiryDays === d), REMINDER_LEAD_OPTIONS.every((m) => sanitizeTerminalNotify({ reminderLeadMin: m }).reminderLeadMin === m)], [true, true, true]);
eq("expiry options match the alert dialog (never / 1 / 7 / 30 days)", EXPIRY_OPTIONS, [0, 1, 7, 30]);
eq("expiry: 0 = never, N days = now + N days", [expiryFromDefaults(0, NOW), expiryFromDefaults(7, NOW)], [null, new Date(NOW + 7 * 86_400_000).toISOString()]);
eq("a new alert form starts from the defaults", alertFormDefaults(sanitizeTerminalNotify({ repeat: true, cooldownMin: 30, expiryDays: 30 })), { repeat: true, cooldownMin: 30, expiryDays: 30 });
eq("settings texts exist in ru / en / cn", ["ns.term.title", "ns.term.trigger", "ns.term.expiry", "ns.term.sound", "ns.term.popup", "ns.term.lead", "ns.term.foot", "alerts.cooldown", "alerts.cd.min", "alerts.cd.hour", "calrem.lead.0", "calrem.lead.n", "calrem.lead.60"].flatMap((k) => ["ru", "en", "cn"].map((l) => translate(l, k) === k)).some(Boolean), false);

/* ---- 6. what the terminal announces ---- */
{
  const row = (id: string, type: string, at: number) => ({ id, type, createdAt: new Date(at).toISOString() });
  const rows = [row("n3", "calendar_reminder", NOW + 3000), row("n2", "line_alert", NOW + 2000), row("n1", "price_alert", NOW + 1000), row("m", "new_message", NOW + 4000), row("old", "price_alert", NOW - 1000)];
  eq("announce: alert types only, oldest first", pickToAnnounce(rows, 0, new Set(["old"])).map((r) => r.id), ["n1", "n2", "n3"]);
  eq("announce: rows already seen are skipped", pickToAnnounce(rows, 0, new Set(["old", "n1", "n2"])).map((r) => r.id), ["n3"]);
  eq("announce: at most `max`, the newest ones", pickToAnnounce(rows, 0, new Set(["old"]), 2).map((r) => r.id), ["n2", "n3"]);
  eq("announce: `since` filters older rows", pickToAnnounce(rows, NOW, new Set()).map((r) => r.id), ["n1", "n2", "n3"]);
  eq("announce: nothing new -> nothing", pickToAnnounce(rows, 0, new Set(rows.map((r) => r.id))), []);
  eq("alert types", ["price_alert", "line_alert", "calendar_reminder", "new_message", "system"].map(isTerminalAlertType), [true, true, true, false, false]);
  eq("the site bell stays quiet only when EVERY fresh row is an alert row", [onlyTerminalAlerts([]), onlyTerminalAlerts([{ type: "price_alert" }]), onlyTerminalAlerts([{ type: "price_alert" }, { type: "new_message" }])], [false, true, false]);
}

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
