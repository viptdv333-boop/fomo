/* The app's «Уведомления» list (Профиль tab): rows, merge, which rows read themselves, keyset cursor, day groups, relative time, link targets, the offline
   copy, the dictionary keys and the wiring (source guards). No DB, no network.
   Run: npx tsx scripts/check-notif-inbox.ts   (exit code 1 on a failed assertion) */
import fs from "node:fs";
import path from "node:path";
import {
  INBOX_HIDDEN_TYPES,
  INBOX_PAGE,
  KNOWN_TYPES,
  autoReadIds,
  buildCache,
  clampLimit,
  countUnread,
  decodeCursor,
  encodeCursor,
  groupByDay,
  linkTarget,
  markRowsRead,
  mergeRows,
  parseCache,
  parseRow,
  parseRows,
  relativeTime,
  typeLabelKey,
  type InboxRow,
} from "../src/lib/notif-inbox";
import { notifEmoji } from "../src/lib/notif-icon";
import { EVENT_FOR_TYPE } from "../src/lib/notification-events";
import dictAppprof from "../src/lib/i18n/dict/appprof";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const row = (id: string, type: string, at: string, over: Partial<InboxRow> = {}): InboxRow => ({ id, type, title: `t-${id}`, body: null, link: null, isRead: false, createdAt: new Date(at).toISOString(), ...over });

// --- rows from JSON
eq("parseRow: a normal row", parseRow({ id: "a1", type: "payment", title: "Оплата", body: "500 ₽", link: " /payments ", isRead: false, createdAt: "2026-10-12T10:00:00.000Z" }), { id: "a1", type: "payment", title: "Оплата", body: "500 ₽", link: "/payments", isRead: false, createdAt: "2026-10-12T10:00:00.000Z" });
eq("parseRow: empty body / link become null, a missing isRead is unread", parseRow({ id: "a1", type: "system", title: "x", body: "", link: "  ", createdAt: "2026-10-12T10:00:00Z" }), { id: "a1", type: "system", title: "x", body: null, link: null, isRead: false, createdAt: "2026-10-12T10:00:00.000Z" });
eq("parseRow: junk is dropped", [null, 5, "x", {}, { id: "", type: "x", createdAt: "2026-01-01" }, { id: "a", type: 3, createdAt: "2026-01-01" }, { id: "a", type: "x", createdAt: "not a date" }].map(parseRow), Array(7).fill(null));
eq("parseRows: keeps the good ones, a non-array is empty", [parseRows([{ id: "a", type: "x", createdAt: "2026-01-01" }, null, 3]).length, parseRows({}).length], [1, 0]);

// --- merge / read / counts
const r1 = row("a", "new_follower", "2026-10-12T09:00:00Z");
const r2 = row("b", "payment", "2026-10-12T10:00:00Z");
const r3 = row("c", "system", "2026-10-12T10:00:00Z");
eq("mergeRows: newest first, same instant by id (desc), no duplicates", mergeRows([r1], [r2, r3, r1]).map((r) => r.id), ["c", "b", "a"]);
eq("mergeRows: the fresh copy wins (a row read elsewhere turns read)", mergeRows([r1], [{ ...r1, isRead: true }])[0].isRead, true);
eq("markRowsRead: by ids, others untouched", markRowsRead([r1, r2], new Set(["a"])).map((r) => r.isRead), [true, false]);
eq("markRowsRead: all; nothing to change = the same array", [markRowsRead([r1, r2], "all").every((r) => r.isRead), (() => { const rd = [{ ...r1, isRead: true }]; return markRowsRead(rd, "all") === rd; })()], [true, true]);
eq("countUnread", countUnread([r1, { ...r2, isRead: true }, r3]), 2);

// --- what reads itself: only the Профиль-tab types, once
const mix = [row("1", "new_follower", "2026-10-12T09:00:00Z"), row("2", "new_comment", "2026-10-12T09:01:00Z"), row("3", "payment", "2026-10-12T09:02:00Z", { isRead: true }), row("4", "system", "2026-10-12T09:03:00Z"), row("5", "price_alert", "2026-10-12T09:04:00Z"), row("6", "a_future_type", "2026-10-12T09:05:00Z")];
eq("autoReadIds: unread rows that light the Профиль tab (followers, system, unknown types); comments / alerts wait to be opened; read rows are skipped", autoReadIds(mix), ["1", "4", "6"]);
eq("autoReadIds: a row already sent is not sent twice", autoReadIds(mix, new Set(["1"])), ["4", "6"]);
eq("INBOX_HIDDEN_TYPES: the chat types the chat badge owns", [...INBOX_HIDDEN_TYPES].sort(), ["chat_room_message", "new_message"]);

