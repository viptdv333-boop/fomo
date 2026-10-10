/* Red badges of the app dock: notification type -> tab, per-tab counts (chat max rule), label cap.
   Run: npx tsx scripts/check-app-badges.ts   (exit code 1 on a failed assertion) */
import { AUTO_CLEAR_TABS, BADGE_TAB_BY_TYPE, BADGE_TYPES, hiddenTabUnread, tabBadgeCounts, tabBadgeLabel, tabForNotifType, typesForTab } from "../src/lib/app-badges";
import {
  IDEA_COMMENT_TYPES,
  IDEA_READ_TYPES,
  IDEA_UNREAD_TYPES,
  aggregateUnread,
  commentIdFromLink,
  effectiveByType,
  ideaCommentLink,
  ideaIdFromLink,
  pickCommentToShow,
  unreadLabel,
  likeLabel,
  hasUnread,
  unreadAccent,
  stripText,
  stripHref,
  emptyUnread,
  dockTypeOf,
  type UnreadRow,
} from "../src/lib/app-unread";
import { EVENT_FOR_TYPE } from "../src/lib/notification-events";
import { MAIN_APP_TABS, type AppTabId } from "../src/lib/app-ui";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// every notification type the server creates (EVENT_FOR_TYPE lists them all) is either mapped or deliberately has no tab
const NO_TAB = ["new_follower", "new_idea", "room_join", "subscription_extended", "subscription_removed", "subscription", "payment", "subscription_expiring", "report", "broadcast", "email_broadcast", "system", "security"];
eq("inventory: every known type is mapped or listed as tab-less", Object.keys(EVENT_FOR_TYPE).filter((t) => !(t in BADGE_TAB_BY_TYPE) && !NO_TAB.includes(t)), []);
eq("inventory: no type is both", NO_TAB.filter((t) => t in BADGE_TAB_BY_TYPE), []);
eq("every mapped tab exists in the dock", [...new Set(Object.values(BADGE_TAB_BY_TYPE))].filter((id) => !MAIN_APP_TABS.some((t) => t.id === id)), []);

eq("Доска: comments on my ideas, replies to my comments", [tabForNotifType("new_comment"), tabForNotifType("comment_reply")], ["feed", "feed"]);
eq("Терминал: price and line alerts", [tabForNotifType("price_alert"), tabForNotifType("line_alert")], ["terminal", "terminal"]);
eq("Календарь: reminders", tabForNotifType("calendar_reminder"), "calendar");
eq("Каналы: channel posts and comments under channel posts", [tabForNotifType("channel_post"), tabForNotifType("channel_comment")], ["channels", "channels"]);
eq("Болталка: DMs, mentions, replies, room messages", ["new_message", "chat_mention", "chat_reply", "chat_room_message"].map(tabForNotifType), ["chat", "chat", "chat", "chat"]);
eq("everything else lights nothing (incl. prototype keys / junk)", ["new_follower", "new_idea", "payment", "subscription", "subscription_extended", "system", "constructor", "toString", "", null, 5].map(tabForNotifType), [null, null, null, null, null, null, null, null, null, null, null]);
eq("typesForTab", [typesForTab("feed"), typesForTab("terminal"), typesForTab("channels"), typesForTab("me"), typesForTab(undefined)], [["new_comment", "comment_reply", "idea_like", "comment_like"], ["price_alert", "line_alert"], ["channel_like", "channel_post", "channel_comment"], [], []]);
eq("auto-clear on opening a tab only where the badge does not count items (Доска / Каналы keep theirs until the idea is opened)", [...AUTO_CLEAR_TABS], ["terminal", "calendar", "chat"]);
eq("BADGE_TYPES = the mapped keys", BADGE_TYPES.length, Object.keys(BADGE_TAB_BY_TYPE).length);

