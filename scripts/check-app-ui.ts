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
import { isValidInterval } from "../src/lib/chart/intervals";
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

// --- header hidden only on the terminal
eq("header hidden /terminal", appHeaderHidden("/terminal"), true);
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

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