// --- keyset cursor
const cur = encodeCursor("2026-10-12T09:00:00.123Z", "ckabc12345");
eq("cursor: round trip", [cur, decodeCursor(cur)?.at.toISOString(), decodeCursor(cur)?.id], ["1791795600123.ckabc12345", "2026-10-12T09:00:00.123Z", "ckabc12345"]);
eq("cursor: junk is refused", [null, undefined, 5, "", "abc", "123", "123.", ".abc", "0.abc", "1791795600123.a b", "1791795600123.x'; drop", "99999999999999999999.abc"].map(decodeCursor), Array(12).fill(null));
eq("clampLimit: 1..50, junk -> the default", [clampLimit("50"), clampLimit("500"), clampLimit("0"), clampLimit("-3"), clampLimit("x"), clampLimit(null), clampLimit("12abc"), INBOX_PAGE], [50, 50, 1, 1, 20, 20, 12, 50]);

// --- day groups (local days)
const now = new Date(2026, 9, 12, 15, 30); // 12 Oct 2026, 15:30 local
const L = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const rows = [row("t1", "payment", L(12, 14)), row("t2", "system", L(12, 0, 5)), row("y1", "new_follower", L(11, 23, 59)), row("y2", "system", L(11, 8)), row("o1", "system", L(9, 12)), row("o2", "system", L(9, 1)), row("p1", "system", new Date(2025, 11, 31, 23).toISOString())];
const groups = groupByDay(rows, now);
eq("groupByDay: Сегодня / Вчера / dates, order kept", groups.map((g) => [g.kind, g.key, g.rows.map((r) => r.id)]), [
  ["today", "2026-10-12", ["t1", "t2"]],
  ["yesterday", "2026-10-11", ["y1", "y2"]],
  ["date", "2026-10-09", ["o1", "o2"]],
  ["date", "2025-12-31", ["p1"]],
]);
eq("groupByDay: midnight edges (00:00 today / 23:59 yesterday) and the first day of a month", [groupByDay([row("m", "x1", new Date(2026, 9, 12, 0, 0).toISOString())], now)[0].kind, groupByDay([row("m", "x1", new Date(2026, 9, 11, 23, 59).toISOString())], now)[0].kind, groupByDay([row("m", "x1", new Date(2026, 8, 30, 12).toISOString())], new Date(2026, 9, 1, 9))[0].kind], ["today", "yesterday", "yesterday"]);
eq("groupByDay: empty", groupByDay([], now), []);

// --- relative time
const t = (ms: number) => new Date(now.getTime() - ms).toISOString();
eq("relativeTime: just now / minutes / hours", [relativeTime(t(5_000), now), relativeTime(t(59_999), now), relativeTime(t(60_000), now), relativeTime(t(59 * 60_000 + 59_000), now), relativeTime(t(3_600_000), now), relativeTime(t(23 * 3_600_000 + 59 * 60_000), now)], [{ unit: "now" }, { unit: "now" }, { unit: "min", n: 1 }, { unit: "min", n: 59 }, { unit: "hour", n: 1 }, { unit: "hour", n: 23 }]);
eq("relativeTime: older than a day = the clock time, a future stamp is «just now»", [relativeTime(new Date(2026, 9, 11, 9, 5).toISOString(), now), relativeTime(new Date(now.getTime() + 5000).toISOString(), now)], [{ unit: "time", hhmm: "09:05" }, { unit: "now" }]);

// --- where a tap goes
eq("linkTarget: paths of the site (any locale prefix dropped, query / hash kept)", ["/ideas/ck1", "/en/ideas/ck1?comment=c2", "/zh/chat?room=r1#x", "/profile?tab=finance"].map((l) => linkTarget(l)), [
  { kind: "path", path: "/ideas/ck1" },
  { kind: "path", path: "/ideas/ck1?comment=c2" },
  { kind: "path", path: "/chat?room=r1#x" },
  { kind: "path", path: "/profile?tab=finance" },
]);
eq("linkTarget: a full URL of this site is its path, another site is external", [linkTarget("https://fomo.spot/ideas/ck1?x=1", "https://fomo.spot"), linkTarget("https://example.com/a", "https://fomo.spot")], [{ kind: "path", path: "/ideas/ck1?x=1" }, { kind: "external", url: "https://example.com/a" }]);
eq("linkTarget: nothing / unsafe schemes are never navigated", [null, undefined, "", "  ", "javascript:alert(1)", "data:text/html,x", "//evil.com/x", "ideas/ck1", 5].map((l) => linkTarget(l, "https://fomo.spot")), Array(9).fill({ kind: "none" }));