eq("counts: sums per tab", tabBadgeCounts({ new_comment: 2, comment_reply: 1, price_alert: 3, line_alert: 1, calendar_reminder: 4, channel_post: 5, payment: 9, new_follower: 7 }), { feed: 3, terminal: 4, calendar: 4, channels: 5 });
eq("counts: empty / junk", [tabBadgeCounts(null), tabBadgeCounts({}), tabBadgeCounts({ new_comment: "x", price_alert: -2, line_alert: NaN })], [{}, {}, {}]);
eq("chat: the chat badge alone", tabBadgeCounts({}, 7), { chat: 7 });
eq("chat: DM / room notifications are NOT counted on top of the chat badge", tabBadgeCounts({ new_message: 3, chat_room_message: 4 }, 5), { chat: 5 });
eq("chat: DM notifications alone do not light the tab (the chat badge owns them)", tabBadgeCounts({ new_message: 3 }, 0), {});
eq("chat: max(chat badge, mentions + replies), not a sum", [tabBadgeCounts({ chat_mention: 2, chat_reply: 1 }, 10), tabBadgeCounts({ chat_mention: 2, chat_reply: 1 }, 1), tabBadgeCounts({ chat_mention: 2 }, 0)], [{ chat: 10 }, { chat: 3 }, { chat: 2 }]);
eq("chat: junk chat badge", [tabBadgeCounts({}, NaN), tabBadgeCounts({}, -3)], [{}, {}]);
eq("labels: 99+ cap, empty for 0 / missing", [tabBadgeLabel({ feed: 5 }, "feed"), tabBadgeLabel({ feed: 100 }, "feed"), tabBadgeLabel({ feed: 99 }, "feed"), tabBadgeLabel({}, "feed"), tabBadgeLabel({ chat: 0 }, "chat")], ["5", "99+", "99", "", ""]);

/* ---------- per-item unread markers (src/lib/app-unread.ts) ---------- */
eq(
  "link: idea id of the stored links",
  ["/ideas/ckabc12345", "/ideas/ckabc12345?comment=ckxyz98765", "/ideas/ckabc12345#comments", "/ideas/ckabc12345/edit", "/ideas/new", "/profile?tab=finance", "/messages", null, undefined, 5, "/ideas/", "/ideas/a b c d e f g"].map(ideaIdFromLink),
  ["ckabc12345", "ckabc12345", "ckabc12345", null, null, null, null, null, null, null, null, null],
);
eq(
  "link: comment id",
  ["/ideas/ckabc12345?comment=ckxyz98765", "/ideas/ckabc12345?x=1&comment=ckxyz98765#c", "/ideas/ckabc12345", "/ideas/ckabc12345?comment=", "/ideas/ckabc12345#comment=ckxyz98765", null].map(commentIdFromLink),
  ["ckxyz98765", "ckxyz98765", null, null, null, null],
);
eq("link: what the comments route stores round-trips", [ideaCommentLink("ckabc12345", "ckxyz98765"), ideaIdFromLink(ideaCommentLink("ckabc12345", "ckxyz98765")), commentIdFromLink(ideaCommentLink("ckabc12345", "ckxyz98765"))], ["/ideas/ckabc12345?comment=ckxyz98765", "ckabc12345", "ckxyz98765"]);
eq("types: comments within unread types within read-on-open types (new_idea is read on open but not counted)", [IDEA_COMMENT_TYPES.every((t) => IDEA_UNREAD_TYPES.includes(t)), IDEA_UNREAD_TYPES.every((t) => IDEA_READ_TYPES.includes(t)), IDEA_READ_TYPES.includes("new_idea"), IDEA_UNREAD_TYPES.includes("new_idea")], [true, true, true, false]);
eq("types: every comment / post type of the unread markers lights a tab", IDEA_UNREAD_TYPES.filter((t) => !(t in BADGE_TAB_BY_TYPE)), []);

