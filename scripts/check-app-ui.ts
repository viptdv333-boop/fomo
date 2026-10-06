/* App-only UI shell: tab mapping, header visibility, detection / preview switch, keyboard targets, relative age.
   Run: npx tsx scripts/check-app-ui.ts   (exit code 1 on a failed assertion) */
import {
  APP_TABS,
  activeAppTab,
  agoLabel,
  appHeaderHidden,
  appTabHref,
  badgeLabel,
  parseFontStep,
  raisesKeyboard,
} from "../src/lib/app-ui";
import { APP_TERM_RANGES, APP_TERM_TFS, changeTone, ideasHref, ideasTotal, pctLabel, pickBoardInstrument, showDelayNote } from "../src/lib/app-terminal";
import { collapseOnPop, fsPushState, fullscreenPlan, isFsHistoryState, FS_HISTORY_KEY } from "../src/lib/app-fullscreen";
import { isValidInterval } from "../src/lib/chart/intervals";
import {
  CAT_I18N,
  CHAT_BGS,
  DM_KEYS,
  bgCss,
  fontPx,
  parseFontLevel,
  parseIdList,
  pinnedLine,
  quoteDraft,
  roomMembers,
  toggleId,
  togglePin,
  buildRoomGroups,
  chatQuery,
  clockLabel,
  dayLabel,
  dialogPreviewLine,
  dmUnreadTotal,
  groupAssets,
  initials,
  listTimeLabel,
  messageHtml,
  parseChatRoute,
  roomPreviewLine,
  sortFilterDialogs,
  withDaySeparators,
  type AssetItem,
} from "../src/lib/app-chat";
import { APP_UI_BOOT_SCRIPT, appUiQuery, resolveAppUi, type AppUiInput } from "../src/lib/native-app";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// --- tabs: exactly five, in the owner's order
eq("eight tabs in order (the dock carousel)", APP_TABS.map((t) => t.id), ["feed", "terminal", "chat", "calendar", "channels", "authors", "me", "settings"]);
eq("tab hrefs", APP_TABS.map((t) => t.href), ["/feed", "/terminal", "/chat", "/calendar", "/channels", "/authors", "/profile", "/profile?tab=notifications"]);
eq("tab labels reuse existing keys", APP_TABS.map((t) => t.labelKey), ["nav.feed", "nav.terminal", "nav.chat", "nav.calendar", "nav.channels", "nav.authors", "profile.profile", "appui.tab.settings"]);

// --- active tab
const cases: [string, ReturnType<typeof activeAppTab>][] = [
  ["/feed", "feed"], ["/feed/sber", "feed"], ["/ideas/abc", "feed"], ["/ideas/new", "feed"], ["/en/feed", "feed"], ["/zh/ideas/1", "feed"],
  ["/terminal", "terminal"], ["/terminal/features", "terminal"], ["/en/terminal?symbol=SBER", "terminal"],
  ["/chat", "chat"], ["/chat/sber", "chat"], ["/messages", "chat"], ["/zh/messages", "chat"],
  ["/calendar", "calendar"], ["/en/calendar", "calendar"],
  ["/channels", "channels"], ["/channels/my-channel", "channels"], ["/en/channels", "channels"],
  ["/authors", "authors"], ["/profile", "me"], ["/payments", "me"], ["/help", null], ["/", null], ["", null],
  ["/feedback", null], ["/channelsx", null], ["/ideasx", null], ["/chatter", null],
];
for (const [p, want] of cases) eq(`active ${JSON.stringify(p)}`, activeAppTab(p), want);

// --- header hidden where the screen carries its own top bar: terminal and chat
eq("header hidden /terminal", appHeaderHidden("/terminal"), true);
eq("header hidden /chat", appHeaderHidden("/chat"), true);
eq("header hidden /en/messages", appHeaderHidden("/en/messages"), true);
eq("header hidden /rooms/abc (a private group in the chat)", appHeaderHidden("/rooms/abc"), true);
eq("header shown on the invitation page", appHeaderHidden("/rooms/join/tok"), false);
eq("header shown /chatter", appHeaderHidden("/chatter"), false);
eq("rooms/abc is the chat tab", activeAppTab("/rooms/abc"), "chat");
eq("header hidden /en/terminal/features", appHeaderHidden("/en/terminal/features"), true);
eq("header shown /feed", appHeaderHidden("/feed"), false);
eq("header shown /terminalx", appHeaderHidden("/terminalx"), false);