// --- offline copy
const cache = buildCache([r1, r2], 2, 1000);
eq("cache: round trip", parseCache(cache), { rows: [r1, r2], unread: 2, savedAt: 1000 });
eq("cache: only the first page is kept", parseCache(buildCache(Array.from({ length: 80 }, (_, i) => row(`r${i}`, "system", L(12, 1))), 80, 5))?.rows.length, INBOX_PAGE);
eq("cache: junk / another version / broken rows -> nothing or clean", [parseCache(null), parseCache(""), parseCache("{"), parseCache('{"v":2,"savedAt":1,"rows":[]}'), parseCache('{"v":1,"savedAt":1,"unread":-4,"rows":[{"nope":1}]}')], [null, null, null, null, { rows: [], unread: 0, savedAt: 1 }]);

// --- type names and icons
eq("typeLabelKey: known types have their own key, others the generic one", [typeLabelKey("new_follower"), typeLabelKey("payment"), typeLabelKey("brand_new"), typeLabelKey(null)], ["appprof.nt.new_follower", "appprof.nt.payment", "appprof.nt.other", "appprof.nt.other"]);
eq("notifEmoji: the bell's pictures are shared; unknown = bell", [notifEmoji("new_follower"), notifEmoji("payment"), notifEmoji("price_alert"), notifEmoji("whatever")], ["👤", "💰", "⏰", "🔔"]);

// --- dictionaries: every key in all three languages, every known type named, vars alike
const keys = (loc: "ru" | "en" | "cn") => Object.keys(dictAppprof[loc]).filter((k) => k.startsWith("appprof.inbox.") || k.startsWith("appprof.nt.")).sort();
eq("i18n: same inbox keys in ru / en / cn", [keys("en"), keys("cn")], [keys("ru"), keys("ru")]);
eq("i18n: every known type (EVENT_FOR_TYPE + virtual channel_like) has a name", [...new Set([...Object.keys(EVENT_FOR_TYPE), "channel_like"])].filter((ty) => !(`appprof.nt.${ty}` in dictAppprof.ru)), []);
eq("i18n: KNOWN_TYPES are all named", KNOWN_TYPES.filter((ty) => !(`appprof.nt.${ty}` in dictAppprof.ru)), []);
const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
eq("i18n: {vars} alike in the three languages", keys("ru").filter((k) => vars(dictAppprof.ru[k]) !== vars(dictAppprof.en[k]) || vars(dictAppprof.ru[k]) !== vars(dictAppprof.cn[k])), []);
eq("i18n: no empty text", keys("ru").filter((k) => !dictAppprof.ru[k] || !dictAppprof.en[k] || !dictAppprof.cn[k]), []);
eq("i18n: the settings screen is told apart from the list (different titles)", [dictAppprof.ru["appprof.notifTitle"] !== dictAppprof.ru["appprof.inbox.title"], dictAppprof.en["appprof.notifTitle"] !== dictAppprof.en["appprof.inbox.title"]], [true, true]);

// --- wiring (source guards)
const root = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
{
  const api = read("src/app/api/notifications/route.ts");
  eq("api: the list is paged by a keyset cursor, auth first, rate limited", api.includes("decodeCursor(") && api.includes("nextCursor") && api.includes("rateLimit(") && api.indexOf("await auth()") < api.indexOf("rateLimit("), true);
  eq("api: the bell's plain GET is not rate limited (it polls every 30 s)", /if \(inbox \|\| countOnly \|\| cursor\) \{\s*const rl = await rateLimit\(/.test(api), true);
  eq("api: PATCH ids are validated and capped", api.includes("MAX_IDS") && api.includes("Array.isArray(ids)"), true);
  const byType = read("src/app/api/notifications/unread-by-type/route.ts");
  eq("api: unread-by-type reports every type (the client maps the unmapped ones to the Профиль tab)", !byType.includes("BADGE_TYPES") && byType.includes("notIn: ideaTypes"), true);
}
{
  const screen = read("src/components/app/profile/NotifInbox.tsx");
  eq("screen: day headers, load more, mark all, empty / error / skeleton, offline note", ["groupByDay(", "n.loadMore()", "n.readAll()", "appprof.inbox.empty", "appprof.inbox.error", "ni-skel", "appprof.inbox.offline"].every((s) => screen.includes(s)), true);
  eq("screen: a tap marks the row read and opens its link through the profile's openLink", screen.includes("n.readOne(row.id)") && screen.includes("openLink(target.path)"), true);
  const prof = read("src/components/app/profile/AppProfile.tsx");
  eq("profile: the inbox is a pushed screen; links to tab roots go through the tab host", prof.includes('case "inbox"') && prof.includes("hostNavigate(href)") && prof.includes("isHostHref(href)"), true);
  const css = read("src/components/app/profile/notif-inbox.css");
  eq("css: the app's tokens and font step, rows >= 56px, buttons >= 44px, reduced motion", css.includes("var(--app-fz") && css.includes("min-height: 56px") && css.includes("min-height: 44px") && css.includes("prefers-reduced-motion"), true);
}

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