const tariff = new Map<string, string | null>([
  ["ideaA00001", null],
  ["ideaB00001", "chanX00001"],
  ["ideaC00001", "chanX00001"],
  ["ideaD00001", "chanY00001"],
]);
const rows = [
  { type: "new_comment", link: "/ideas/ideaA00001?comment=cm00000001" },
  { type: "comment_reply", link: "/ideas/ideaA00001" },
  { type: "channel_comment", link: "/ideas/ideaB00001?comment=cm00000002" },
  { type: "new_comment", link: "/ideas/ideaC00001" },
  { type: "channel_post", link: "/ideas/ideaC00001" },
  { type: "channel_post", link: "/ideas/ideaD00001" },
  { type: "new_comment", link: "/ideas/ideaGONE001" }, // idea deleted
  { type: "new_comment", link: null }, // no link: cannot be opened
  { type: "payment", link: "/ideas/ideaA00001" }, // not a comment / post type
];
const agg = aggregateUnread(rows, tariff);
eq("aggregate: per idea (c = comments, p = new post, l = likes)", agg.byIdea, { ideaA00001: { c: 2, p: 0, l: 0 }, ideaB00001: { c: 1, p: 0, l: 0 }, ideaC00001: { c: 1, p: 1, l: 0 }, ideaD00001: { c: 0, p: 1, l: 0 } });
eq("aggregate: per channel via Idea.tariffId", agg.byChannel, { chanX00001: { c: 2, p: 1, l: 0 }, chanY00001: { c: 0, p: 1, l: 0 } });
eq("aggregate: first idea with an unread comment; the board strip counts only ordinary ideas", [agg.first, agg.board], ["ideaA00001", { n: 2, p: 0, l: 0, total: 2, first: "ideaA00001", firstKind: "c", firstComment: "cm00000001" }]);
eq("aggregate: the channels strip = posts + comments under posts", agg.channels, { n: 2, p: 2, l: 0, total: 4, first: "ideaB00001", firstKind: "c", firstComment: "cm00000002" });
eq("aggregate: nothing", aggregateUnread([], tariff), emptyUnread());
eq("aggregate: channel comments alone leave the board strip empty", aggregateUnread([{ type: "channel_comment", link: "/ideas/ideaB00001" }], tariff).board, emptyUnread().board);
eq("labels: comments + a new post, 99+ cap, none", [unreadLabel({ c: 3, p: 0 }), unreadLabel({ c: 0, p: 1 }), unreadLabel({ c: 2, p: 1 }), unreadLabel({ c: 120, p: 0 }), unreadLabel({ c: 0, p: 0 }), unreadLabel(undefined)], ["3", "1", "3", "99+", "", ""]);

const eff = effectiveByType({ price_alert: 2 }, rows.filter((r) => IDEA_UNREAD_TYPES.includes(r.type)), tariff);
eq("dock: a comment / reply under a channel post counts as channel_comment (Каналы), deleted ideas are dropped, linkless rows keep their type", eff, { price_alert: 2, new_comment: 2, comment_reply: 1, channel_comment: 2, channel_post: 2 });
eq("dock: Доска = comments + replies under ordinary ideas (+ the linkless one), Каналы = channel comments + posts", [tabBadgeCounts(eff).feed, tabBadgeCounts(eff).channels], [3, 4]);
eq("dock: a comment on my idea inside my own channel lights Каналы, not Доска", tabBadgeCounts(effectiveByType({}, [{ type: "new_comment", link: "/ideas/ideaB00001?comment=cm00000009" }], tariff)), { channels: 1 });