// --- locale-aware links
eq("href ru", appTabHref("ru", APP_TABS[0]), "/feed");
eq("href en", appTabHref("en", APP_TABS[2]), "/en/chat");
eq("href cn", appTabHref("cn", APP_TABS[4]), "/zh/channels");

// --- badge
eq("badge 0", badgeLabel(0), "");
eq("badge 5", badgeLabel(5), "5");
eq("badge 99", badgeLabel(99), "99");
eq("badge 100", badgeLabel(100), "99+");
eq("badge junk", badgeLabel("x"), "");
eq("badge NaN", badgeLabel(NaN), "");

// --- font step
eq("font s", parseFontStep("s"), "s");
eq("font junk", parseFontStep("huge"), "m");
eq("font null", parseFontStep(null), "m");

// --- keyboard targets
eq("kbd text input", raisesKeyboard({ tagName: "INPUT", type: "text" }), true);
eq("kbd textarea", raisesKeyboard({ tagName: "TEXTAREA" }), true);
eq("kbd contenteditable", raisesKeyboard({ tagName: "DIV", isContentEditable: true }), true);
eq("kbd checkbox", raisesKeyboard({ tagName: "INPUT", type: "checkbox" }), false);
eq("kbd button", raisesKeyboard({ tagName: "BUTTON" }), false);
eq("kbd readonly", raisesKeyboard({ tagName: "INPUT", type: "text", readOnly: true }), false);
eq("kbd null", raisesKeyboard(null), false);

// --- relative age
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const ago = (ms: number, loc = "ru") => agoLabel(new Date(NOW - ms), loc, NOW);
eq("ago now", ago(10_000), "только что");
eq("ago 5 min", ago(5 * 60_000), "5 мин");
eq("ago 2 h", ago(2 * 3600_000), "2 ч");
eq("ago 3 d", ago(3 * 86400_000), "3 дн");
eq("ago en", ago(2 * 3600_000, "en"), "2 h");
eq("ago future", agoLabel(new Date(NOW + 3600_000), "ru", NOW), "");
eq("ago junk", agoLabel("nope", "ru", NOW), "");

// --- detection / preview switch (pure decision)
const base: AppUiInput = { userAgent: "Mozilla/5.0 Chrome/120", hasBridge: false, search: "", stored: null };
const d = (o: Partial<AppUiInput>) => resolveAppUi({ ...base, ...o });
eq("plain browser: off", d({}), { active: false, store: null });
eq("app UA: on", d({ userAgent: "Mozilla/5.0 Chrome/120 FomoApp/1.0.0 Android" }), { active: true, store: null });
eq("bridge: on", d({ hasBridge: true }), { active: true, store: null });
eq("?appui=1: on + store", d({ search: "?appui=1" }), { active: true, store: "1" });
eq("?x=1&appui=1: on", d({ search: "?x=1&appui=1" }), { active: true, store: "1" });
eq("stored flag: on", d({ stored: "1" }), { active: true, store: null });
eq("?appui=0 clears the flag", d({ search: "?appui=0", stored: "1" }), { active: false, store: "0" });
eq("?appui=0 does not switch the real app off", d({ search: "?appui=0", hasBridge: true }), { active: true, store: "0" });
eq("?appui=2 ignored", d({ search: "?appui=2" }), { active: false, store: null });
eq("?myappui=1 ignored", d({ search: "?myappui=1" }), { active: false, store: null });
eq("last ?appui wins", appUiQuery("?appui=1&appui=0"), "0");
eq("FomoApp in a word is not the marker", d({ userAgent: "MyFomoApp/1" }), { active: false, store: null });

