/* The generic «Назад» of the app header: which screens are dock roots (no button), where the button leads, who steps aside, the unsaved-changes guard.
   Run: npx tsx scripts/check-app-back.ts   (exit code 1 on a failed assertion) */
import {
  appBackTarget,
  backChrome,
  hasOwnBackBar,
  isDockRoot,
  leavesScreen,
  ownBackCount,
  registerBackGuard,
  registerOwnBack,
  resetBackGuards,
  runBackGuard,
  subscribeOwnBack,
} from "../src/lib/app-back";
import { MAIN_APP_TABS, TERMINAL_APP_TABS } from "../src/lib/app-ui";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const root = (p: string, q = "") => isDockRoot(p, q, MAIN_APP_TABS);
const tgt = (p: string, q = "", terminal = false) => appBackTarget(p, q, terminal, terminal ? TERMINAL_APP_TABS : MAIN_APP_TABS);

// --- roots: the screens of the dock tabs, no button
eq("roots: the dock tabs at their root (and the home screen)", [root("/feed"), root("/terminal"), root("/calculator"), root("/chat"), root("/calendar"), root("/channels"), root("/authors"), root("/profile"), root("/")], [true, true, true, true, true, true, true, true, true]);
eq("roots: locale prefix, preview flags and a trailing slash do not matter", [root("/en/feed"), root("/zh/chat", "?appui=1"), root("/calendar/"), root("/chat", "?seg=dms"), root("/feed", "?instrumentId=7")], [true, true, true, true, true]);
eq("not roots: pushed screens", [root("/ideas/5"), root("/ideas/5/edit"), root("/ideas/new"), root("/channels/create"), root("/channels/edit/3"), root("/channels/3"), root("/authors/zed"), root("/profile/u1"), root("/chat", "?room=r1"), root("/profile", "?tab=finance"), root("/calculator", "?from=terminal"), root("/terminal/features"), root("/subscriptions"), root("/payments")], new Array(14).fill(false));
eq("not roots: pages of no tab (help, terms, instruments ...)", [root("/help"), root("/terms"), root("/privacy"), root("/instruments"), root("/data-providers"), root("/rooms/join/tok")], new Array(6).fill(false));
eq("terminal site: its tabs are roots, /feed is not one", [isDockRoot("/terminal", "", TERMINAL_APP_TABS), isDockRoot("/calculator", "", TERMINAL_APP_TABS), isDockRoot("/profile", "", TERMINAL_APP_TABS), isDockRoot("/feed", "", TERMINAL_APP_TABS)], [true, true, true, false]);

// --- the fallback target of the button
eq("target: none at a root", [tgt("/feed"), tgt("/calendar"), tgt("/profile"), tgt("/")], [null, null, null, null]);
eq("target: idea edit -> the idea, idea / new idea -> the board", [tgt("/ideas/42/edit"), tgt("/ideas/42"), tgt("/ideas/new"), tgt("/en/ideas/new")], [{ href: "/ideas/42", level: "up" }, { href: "/feed", level: "up" }, { href: "/feed", level: "up" }, { href: "/feed", level: "up" }]);
eq("target: a post started from a channel -> that channel", [tgt("/ideas/new", "?channelId=ch7"), tgt("/ideas/new", "?channelId=%3Cx%3E"), tgt("/ideas/new", "?instrumentId=3")], [{ href: "/channels/ch7", level: "up" }, { href: "/feed", level: "up" }, { href: "/feed", level: "up" }]);
eq("target: channels", [tgt("/channels/create"), tgt("/channels/edit/ch7"), tgt("/channels/ch7")], [{ href: "/channels", level: "up" }, { href: "/channels/ch7", level: "up" }, { href: "/channels", level: "up" }]);
eq("target: authors / a user's page -> the authors tab", [tgt("/authors/zed"), tgt("/profile/u1")], [{ href: "/authors", level: "up" }, { href: "/authors", level: "up" }]);
eq("target: profile sub-screens, subscriptions, payments -> the profile", [tgt("/profile", "?tab=finance"), tgt("/subscriptions"), tgt("/payments")], [{ href: "/profile", level: "up" }, { href: "/profile", level: "up" }, { href: "/profile", level: "up" }]);
eq("target: chat threads -> the list, a dialog -> the dialogs list", [tgt("/chat", "?room=r1"), tgt("/chat", "?dm=c1"), tgt("/rooms/g1"), tgt("/rooms/join/tok")], [{ href: "/chat", level: "up" }, { href: "/chat?seg=dms", level: "up" }, { href: "/chat", level: "up" }, { href: "/chat", level: "up" }]);
eq("target: the terminal's pages and the calculator from the terminal -> the terminal", [tgt("/terminal/features"), tgt("/calculator", "?from=terminal")], [{ href: "/terminal", level: "up" }, { href: "/terminal", level: "up" }]);
eq("target: a calendar sub-page -> the calendar", tgt("/calendar/2026-11-18"), { href: "/calendar", level: "up" });
eq("target: an unknown page -> the home section (the board; the terminal on the terminal site)", [tgt("/help"), tgt("/terms"), tgt("/instruments"), tgt("/help", "", true), tgt("/payments", "", true)], [{ href: "/feed", level: "home" }, { href: "/feed", level: "home" }, { href: "/feed", level: "home" }, { href: "/terminal", level: "home" }, { href: "/profile", level: "up" }]);