/* ---------- likes: dock badge yes, per-post red counter no ---------- */
eq("likes: idea_like / comment_like light Доска, the virtual channel_like lights Каналы", [tabForNotifType("idea_like"), tabForNotifType("comment_like"), tabForNotifType("channel_like")], ["feed", "feed", "channels"]);
const likeRows = [
  { type: "idea_like", link: "/ideas/ideaA00001?lk=2_aaaaaaaa.bbbbbbbb" },
  { type: "comment_like", link: "/ideas/ideaA00001?comment=cm00000001&lk=1_cccccccc" },
  { type: "idea_like", link: "/ideas/ideaB00001?lk=1_dddddddd" },
  { type: "comment_like", link: "/ideas/ideaC00001?comment=cm00000003&lk=3_eeeeeeee" },
  { type: "idea_like", link: "/ideas/ideaGONE001?lk=1_ffffffff" },
];
eq("likes: they are read on open and fetched with the idea rows", [IDEA_READ_TYPES.includes("idea_like"), IDEA_READ_TYPES.includes("comment_like"), IDEA_UNREAD_TYPES.includes("idea_like"), IDEA_UNREAD_TYPES.includes("comment_like")], [true, true, true, true]);
const aggLikes = aggregateUnread(likeRows, tariff);
eq("likes: per idea / per channel in their own counter l, NOT in the red comment count c, not in `first` (the jump to a comment)", [aggLikes.byIdea, aggLikes.byChannel, aggLikes.first], [{ ideaA00001: { c: 0, p: 0, l: 2 }, ideaB00001: { c: 0, p: 0, l: 1 }, ideaC00001: { c: 0, p: 0, l: 1 } }, { chanX00001: { c: 0, p: 0, l: 2 } }, null]);
eq("likes: the red label ignores them, the pink one shows them", [unreadLabel(aggLikes.byIdea.ideaA00001), likeLabel(aggLikes.byIdea.ideaA00001), likeLabel(undefined), likeLabel({ l: 120 })], ["", "2", "", "99+"]);
eq("likes: board strip = the two likes under the ordinary idea, opens it (an idea like names no comment)", aggLikes.board, { n: 0, p: 0, l: 2, total: 2, first: "ideaA00001", firstKind: "l", firstComment: null });
eq("likes: channels strip = the two likes under channel posts; a like of a comment opens the comment", [aggLikes.channels, stripHref(aggregateUnread([likeRows[1]], tariff).board)], [{ n: 0, p: 0, l: 2, total: 2, first: "ideaB00001", firstKind: "l", firstComment: null }, "/ideas/ideaA00001?comment=cm00000001"]);
const effLikes = effectiveByType({}, likeRows, tariff);
eq("likes: under an ordinary idea idea_like / comment_like, under a channel post channel_like, deleted ideas dropped", effLikes, { idea_like: 1, comment_like: 1, channel_like: 2 });
eq("likes: dock = Доска 2 (a like of the idea + of a comment), Каналы 2", tabBadgeCounts(effLikes), { feed: 2, channels: 2 });
eq("likes: ids of the unread comments (jump target by comment notifications) ignore like rows", likeRows.filter((r) => IDEA_COMMENT_TYPES.includes(r.type)), []);
eq("likes: the link with lk= still names its idea and comment", [ideaIdFromLink(likeRows[1].link), commentIdFromLink(likeRows[1].link), ideaIdFromLink(likeRows[0].link), commentIdFromLink(likeRows[0].link)], ["ideaA00001", "cm00000001", "ideaA00001", null]);