// --- the inline boot script must make the same decision as resolveAppUi
function runBoot(i: AppUiInput): boolean {
  let added = false;
  const store: Record<string, string> = i.stored !== null ? { "fomo-appui": i.stored } : {};
  const doc = { documentElement: { classList: { add: (c: string) => { if (c === "app-ui") added = true; } } } };
  const ss = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  new Function("document", "location", "navigator", "sessionStorage", "window", APP_UI_BOOT_SCRIPT)(doc, { search: i.search }, { userAgent: i.userAgent }, ss, i.hasBridge ? { FomoApp: {} } : {});
  return added;
}
const scenarios: Partial<AppUiInput>[] = [
  {}, { userAgent: "x FomoApp/1.2 Android" }, { hasBridge: true }, { search: "?appui=1" }, { search: "?a=b&appui=1&c=d" }, { stored: "1" },
  { search: "?appui=0", stored: "1" }, { search: "?appui=0", hasBridge: true }, { search: "?appui=2" }, { search: "?myappui=1" }, { userAgent: "MyFomoApp/1" },
  { search: "?appui=1&appui=0", stored: "1" }, { search: "?appui=0&appui=1" },
];
for (const s of scenarios) {
  const i = { ...base, ...s };
  eq(`boot script == resolveAppUi ${JSON.stringify(s)}`, runBoot(i), resolveAppUi(i).active);
}
eq("boot script has no backspace chars", APP_UI_BOOT_SCRIPT.includes("\b"), false);

// --- Terminal screen helpers
eq("terminal chips are the design's nine timeframes", APP_TERM_TFS, ["1", "5", "15", "30", "60", "240", "D", "W", "M"]);
eq("every chip is a valid chart interval", APP_TERM_TFS.every(isValidInterval), true);
eq("terminal ranges", APP_TERM_RANGES, ["1d", "5d", "1m", "3m", "6m", "ytd", "1y", "5y", "all"]);
eq("pct up (en)", pctLabel(1.236, "en"), "+1.24%");
eq("pct down (ru comma)", pctLabel(-0.4, "ru"), "-0,40%");
eq("pct zero has no sign", pctLabel(0, "en"), "0.00%");
eq("pct rounds to zero without a sign", pctLabel(-0.001, "en"), "0.00%");
eq("pct junk", pctLabel(NaN, "ru"), "—");
eq("pct undefined", pctLabel(undefined, "ru"), "—");
eq("tone up", changeTone(0), "up");
eq("tone down", changeTone(-0.01), "down");
eq("tone unknown", changeTone(undefined), null);
eq("board instrument: exact ticker, any case", pickBoardInstrument<{ id: string; ticker?: string | null }>([{ id: "1", ticker: "SBERP" }, { id: "2", ticker: "sber" }], "SBER")?.id, "2");
eq("board instrument: none", pickBoardInstrument([{ id: "1", ticker: "GAZP" }], "SBER"), null);
eq("board instrument: not a list", pickBoardInstrument({ error: "x" }, "SBER"), null);
eq("board instrument: junk rows", pickBoardInstrument([null, 5, { id: 3, ticker: "SBER" }], "SBER"), null);
eq("ideas link filtered (ru)", ideasHref("ru", "abc 1"), "/feed?instrumentId=abc%201");
eq("ideas link filtered (en)", ideasHref("en", "x"), "/en/feed?instrumentId=x");
eq("ideas link without instrument", ideasHref("cn", null), "/zh/feed");
eq("ideas total", ideasTotal({ data: [], total: 7 }), 7);
eq("ideas total missing", ideasTotal({ data: [] }), null);
eq("ideas total junk", ideasTotal({ total: -1 }), null);
eq("delay note: moex delayed", showDelayNote("moex", true, false), true);
eq("delay note: moex guest", showDelayNote("moex", false, true), true);
eq("delay note: moex realtime user", showDelayNote("moex", false, false), false);
eq("delay note: crypto never", showDelayNote("bybit", true, true), false);

