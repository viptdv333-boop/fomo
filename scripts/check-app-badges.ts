/* Red badges of the app dock: notification type -> tab, per-tab counts (chat max rule), label cap.
   Run: npx tsx scripts/check-app-badges.ts   (exit code 1 on a failed assertion) */
import { BADGE_TAB_BY_TYPE, BADGE_TYPES, tabBadgeCounts, tabBadgeLabel, tabForNotifType, typesForTab } from "../src/lib/app-badges";
import { EVENT_FOR_TYPE } from "../src/lib/notification-events";
import { MAIN_APP_TABS } from "../src/lib/app-ui";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// every notification type the server creates (EVENT_FOR_TYPE lists them all) is either mapped or deliberately has no tab
const NO_TAB = ["new_follower", "new_idea", "channel_comment", "room_join", "subscription_extended", "subscription_removed", "subscription", "payment", "subscription_expiring", "report", "broadcast", "email_broadcast", "system", "security"];
eq("inventory: every known type is mapped or listed as tab-less", Object.keys(EVENT_FOR_TYPE).filter((t) => !(t in BADGE_TAB_BY_TYPE) && !NO_TAB.includes(t)), []);
eq("inventory: no type is both", NO_TAB.filter((t) => t in BADGE_TAB_BY_TYPE), []);
eq("every mapped tab exists in the dock", [...new Set(Object.values(BADGE_TAB_BY_TYPE))].filter((id) => !MAIN_APP_TABS.some((t) => t.id === id)), []);

eq("Доска: comments on my ideas, replies to my comments", [tabForNotifType("new_comment"), tabForNotifType("comment_reply")], ["feed", "feed"]);
eq("Терминал: price and line alerts", [tabForNotifType("price_alert"), tabForNotifType("line_alert")], ["terminal", "terminal"]);
eq("Календарь: reminders", tabForNotifType("calendar_reminder"), "calendar");
eq("Каналы: channel posts", tabForNotifType("channel_post"), "channels");
eq("Болталка: DMs, mentions, replies, room messages", ["new_message", "chat_mention", "chat_reply", "chat_room_message"].map(tabForNotifType), ["chat", "chat", "chat", "chat"]);
eq("everything else lights nothing (incl. prototype keys / junk)", ["new_follower", "payment", "system", "constructor", "toString", "", null, 5].map(tabForNotifType), [null, null, null, null, null, null, null, null]);
eq("typesForTab", [typesForTab("feed"), typesForTab("terminal"), typesForTab("me"), typesForTab(undefined)], [["new_comment", "comment_reply"], ["price_alert", "line_alert"], [], []]);
eq("BADGE_TYPES = the mapped keys", BADGE_TYPES.length, Object.keys(BADGE_TAB_BY_TYPE).length);

eq("counts: sums per tab", tabBadgeCounts({ new_comment: 2, comment_reply: 1, price_alert: 3, line_alert: 1, calendar_reminder: 4, channel_post: 5, payment: 9, new_follower: 7 }), { feed: 3, terminal: 4, calendar: 4, channels: 5 });
eq("counts: empty / junk", [tabBadgeCounts(null), tabBadgeCounts({}), tabBadgeCounts({ new_comment: "x", price_alert: -2, line_alert: NaN })], [{}, {}, {}]);
eq("chat: the chat badge alone", tabBadgeCounts({}, 7), { chat: 7 });
eq("chat: DM / room notifications are NOT counted on top of the chat badge", tabBadgeCounts({ new_message: 3, chat_room_message: 4 }, 5), { chat: 5 });
eq("chat: DM notifications alone do not light the tab (the chat badge owns them)", tabBadgeCounts({ new_message: 3 }, 0), {});
eq("chat: max(chat badge, mentions + replies), not a sum", [tabBadgeCounts({ chat_mention: 2, chat_reply: 1 }, 10), tabBadgeCounts({ chat_mention: 2, chat_reply: 1 }, 1), tabBadgeCounts({ chat_mention: 2 }, 0)], [{ chat: 10 }, { chat: 3 }, { chat: 2 }]);
eq("chat: junk chat badge", [tabBadgeCounts({}, NaN), tabBadgeCounts({}, -3)], [{}, {}]);
eq("labels: 99+ cap, empty for 0 / missing", [tabBadgeLabel({ feed: 5 }, "feed"), tabBadgeLabel({ feed: 100 }, "feed"), tabBadgeLabel({ feed: 99 }, "feed"), tabBadgeLabel({}, "feed"), tabBadgeLabel({ chat: 0 }, "chat")], ["5", "99+", "99", "", ""]);

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