/* ---------- strips: text + target ---------- */
eq("strip text: comments only / likes only / posts only / a mix / none", [
  stripText({ n: 3, p: 0, l: 0 }), stripText({ n: 0, p: 0, l: 2 }), stripText({ n: 0, p: 4, l: 0 }), stripText({ n: 2, p: 0, l: 1 }), stripText({ n: 0, p: 1, l: 1 }), stripText({ n: 0, p: 0, l: 0 }), stripText(null),
], [
  { key: "appui.newComments", n: 3 }, { key: "appui.newLikes", n: 2 }, { key: "appui.newPosts", n: 4 }, { key: "appui.newAny", n: 3 }, { key: "appui.newAny", n: 2 }, null, null,
]);
eq("strip target: the oldest unread idea, on the comment its notification names", [stripHref(agg.board), stripHref(agg.channels), stripHref(emptyUnread().board), stripHref(null)], ["/ideas/ideaA00001?comment=cm00000001", "/ideas/ideaB00001?comment=cm00000002", null, null]);
eq("strip target: the oldest of ALL kinds wins, not the oldest comment (a like older than a comment on another idea)", aggregateUnread([{ type: "comment_like", link: "/ideas/ideaA00001?comment=cm00000007&lk=1_aaaaaaaa" }, { type: "new_comment", link: "/ideas/ideaX00001" }], new Map<string, string | null>([["ideaA00001", null], ["ideaX00001", null]])).board.first, "ideaA00001");
eq("cards: accent = red for comments / a post, pink for likes only, none when read", [unreadAccent({ c: 1, p: 0, l: 3 }), unreadAccent({ c: 0, p: 1, l: 0 }), unreadAccent({ c: 0, p: 0, l: 2 }), unreadAccent({ c: 0, p: 0, l: 0 }), unreadAccent(undefined), hasUnread({ l: 1 }), hasUnread({ c: 0, p: 0, l: 0 })], ["c", "c", "l", undefined, undefined, true, false]);

/* ---------- the invariant: the dock number of a tab = what the strip of that tab explains ---------- */
const mix: UnreadRow[] = [
  { type: "new_comment", link: "/ideas/ideaA00001?comment=cm00000001" }, // Доска
  { type: "comment_reply", link: "/ideas/ideaA00001" }, // Доска
  { type: "idea_like", link: "/ideas/ideaA00001?lk=2_aaaaaaaa.bbbbbbbb" }, // Доска (one row, two people)
  { type: "comment_like", link: "/ideas/ideaA00001?comment=cm00000001&lk=1_cccccccc" }, // Доска
  { type: "new_comment", link: "/ideas/ideaB00001?comment=cm00000002" }, // a comment under my own channel post -> Каналы
  { type: "comment_reply", link: "/ideas/ideaC00001" }, // Каналы
  { type: "channel_comment", link: "/ideas/ideaC00001?comment=cm00000005" }, // Каналы
  { type: "channel_post", link: "/ideas/ideaC00001" }, // Каналы
  { type: "channel_post", link: "/ideas/ideaD00001" }, // Каналы
  { type: "idea_like", link: "/ideas/ideaB00001?lk=1_dddddddd" }, // a like of a channel post: Каналы, NOT Доска
  { type: "comment_like", link: "/ideas/ideaC00001?comment=cm00000005&lk=4_eeeeeeee" }, // Каналы
  { type: "new_comment", link: "/ideas/ideaGONE001" }, // deleted idea: neither the dock nor a strip
];
const dockMix = tabBadgeCounts(effectiveByType({ price_alert: 3 }, mix, tariff));
const aggMix = aggregateUnread(mix, tariff);
eq("invariant: dock Доска = board strip total = comments + replies + likes of ordinary ideas", [dockMix.feed, aggMix.board.total, aggMix.board.n + aggMix.board.l + aggMix.board.p], [4, 4, 4]);
eq("invariant: dock Каналы = channels strip total = posts + comments + likes of channel posts", [dockMix.channels, aggMix.channels.total, aggMix.channels.n + aggMix.channels.p + aggMix.channels.l], [7, 7, 7]);
eq("invariant: no double count - a like of a channel post is in Каналы only, a like of an ordinary idea in Доска only", [aggMix.board.l, aggMix.channels.l, aggMix.board.p], [2, 2, 0]);
eq("invariant: every idea item is explained by exactly one strip (both strips = the per-idea counters)", [aggMix.board.total + aggMix.channels.total, Object.values(aggMix.byIdea).reduce((s, e) => s + e.c + e.p + e.l, 0)], [11, 11]);
eq("invariant: the per-channel counters add up to the channels strip", [Object.values(aggMix.byChannel).reduce((s, e) => s + e.c + e.p + e.l, 0), aggMix.channels.total], [7, 7]);
eq("invariant: the dock and the strips use one type rule (dockTypeOf)", [dockTypeOf("new_comment", "chan"), dockTypeOf("comment_reply", "chan"), dockTypeOf("idea_like", "chan"), dockTypeOf("comment_like", "chan"), dockTypeOf("new_comment", null), dockTypeOf("idea_like", null), dockTypeOf("channel_post", "chan")], ["channel_comment", "channel_comment", "channel_like", "channel_like", "new_comment", "idea_like", "channel_post"]);
eq("invariant: nothing unread -> empty strips and no dock number", [tabBadgeCounts(effectiveByType({}, [], tariff)), aggregateUnread([], tariff).board.total, aggregateUnread([], tariff).channels.total], [{}, 0, 0]);
// a type added to BADGE_TAB_BY_TYPE for Доска / Каналы that no strip reads would bring the complaint back (a badge with nothing to find)
eq("invariant: every type that lights Доска or Каналы is read by the strips", Object.entries(BADGE_TAB_BY_TYPE).filter(([t, tab]) => (tab === "feed" || tab === "channels") && t !== "channel_like" && !IDEA_UNREAD_TYPES.includes(t)), []);