// --- Chat screens (src/lib/app-chat.ts)
const T = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi, 0).getTime();
const CNOW = T(2026, 10, 6, 15, 30);
eq("clock", clockLabel(T(2026, 10, 6, 9, 5)), "09:05");
eq("clock junk", clockLabel("nope"), "");
eq("list time today", listTimeLabel(T(2026, 10, 6, 12, 4), "ru", CNOW), "12:04");
eq("list time yesterday", listTimeLabel(T(2026, 10, 5, 23, 59), "ru", CNOW), "вчера");
eq("list time weekday (2 days ago = Sunday 4 Oct 2026)", listTimeLabel(T(2026, 10, 4, 9, 0), "ru", CNOW), "вс");
eq("list time weekday en", listTimeLabel(T(2026, 10, 4, 9, 0), "en", CNOW), "Sun");
eq("list time older this year", listTimeLabel(T(2026, 9, 20), "ru", CNOW), "20.09");
eq("list time other year", listTimeLabel(T(2025, 12, 31), "ru", CNOW), "31.12.25");
eq("list time empty", listTimeLabel(null, "ru", CNOW), "");
eq("list time junk", listTimeLabel("x", "ru", CNOW), "");
eq("list time future clamps to the clock", listTimeLabel(T(2026, 10, 7, 8, 0), "ru", CNOW), "08:00");
eq("day label today", dayLabel(T(2026, 10, 6, 1), "ru", CNOW), "Сегодня");
eq("day label yesterday", dayLabel(T(2026, 10, 5, 23), "ru", CNOW), "Вчера");
eq("day label date", dayLabel(T(2026, 10, 1), "ru", CNOW), "1 октября");
eq("day label other year", dayLabel(T(2025, 3, 8), "ru", CNOW), "8 марта 2025");
eq("day label en", dayLabel(T(2026, 10, 1), "en", CNOW), "1 October");
eq("day label cn", dayLabel(T(2026, 10, 1), "cn", CNOW), "10月1日");
const sep = withDaySeparators(
  [
    { id: "a", createdAt: new Date(T(2026, 10, 5, 22)).toISOString() },
    { id: "b", createdAt: new Date(T(2026, 10, 5, 23)).toISOString() },
    { id: "c", createdAt: new Date(T(2026, 10, 6, 9)).toISOString() },
  ],
  "ru",
  CNOW,
);
eq("separators: one per day", sep.map((i) => (i.kind === "day" ? `day:${i.label}` : i.key)), ["day:Вчера", "a", "b", "day:Сегодня", "c"]);
eq("separators: empty", withDaySeparators([], "ru", CNOW), []);
eq("dm unread total (counts, flags, junk)", [dmUnreadTotal([{ unreadCount: 3 }, { unread: true }, { unread: false }, { unreadCount: 0, unread: true }, { unreadCount: -4 }]), dmUnreadTotal([])], [4, 0]);
eq("badge label reused (99+)", [badgeLabel(100), badgeLabel(7)], ["99+", "7"]);
eq("initials two words", initials("Анна Кравец"), "АК");
eq("initials one word", initials("support"), "SU");
eq("initials empty", initials("  "), "?");
eq("room preview: other author", roomPreviewLine({ userId: "u1", author: "Анна", text: "Я в шорте\n от 68.40" }, "me", "Вы", "Файл"), "Анна: Я в шорте от 68.40");
eq("room preview: my own", roomPreviewLine({ userId: "me", author: "Михаил", text: "ок" }, "me", "Вы", "Файл"), "Вы: ок");
eq("room preview: file only", roomPreviewLine({ userId: "u1", author: "Анна", text: " ", fileName: "a.pdf" }, "me", "Вы", "Файл"), "Анна: \u{1F4CE} a.pdf");
eq("room preview: none", roomPreviewLine(undefined, "me", "Вы", "Файл"), "");
eq("dialog preview: mine", dialogPreviewLine({ text: "привет", senderId: "me" }, "me", "Вы: ", "Файл"), "Вы: привет");
eq("dialog preview: theirs, file", dialogPreviewLine({ text: "", senderId: "u" }, "me", "Вы: ", "Файл"), "\u{1F4CE} Файл");
eq("dialog preview: none", dialogPreviewLine(null, "me", "Вы: ", "Файл"), "");
eq("message html escapes tags", messageHtml('<b>x</b> & "q"'), "&lt;b&gt;x&lt;/b&gt; &amp; &quot;q&quot;");
eq(
  "message html links, mentions and ticker emoji",
  messageHtml("hi @bob https://a.b/c :gold:"),
  'hi <span class="ac-mention">@bob</span> <a href="https://a.b/c" target="_blank" rel="noopener noreferrer nofollow" class="ac-link">https://a.b/c</a> <img src="/icons/instruments/gold.svg" alt="gold" class="ac-emo" />',
);
eq("message html: script is inert", messageHtml("<script>alert(1)</script>").includes("<script"), false);

