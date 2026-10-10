/* The app UI's tab host (keep-alive of the dock screens): which paths are tab roots, the LRU of mounted screens, the kill switch, links that need a fresh mount.
   Run: npx tsx scripts/check-tabhost.ts   (exit code 1 on a failed assertion) */
import { PARAMS_REACTIVE, TRANSIENT_TABS, hostTabForPath, isHostHref, maxMounted, needsFreshMount, prefetchOrder, tabHostSwitch, touchTab } from "../src/lib/app-tabhost";
import { MAIN_APP_TABS, TERMINAL_APP_TABS } from "../src/lib/app-ui";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// --- tab roots
eq("roots of the board site", ["/feed", "/terminal", "/calculator", "/chat", "/calendar", "/channels", "/authors", "/profile"].map((p) => hostTabForPath(p, MAIN_APP_TABS)), ["feed", "terminal", "calculator", "chat", "calendar", "channels", "authors", "me"]);
eq("locale prefix, trailing slash, query and hash do not matter", ["/en/feed", "/zh/chat/", "/chat?room=x", "/profile?tab=notifications", "/authors#top"].map((p) => hostTabForPath(p, MAIN_APP_TABS)), ["feed", "chat", "chat", "me", "authors"]);
eq("pushed screens are no roots", ["/ideas/5", "/channels/abc", "/authors/bob", "/profile/u1", "/feed/sber", "/chat/general", "/messages", "/rooms/7", "/subscriptions", "/", "/login", "/channels/create"].map((p) => hostTabForPath(p, MAIN_APP_TABS)), Array(12).fill(null));
eq("the calculator is a dock tab of the host (transient)", [hostTabForPath("/calculator", MAIN_APP_TABS), hostTabForPath("/en/calculator?ticker=SiZ6&from=terminal", MAIN_APP_TABS)], ["calculator", "calculator"]);
eq("terminal site: only its own tabs (the calculator among them)", ["/terminal", "/profile", "/feed", "/chat", "/calendar", "/calculator"].map((p) => hostTabForPath(p, TERMINAL_APP_TABS)), ["terminal", "me", null, null, null, "calculator"]);
eq("isHostHref: relative links only", ["/feed", "/en/chat?room=1", "https://x.com/feed", "//x.com/feed", "mailto:a@b.c", "", "/ideas/3"].map((h) => isHostHref(h, MAIN_APP_TABS)), [true, true, false, false, false, false, false]);

// --- memory budget
eq("budget by device memory", [undefined, null, 0, NaN, 1, 2, 3, 4, 6, 8].map((m) => maxMounted(m as number | undefined)), [5, 5, 5, 5, 3, 3, 4, 4, 6, 6]);

// --- LRU of mounted screens
eq("first screen", touchTab([], "feed", 4), { list: ["feed"], evicted: [] });
eq("a new screen goes last, the order of the others is kept", touchTab(["feed", "chat"], "authors", 4).list, ["feed", "chat", "authors"]);
eq("showing a mounted screen again moves it to the end", touchTab(["feed", "chat", "authors"], "feed", 4).list, ["chat", "authors", "feed"]);
{
  const r = touchTab(["feed", "chat", "authors", "calendar"], "channels", 4);
  eq("over budget: the least recently shown goes", r, { list: ["chat", "authors", "calendar", "channels"], evicted: ["feed"] });
}
{
  const r = touchTab(["feed", "chat", "authors", "calendar"], "me", 2);
  eq("a small budget keeps the active one and the most recent", r.list, ["calendar", "me"]);
}
eq("budget below 1 still keeps the active screen", touchTab(["feed"], "chat", 0).list, ["chat"]);
{
  const r = touchTab(["feed", "terminal"], "chat", 4);
  eq("the terminal is released the moment another tab is shown", r, { list: ["feed", "chat"], evicted: ["terminal"] });
}
{
  const r = touchTab(["feed", "chat", "authors"], "terminal", 3);
  eq("the terminal does not count against the budget of the light screens", r.list, ["feed", "chat", "authors", "terminal"]);
}
eq("the calculator is transient too", touchTab(["feed", "calculator"], "me", 4), { list: ["feed", "me"], evicted: ["calculator"] });
eq("transient screens", [...TRANSIENT_TABS], ["terminal", "calculator"]);
eq("screens that follow the URL", [...PARAMS_REACTIVE], ["chat", "me"]);

// --- kill switch
eq("no query, nothing stored: on", tabHostSwitch("", null), { disabled: false, persist: null });
eq("?tabhost=0: off and remembered", tabHostSwitch("?tabhost=0", null), { disabled: true, persist: "0" });
eq("?tabhost=1: on again, the memory is cleared", tabHostSwitch("?appui=1&tabhost=1", "0"), { disabled: false, persist: "clear" });
eq("stored 0 keeps it off", tabHostSwitch("?appui=1", "0"), { disabled: true, persist: null });
eq("stored junk is ignored", tabHostSwitch("", "yes"), { disabled: false, persist: null });
eq("the last ?tabhost wins", tabHostSwitch("?tabhost=1&tabhost=0", null), { disabled: true, persist: "0" });

// --- links with a query into a kept screen
eq("no query: the kept screen is shown as it was", ["feed", "channels", "authors", "calendar"].map((t) => needsFreshMount(t as never, "")), [false, false, false, false]);
eq("preview / switch flags do not count", needsFreshMount("feed", "?appui=1&tabhost=1"), false);
eq("?instrumentId into the board: mount again with it", needsFreshMount("feed", "?instrumentId=7"), true);
eq("the chat and the profile follow the URL: no remount", [needsFreshMount("chat", "?room=7"), needsFreshMount("me", "?tab=finance")], [false, false]);
eq("the calculator is a dock tab of both docks", [MAIN_APP_TABS, TERMINAL_APP_TABS].map((tabs) => tabs.some((t) => t.id === "calculator")), [true, true]);
eq("transient screens are fresh anyway", [needsFreshMount("terminal", "?symbol=SBER"), needsFreshMount("calculator", "?ticker=Si")], [false, false]);

// --- idle preload order
eq("neighbours first, then the dock order", prefetchOrder("chat", MAIN_APP_TABS), ["calendar", "calculator", "feed", "terminal", "channels", "authors", "me"]);
eq("the calculator's neighbours are the terminal and the chat", prefetchOrder("calculator", MAIN_APP_TABS).slice(0, 2), ["chat", "terminal"]);
eq("no active screen: dock order", prefetchOrder(null, MAIN_APP_TABS), ["feed", "terminal", "calculator", "chat", "calendar", "channels", "authors", "me"]);

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