const thread = [
  { id: "cm00000001", createdAt: "2026-10-07T10:00:00.000Z", user: { id: "me" } },
  { id: "cm00000002", createdAt: "2026-10-07T10:05:00.000Z", user: { id: "bob" } },
  { id: "cm00000003", createdAt: "2026-10-07T10:09:00.000Z", user: { id: "me" } },
  { id: "cm00000004", createdAt: "2026-10-07T10:12:00.000Z", user: { id: "ann" } },
];
eq("jump: ?comment= of the link wins when it is in the thread", pickCommentToShow(thread, { wanted: "cm00000004", ids: ["cm00000002"], myId: "me" }), "cm00000004");
eq("jump: a ?comment= that is not in the thread falls back to the first unread id", pickCommentToShow(thread, { wanted: "zzzzzzzz99", ids: ["cm00000004", "cm00000002"], myId: "me" }), "cm00000002");
eq("jump: old notification without an id -> first foreign comment written since it", pickCommentToShow(thread, { since: "2026-10-07T10:09:01.000Z", myId: "me" }), "cm00000004");
eq("jump: slack of 5 s: the notification is created just after its comment", pickCommentToShow(thread, { since: "2026-10-07T10:05:02.000Z", myId: "me" }), "cm00000002");
eq("jump: my own comments are never the target of an old notification", pickCommentToShow(thread, { since: "2026-10-07T09:59:00.000Z", myId: "me" }), "cm00000002");
eq("jump: nothing to show", [pickCommentToShow(thread, {}), pickCommentToShow([], { wanted: "cm00000001", ids: ["cm00000001"], since: "2026-10-07T10:00:00.000Z" }), pickCommentToShow(thread, { since: "junk" })], [null, null, null]);

/* ---------- dock carousel: unread numbers of the tabs scrolled out of sight ---------- */
const boxes = ["feed", "terminal", "chat", "calendar", "channels", "authors", "settings", "me"].map((id, i) => ({ id: id as AppTabId, left: i * 68, width: 68 }));
const dockCounts = { feed: 3, terminal: 2, channels: 5, me: 1 };
eq("dock edge: scrolled to the middle (tabs 3..8 in view): Доска / Терминал are hidden on the left, профиль on the right", hiddenTabUnread(boxes, 136, 375, dockCounts), { l: 5, r: 1 });
eq("dock edge: at the start the last tab (профиль) hangs off the right edge", hiddenTabUnread(boxes, 0, 375, dockCounts), { l: 0, r: 1 });
eq("dock edge: everything visible / no unread", [hiddenTabUnread(boxes, 0, 800, dockCounts), hiddenTabUnread(boxes, 0, 375, {})], [{ l: 0, r: 0 }, { l: 0, r: 0 }]);

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
