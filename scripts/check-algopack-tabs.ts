/* Which ALGOPACK tabs («Стакан», «ALGOPACK») the terminal shows (src/lib/algopack-tabs.ts) and who the server serves
   (src/lib/algopack-policy.ts, ALGOPACK_PUBLIC kill switch). Run: npx tsx scripts/check-algopack-tabs.ts (exit code 1 on a failure) */
import { allowedFromStatus, effectiveTab, filterTabs, isAlgopackTab } from "../src/lib/algopack-tabs";
import { algopackPolicy } from "../src/lib/algopack-policy";
import { guestGateAlgopack } from "../src/lib/guest-delay";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const ids = ["watchlist", "info", "ideas", "news", "calendar", "objects", "alerts", "orderbook", "algo"].map((id) => ({ id }));
const names = (a: { id: string }[]) => a.map((x) => x.id);
eq("tab ids", [isAlgopackTab("orderbook"), isAlgopackTab("algo"), isAlgopackTab("calendar")], [true, true, false]);
eq("allowed: all tabs, order kept", names(filterTabs(ids, true)), names(ids));
eq("denied / no key / guest: no ALGOPACK tabs", names(filterTabs(ids, false)), ["watchlist", "info", "ideas", "news", "calendar", "objects", "alerts"]);
eq("unknown yet: not shown (no flicker)", names(filterTabs(ids, null)), ["watchlist", "info", "ideas", "news", "calendar", "objects", "alerts"]);
eq("saved orderbook tab, server said no -> watchlist", effectiveTab("orderbook", false, "watchlist"), "watchlist");
eq("saved algo tab, server said no -> watchlist", effectiveTab("algo", false, "watchlist"), "watchlist");
eq("saved orderbook tab, still unknown -> kept (panel paints its own loading)", effectiveTab("orderbook", null, "watchlist"), "orderbook");
eq("saved orderbook tab, allowed -> kept", effectiveTab("orderbook", true, "watchlist"), "orderbook");
eq("other tabs never touched", effectiveTab("calendar", false, "watchlist"), "calendar");

eq("status: ok+allowed", allowedFromStatus(200, { ok: true, allowed: true, why: "public" }), true);
eq("status: not allowed", allowedFromStatus(200, { ok: true, allowed: false, why: "denied" }), false);
eq("status: no key", allowedFromStatus(200, { ok: true, allowed: false, why: "no-key" }), false);
eq("status: 404 (route gone / terminal allowlist)", allowedFromStatus(404, { ok: false }), false);
eq("status: garbage", allowedFromStatus(200, "x"), false);
eq("status: null body", allowedFromStatus(200, null), false);

/* server policy: who gets the data */
const user = { role: "USER" };
const admin = { role: "ADMIN" };
const on = { enabled: true, publicFlag: true };
const off = { enabled: true, publicFlag: false };
eq("default: signed-in user allowed", guestGateAlgopack(algopackPolicy(user, on), true, false).allowed, true);
eq("default: guest (no session) denied", guestGateAlgopack(algopackPolicy(null, on), false, false).allowed, false);
eq("kill switch: user denied", algopackPolicy(user, off).allowed, false);
eq("kill switch: admin allowed", algopackPolicy(admin, off).allowed, true);
eq("no key: nobody", algopackPolicy(admin, { enabled: false, publicFlag: true }).why, "no-key");

if (fails > 0) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
