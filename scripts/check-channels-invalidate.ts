/* «Channels changed»: the pure parts of the channel screens' freshness (src/lib/channels-invalidate.ts) and the service worker's purge rules
   (public/sw-cache-rules.js purgeMatch / isLiveChannelApi / wantsFresh).
   Run: npx tsx scripts/check-channels-invalidate.ts   (exit code 1 on a failed assertion) */
export {}; // a module: the other check scripts declare the same top-level names

// a window for the subscribe helpers (node has EventTarget and CustomEvent, not window / document)
const win = new EventTarget();
const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as "visible" | "hidden" });
(globalThis as unknown as { window: unknown }).window = win;
(globalThis as unknown as { document: unknown }).document = doc;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require("../public/sw-cache-rules.js") as any;

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

async function main() {
  const L = await import("../src/lib/channels-invalidate");
  const O = "https://fomo.test";

  // --- which writes count
  const yes: [string, string][] = [
    ["POST", "/api/users/u1/tariffs"], ["PATCH", "/api/users/u1/tariffs/t1"], ["DELETE", "/api/users/u1/tariffs/t1"], ["POST", "/api/users/u1/tariffs/t1/subscribers"],
    ["PATCH", "/api/channels/c1/telegram"], ["POST", "/api/subscriptions"], ["DELETE", "/api/subscriptions"], ["PATCH", "/api/subscriptions/s1/telegram"],
    ["POST", "/api/payments"], ["PATCH", "/api/payments/p1"], ["POST", "/api/yukassa/create"], ["POST", "/api/users/u1/follow"],
    ["POST", "/api/ideas"], ["DELETE", "/api/ideas/i1"], ["PATCH", "/api/ideas/i1"], ["PATCH", "/api/users/u1"],
  ];
  eq("channel / plan / subscription / payment / follow / post writes count", yes.filter(([m, p]) => !L.isChannelMutation(m, p)), []);
  const no: [string, string][] = [
    ["GET", "/api/channels"], ["GET", "/api/users/u1/tariffs"], ["HEAD", "/api/subscriptions"], ["POST", "/api/ideas/i1/view"], ["POST", "/api/ideas/i1/comments"],
    ["POST", "/api/ideas/i1/vote"], ["POST", "/api/chat/messages"], ["POST", "/api/messages/conversations"], ["POST", "/api/upload"], ["POST", "/api/auth/signout"],
    ["PATCH", "/api/notifications"], ["POST", "/api/push/subscribe"], ["POST", "/api/me/locale"],
  ];
  eq("reads, comments, votes, views, chat, uploads, auth do not", no.filter(([m, p]) => L.isChannelMutation(m, p)), []);
  eq("method case is irrelevant", [L.isChannelMutation("post", "/api/subscriptions"), L.isChannelMutation("get", "/api/subscriptions")], [true, false]);

  // --- throttle
  eq("a write / server-side change always re-reads", L.revalidateDue(1000, 999, true), true);
  eq("foreground / focus / online: at most one silent re-read per 2 s", [L.revalidateDue(10_000, 9_000, false), L.revalidateDue(10_000, 8_000, false), L.revalidateDue(10_000, 5_000, false)], [false, true, true]);

  // --- what the worker drops
  const api = (p: string) => `${O}${p}`;
  const page = (p: string) => R.cacheKey(O, "page", p, "");
  const rsc = (p: string, group = "main") => R.cacheKey(O, "rsc", p, "?_rsc=x") + "|" + group;
  const rscNoQuery = (p: string, group = "main") => R.cacheKey(O, "rsc", p, "") + "|" + group;
  const dropped = [
    api("/api/channels"), api("/api/authors"), api("/api/subscriptions"), api("/api/users/u1/tariffs?scope=manage"), api("/api/users/u1"), api("/api/users/by-fomo-id/bob"),
    api("/api/users/u1/followers"), api("/api/ideas?channelId=c1&limit=50"), api("/api/ideas/i1"), api("/api/channels/c1/chat"),
    page("/channels/gold"), page("/en/channels/gold"), page("/authors/bob"), page("/ideas/i1"), page("/profile/u1"), rsc("/channels/gold"), rsc("/zh/ideas/i1", "x"), rscNoQuery("/channels/gold"),
  ];
  eq("«channels» drops the channel family: lists, plans, subscriptions, a channel's posts, content pages and their RSC copies", dropped.filter((k) => !R.purgeMatch(k, "channels")), []);
  const kept = [
    api("/api/categories"), api("/api/instruments"), api("/api/chat/rooms"), api("/api/notifications"), api("/api/economic-calendar?from=1&to=2"), api("/api/auth/session"),
    api("/api/users/u1/education"), api("/api/watchlist"), page("/feed"), page("/channels"), page("/authors"), page("/en/channels"), page("/calendar"), rsc("/channels"), rscNoQuery("/feed"),
    `${O}/_next/static/chunks/a.js`, `${O}/uploads/a.png`, `${O}/__fomo__/meta`, "not a url",
  ];
  eq("…and nothing else: other lists, the tab-root shells, build files, the marker", kept.filter((k) => R.purgeMatch(k, "channels")), []);
  eq("an unknown scope drops nothing", [R.purgeMatch(api("/api/channels"), "all"), R.purgeMatch(api("/api/channels"), undefined)], [false, false]);

  // --- the pure side of the worker's decisions for a live read
  // a young copy answers instantly; a request that asks for the freshest answer goes to the network first (the copy only as the fallback)
  const instant = R.storedAction(20_000, R.apiPolicy("/api/channels").fresh, false);
  const asked = R.wantsFresh("no-store", "", "") && instant === "stale" ? "network-first" : instant;
  eq("a copy 20 s old: instant for a plain read, network first for cache:no-store", [instant, asked], ["stale", "network-first"]);
  eq("a copy of another release or older than the instant window: network first anyway", [R.storedAction(3 * 60_000, 2 * 60_000, false), R.storedAction(1000, 2 * 60_000, true)], ["network-first", "network-first"]);

  // --- the event wiring
  const seen: string[] = [];
  const off = L.subscribeChannelsChanged((why) => seen.push(why));
  L.dispatchChannelsChanged({ reason: "write" });
  L.dispatchChannelsChanged({ reason: "sw", path: "/api/channels" });
  eq("the event always reaches a subscriber (a write is never throttled)", seen, ["event", "event"]);
  seen.length = 0;
  win.dispatchEvent(new Event("focus"));
  win.dispatchEvent(new Event("online"));
  doc.dispatchEvent(new Event("visibilitychange"));
  eq("focus / online / visible right after a re-read are throttled away", seen, []);
  off();
  L.dispatchChannelsChanged({ reason: "write" });
  eq("unsubscribed: nothing more", seen, []);

  // a subscription older than the gap: the foreground triggers go through, a hidden document does not
  const realNow = Date.now;
  const t0 = realNow();
  const seen2: string[] = [];
  const off2 = L.subscribeChannelsChanged((why) => seen2.push(why));
  Date.now = () => t0 + 5000;
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  Date.now = () => t0 + 10_000;
  win.dispatchEvent(new Event("focus"));
  Date.now = () => t0 + 10_500;
  win.dispatchEvent(new Event("online")); // 0.5 s after the focus re-read: throttled
  Date.now = () => t0 + 20_000;
  win.dispatchEvent(new Event("online"));
  Date.now = realNow;
  off2();
  eq("shown again / focus / back online re-read silently (hidden: no; 0.5 s after another: no)", seen2, ["visible", "focus", "online"]);

  // invalidateChannels: no service worker here -> it still tells the screens, and within the wait budget
  const heard: string[] = [];
  const off3 = L.subscribeChannelsChanged((why) => heard.push(why));
  const t1 = realNow();
  await L.invalidateChannels("write");
  eq("invalidateChannels without a worker still notifies the screens, quickly", [heard, realNow() - t1 < L.INVALIDATE_WAIT_MS + 400], [["event"], true]);
  off3();

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
void main();