const conv = (id: string, name: string, last: string | null, upd = "2026-01-01T00:00:00Z") => ({ id, otherUser: { id: "u" + id, displayName: name }, lastMessage: last ? { createdAt: last } : null, updatedAt: upd });
eq(
  "dialogs: newest first",
  sortFilterDialogs([conv("1", "Борис", "2026-10-01T10:00:00Z"), conv("2", "Анна", "2026-10-05T10:00:00Z"), conv("3", "Анатолий", null, "2026-10-03T00:00:00Z")], "", "").map((c) => c.id),
  ["2", "3", "1"],
);
eq("dialogs: search is case-insensitive", sortFilterDialogs([conv("1", "Борис", null), conv("2", "Анна", null)], "АНН", "").map((c) => c.id), ["2"]);

const asset = (slug: string, name: string, cat: string | null, room: string | null, archived = false): AssetItem => ({
  id: "a" + slug,
  name,
  slug,
  chatRoom: room ? { id: room, isArchived: archived } : null,
  category: cat ? { slug: cat, name: cat.toUpperCase() } : null,
});
const assets = [asset("gold", "Золото", "metals", "r1"), asset("silver", "Серебро", "metals", "r2"), asset("hidden", "Скрыт", "metals", "r9", true), asset("oil", "Нефть", "commodities", "r3"), asset("misc", "Прочее", null, "r4"), asset("noroom", "Без чата", "metals", null)];
const cats = groupAssets(assets, "Другое");
eq(
  "assets: grouped by category in first-seen order, hidden rooms dropped",
  cats.map((c) => [c.slug, c.name, c.assets.map((a) => a.slug)]),
  [["metals", "METALS", ["gold", "silver", "noroom"]], ["commodities", "COMMODITIES", ["oil"]], ["other", "Другое", ["misc"]]],
);
const gin = {
  categories: cats,
  privateRooms: [{ id: "p1", name: "Трейдеры", membersCount: 3, isOwner: true }],
  favorites: [{ roomId: "r2", name: "Серебро", isPrivate: false, assetSlug: "silver" }, { roomId: "p1", name: "Трейдеры", isPrivate: true, assetSlug: null }],
  generalRoomId: "g1",
  unread: { r1: 2, r2: 1, g1: 5, r3: 100 } as Record<string, number>,
  notify: new Set(["r1"]),
  openCats: new Set<string>(),
  query: "",
  labels: { general: "Общий чат", favorites: "Избранное", privateGroups: "Приватные группы", other: "Другое" },
  catTitle: (slug: string, name: string) => (CAT_I18N[slug] ? CAT_I18N[slug] : name),
};
const groups = buildRoomGroups(gin);
eq("groups: the design's order (Избранное, общий чат, topics, private groups)", groups.map((g) => g.key), ["fav", "general", "cat:metals", "cat:commodities", "cat:other", "private"]);
eq("groups: only topics fold", groups.map((g) => g.collapsible), [false, false, true, true, true, false]);
eq("groups: topics start folded, the count is the rooms that have a chat", groups.filter((g) => g.kind === "cat").map((g) => [g.open, g.count]), [[false, 2], [false, 1], [false, 1]]);
eq("groups: unread of a folded topic is the sum of its rooms", groups.filter((g) => g.kind === "cat").map((g) => g.unread), [3, 100, 0]);
eq("groups: favourites keep the tile of their own group", groups[0].rows.map((r) => [r.id, r.tile, r.fav]), [["r2", "\u{1F947}", true], ["p1", "\u{1F512}", true]]);
eq("groups: general chat has no heading and its unread", [groups[1].title, groups[1].rows[0].id, groups[1].rows[0].unread], [null, "g1", 5]);
eq("groups: bells come from the notify set", groups[2].rows.map((r) => [r.id, r.bell]), [["r1", true], ["r2", false]]);
const opened = buildRoomGroups({ ...gin, openCats: new Set(["metals"]) });
eq("groups: an opened topic", opened.filter((g) => g.kind === "cat").map((g) => g.open), [true, false, false]);
const found = buildRoomGroups({ ...gin, query: "нефт" });
eq("groups: search keeps matching rooms only and opens their topic", found.map((g) => [g.key, g.open, g.rows.map((r) => r.id)]), [["cat:commodities", true, ["r3"]]]);
eq("groups: no match -> no groups", buildRoomGroups({ ...gin, query: "zzzz" }), []);
eq("groups: no favourites, no private groups -> those groups vanish", buildRoomGroups({ ...gin, favorites: [], privateRooms: [] }).map((g) => g.key), ["general", "cat:metals", "cat:commodities", "cat:other"]);
eq("groups: unknown general id falls back to 'general'", buildRoomGroups({ ...gin, generalRoomId: null, favorites: [] })[0].rows[0].id, "general");

