/* When the bell chimes (src/lib/notif-chime.ts) and the wiring that keeps a sound at the dock from coming back: the hidden bell lives OUTSIDE the
   conditional header, so a tab switch never remounts it; the first load of a bell is only a baseline.
   No DB, no network.   Run: npx tsx scripts/check-notif-chime.ts   (exit code 1 on a failed assertion) */
import fs from "node:fs";
import path from "node:path";
import { shouldChime } from "../src/lib/notif-chime";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const row = (type: string) => ({ type });

// --- first load = baseline
eq("first load of a bell (prev -1) never chimes, however many unread rows it finds", shouldChime({ prev: -1, next: 12, fresh: [row("new_comment")], appUi: false, nativePush: false }), false);
eq("same for the app UI", shouldChime({ prev: -1, next: 3, fresh: [row("chat_mention")], appUi: true, nativePush: false }), false);

// --- growth
eq("no growth: no chime", [shouldChime({ prev: 4, next: 4, fresh: [row("new_comment")], appUi: false, nativePush: false }), shouldChime({ prev: 4, next: 2, fresh: [], appUi: false, nativePush: false })], [false, false]);
eq("website: any growth chimes (the list is on screen)", shouldChime({ prev: 0, next: 1, fresh: [row("new_follower")], appUi: false, nativePush: false }), true);
eq("website: growth with no fresh row in the first page still chimes", shouldChime({ prev: 10, next: 11, fresh: [], appUi: false, nativePush: false }), true);

// --- app UI: only what a dock badge shows
eq("app: junk without a tab does not chime (nothing to find)", ["", "constructor", "__proto__", "Not A Type"].map((t) => shouldChime({ prev: 2, next: 3, fresh: [row(t)], appUi: true, nativePush: false })), Array(4).fill(false));
eq("app: the types without a section of their own light the Профиль tab and chime like the others (no push token)", ["new_follower", "payment", "system", "new_idea", "room_join", "broadcast", "subscription", "security", "a_type_added_later"].map((t) => shouldChime({ prev: 2, next: 3, fresh: [row(t)], appUi: true, nativePush: false })), Array(9).fill(true));
eq("app + push token: the Профиль-tab types are rung by the push banner too, the page stays quiet", ["new_follower", "payment", "system", "new_idea"].map((t) => shouldChime({ prev: 2, next: 3, fresh: [row(t)], appUi: true, nativePush: true })), Array(4).fill(false));
eq("app: rows of a dock tab chime (no push token)", ["new_comment", "idea_like", "price_alert", "calendar_reminder", "channel_post", "chat_mention"].map((t) => shouldChime({ prev: 2, next: 3, fresh: [row(t)], appUi: true, nativePush: false })), Array(6).fill(true));
eq("app: no fresh row at all = nothing to point at", shouldChime({ prev: 2, next: 3, fresh: [], appUi: true, nativePush: false }), false);
eq("app: a mix chimes when ONE row has a tab", shouldChime({ prev: 2, next: 4, fresh: [row("constructor"), row("new_comment")], appUi: true, nativePush: false }), true);

// --- app UI with a push token: the system banner rings for everything except the chat
eq("app + push token: comments / likes / alerts / reminders / posts are rung by the push banner, the page stays quiet", ["new_comment", "idea_like", "price_alert", "calendar_reminder", "channel_post"].map((t) => shouldChime({ prev: 2, next: 3, fresh: [row(t)], appUi: true, nativePush: true })), Array(5).fill(false));
eq("app + push token: chat rows still chime (FcmService does not banner chat while the app is open)", ["new_message", "chat_mention", "chat_reply", "chat_room_message"].map((t) => shouldChime({ prev: 2, next: 3, fresh: [row(t)], appUi: true, nativePush: true })), Array(4).fill(true));

// --- wiring (source guards)
const root = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
{
  const bell = read("src/components/layout/NotificationBell.tsx");
  eq("bell: the baseline starts at -1, not 0", /prevUnreadRef = useRef<number>\(-1\)/.test(bell), true);
  eq("bell: the chime goes through shouldChime", bell.includes("shouldChime("), true);
}
{
  const header = read("src/components/app/AppHeader.tsx");
  const inHeader = header.slice(header.indexOf("function Header()"), header.indexOf("function HiddenBell()"));
  eq("app header: the hidden bell is not inside the header (a tab switch must not remount it)", inHeader.includes("<HiddenBell"), false);
  eq("app header: the bell is a sibling at a fixed place", /\{appHeaderHidden\(pathname\) \? null : <Header \/>\}\s*<HiddenBell \/>/.test(header), true);
}
{
  // the Профиль entry: a pushed screen of the profile list, the dock badge of the tab is not cleared by opening the tab
  const home = read("src/components/app/profile/ProfileHome.tsx");
  eq("profile: the list has the «Уведомления» row that opens the inbox screen", home.includes('go("inbox")') && home.includes("useInboxUnread("), true);
  const inbox = read("src/components/app/profile/useNotifInbox.ts");
  eq("inbox: it never reads a whole tab at once (rows are sent by id, «Прочитать все» is the one explicit bulk)", !inbox.includes("tab:") && inbox.includes("markAllRead: true"), true);
  const badges = read("src/lib/app-badges.ts");
  eq("badges: the Профиль tab is not in AUTO_CLEAR_TABS", /AUTO_CLEAR_TABS: readonly AppTabId\[\] = \[[^\]]*\]/.exec(badges)?.[0].includes('"me"'), false);
}
{
  const host = read("src/components/app/tabhost/AppTabHost.tsx");
  eq("tab host: the document click hook leaves the dock to the dock", host.includes('a.closest("[data-app-tabbar]")'), true);
  eq("tab host: the pending tab is settled by the address, not cleared on any pathname change", host.includes("settlePending(real)") && !host.includes("clearPending()"), true);
  const store = read("src/components/app/tabhost/store.ts");
  const nav = store.slice(store.indexOf("export function hostNavigate"), store.indexOf("let switchRead"));
  eq("store: the address is pushed BEFORE the pending override is set", nav.indexOf("pushState") > 0 && nav.indexOf("pushState") < nav.indexOf("setPending("), true);
}

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