// --- what the header draws
const t = tgt("/ideas/1");
eq("chrome: a pushed screen with the header -> the button in the header", backChrome({ target: t, headerHidden: false, ownBack: false }), "header");
eq("chrome: a pushed screen whose header is hidden and has no bar of its own -> the slim bar", backChrome({ target: tgt("/terminal/features"), headerHidden: true, ownBack: false }), "bar");
eq("chrome: a screen with a back control of its own -> nothing (never two)", [backChrome({ target: t, headerHidden: false, ownBack: true }), backChrome({ target: t, headerHidden: true, ownBack: true })], ["none", "none"]);
eq("chrome: a root -> nothing", [backChrome({ target: null, headerHidden: false, ownBack: false }), backChrome({ target: null, headerHidden: true, ownBack: false })], ["none", "none"]);
eq("own bars by path: chat threads, channels, authors, profile screens, the calculator; not the terminal pages or the invitation page", [hasOwnBackBar("/chat"), hasOwnBackBar("/rooms/g1"), hasOwnBackBar("/channels/c1"), hasOwnBackBar("/en/authors/zed"), hasOwnBackBar("/profile"), hasOwnBackBar("/subscriptions"), hasOwnBackBar("/calculator"), hasOwnBackBar("/terminal/features"), hasOwnBackBar("/rooms/join/tok"), hasOwnBackBar("/help")], [true, true, true, true, true, true, true, false, false, false]);

// --- the own-back registry
{
  let ticks = 0;
  const off = subscribeOwnBack(() => ticks++);
  const a = registerOwnBack();
  const b = registerOwnBack();
  eq("own back: counted, two bars on a screen", ownBackCount(), 2);
  a();
  a(); // a second release of the same one does nothing
  eq("own back: released once", ownBackCount(), 1);
  b();
  eq("own back: gone, subscribers told each time", [ownBackCount(), ticks], [0, 4]);
  off();
}

// --- the unsaved-changes guard
{
  resetBackGuards();
  eq("guard: none registered -> Back is not vetoed", runBackGuard(), false);
  let asked = 0;
  const off = registerBackGuard(() => (asked++, true));
  eq("guard: a registered guard vetoes (it asks the user) and Back stays", [runBackGuard(), asked], [true, 1]);
  const off2 = registerBackGuard(() => false);
  eq("guard: the last registered decides; false lets Back through", runBackGuard(), false);
  off2();
  eq("guard: back to the first one", runBackGuard(), true);
  off();
  eq("guard: released -> Back goes", runBackGuard(), false);
  registerBackGuard(() => {
    throw new Error("boom");
  });
  eq("guard: a throwing guard never traps Back", runBackGuard(), false);
  resetBackGuards();
  eq("guard: only leaving the screen is vetoed (a sheet / overlay / fullscreen close is not)", (["layer", "overlay", "fullscreen", "history", "parent", "home", "none"] as const).map(leavesScreen), [false, false, false, true, true, true, false]);
}

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