// --- old «Личные» marks and look settings (kept under the old localStorage keys)
eq("old localStorage keys", DM_KEYS, { favorites: "fomo-favorites", pinned: "fomo-pinned-chats", muted: "fomo-muted-chats", bg: "fomo-chat-bg", notif: "fomo-chat-notif", font: "fomo-chat-font-v2" });
eq("toggleId adds and removes", [toggleId(["a"], "b"), toggleId(["a", "b"], "a")], [["a", "b"], ["b"]]);
eq("pin: at most five", [togglePin(["1", "2", "3", "4"], "5"), togglePin(["1", "2", "3", "4", "5"], "6"), togglePin(["1", "2", "3", "4", "5"], "3")], [["1", "2", "3", "4", "5"], ["1", "2", "3", "4", "5"], ["1", "2", "4", "5"]]);
eq("id list parse", [parseIdList('["a","b"]'), parseIdList("nope"), parseIdList('{"a":1}'), parseIdList(null), parseIdList('["a",3,null]')], [["a", "b"], [], [], [], ["a"]]);
const dl = [conv("1", "Борис", "2026-10-05T10:00:00Z"), conv("2", "Анна", "2026-10-04T10:00:00Z"), conv("3", "Вера", "2026-10-03T10:00:00Z"), conv("4", "Глеб", "2026-10-06T10:00:00Z")];
eq("dialogs: pinned first, then starred people, then newest", sortFilterDialogs(dl, "", "", { pinned: ["3"], favorites: ["u2"], muted: [] }).map((c) => c.id), ["3", "2", "4", "1"]);
eq("dialogs: two pinned keep the time order", sortFilterDialogs(dl, "", "", { pinned: ["2", "3"], favorites: [], muted: [] }).map((c) => c.id), ["2", "3", "4", "1"]);
eq("font level parse", [parseFontLevel(null), parseFontLevel(""), parseFontLevel("x"), parseFontLevel("7"), parseFontLevel("99"), parseFontLevel("-3"), parseFontLevel("0")], [1, 1, 1, 7, 10, 0, 0]);
eq("font px: 15 at the default level, 2px per step", [fontPx(1), fontPx(0), fontPx(10), fontPx(50)], [15, 13, 33, 33]);
eq("backgrounds: default has none, ids are unique", [bgCss("default"), bgCss("zzz"), bgCss(null), bgCss("purple").startsWith("linear-gradient"), new Set(CHAT_BGS.map((b) => b.id)).size === CHAT_BGS.length], ["", "", "", true, true]);
eq("pinned banner like the old page", pinnedLine([{ text: "первое", isPinned: true }, { text: "x", isPinned: false }, { text: "", isPinned: true }, { text: "удалено", isPinned: true, isDeleted: true }, { text: "а".repeat(50), isPinned: true }], "Файл"), "первое, \u{1F4CE} Файл, " + "а".repeat(40));
eq("quote draft", quoteDraft("Анна", "привет"), "> Анна: привет\n\n");
eq("room members: unique, newest speaker first", roomMembers([{ user: { id: "a", displayName: "A", avatarUrl: null } }, { user: { id: "b", displayName: "B", avatarUrl: null } }, { user: { id: "a", displayName: "A", avatarUrl: null } }]).map((u) => u.id), ["a", "b"]);

// --- chat route <-> URL
const P = (qs: string) => new URLSearchParams(qs);
eq("route: /chat is the rooms list", parseChatRoute("/chat", P("")), { seg: "rooms", room: null, dm: null, with: null, groups: false });
eq("route: ?room=", parseChatRoute("/chat", P("room=abc")), { seg: "rooms", room: "abc", dm: null, with: null, groups: false });
eq("route: /messages is the personal list", parseChatRoute("/messages", P("")).seg, "dms");
eq("route: /en/messages too", parseChatRoute("/en/messages", P("")).seg, "dms");
eq("route: ?conversation= (old link)", parseChatRoute("/messages", P("conversation=c1")), { seg: "dms", room: null, dm: "c1", with: null, groups: false });
eq("route: ?startWith= (old link)", parseChatRoute("/messages", P("startWith=u1")).with, "u1");
eq("route: ?seg=dms", parseChatRoute("/chat", P("seg=dms")).seg, "dms");
eq("route: /rooms/<id> is a private group", parseChatRoute("/rooms/xyz", P("")).room, "xyz");
eq("route: /zh/rooms/<id> too", parseChatRoute("/zh/rooms/xyz", P("")).room, "xyz");
eq("route: the invitation page is not a group", parseChatRoute("/rooms/join", P("")).room, null);
eq("route: ?groups=1", parseChatRoute("/chat", P("groups=1")).groups, true);
eq("query: list", chatQuery({ seg: "rooms" }), "");
eq("query: dms list", chatQuery({ seg: "dms" }), "seg=dms");
eq("query: room", chatQuery({ room: "a b" }), "room=a%20b");
eq("query: dm", chatQuery({ dm: "c1" }), "seg=dms&dm=c1");
eq("query: with", chatQuery({ with: "u1" }), "seg=dms&with=u1");
eq("query: groups", chatQuery({ groups: true }), "groups=1");
eq("query round-trips", ["room=r1", "seg=dms&dm=c1", "groups=1", "seg=dms"].map((q) => chatQuery(parseChatRoute("/chat", P(q)))), ["room=r1", "seg=dms&dm=c1", "groups=1", "seg=dms"]);

// --- full-screen chart: the system Back closes it, the orientation is never forced, the app / browser / old app each get their plan
eq("fs: marker key", FS_HISTORY_KEY, "fomoChartFs");
eq("fs: marker detection", [isFsHistoryState({ fomoChartFs: true }), isFsHistoryState({ fomoChartFs: 1 }), isFsHistoryState({}), isFsHistoryState(null), isFsHistoryState("x"), isFsHistoryState(undefined)], [true, false, false, false, false, false]);
eq("fs: pushed state keeps the router's data", fsPushState({ __NA: true, tree: [1] }), { __NA: true, tree: [1], fomoChartFs: true });
eq("fs: pushed state from junk", [fsPushState(null), fsPushState("s"), fsPushState([1])], [{ fomoChartFs: true }, { fomoChartFs: true }, { fomoChartFs: true }]);
eq("fs: pop to an entry without the marker collapses", collapseOnPop(true, { __NA: true }), true);
eq("fs: pop to a marked entry does not", collapseOnPop(true, { fomoChartFs: true }), false);
eq("fs: pop when not expanded does nothing", [collapseOnPop(false, null), collapseOnPop(false, { a: 1 })], [false, false]);
eq("fs: new app hides the system bars", fullscreenPlan({ native: true, nativeImmersive: true, apiAvailable: true }), { immersive: true, api: false });
eq("fs: old app has only the CSS layer", fullscreenPlan({ native: true, nativeImmersive: false, apiAvailable: true }), { immersive: false, api: false });
eq("fs: browser / PWA uses the Fullscreen API", fullscreenPlan({ native: false, nativeImmersive: false, apiAvailable: true }), { immersive: false, api: true });
eq("fs: browser without the API has only the CSS layer", fullscreenPlan({ native: false, nativeImmersive: false, apiAvailable: false }), { immersive: false, api: false });

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
