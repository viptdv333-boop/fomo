/* Guest demo budget (src/lib/demo-gate.ts) and the guest real-time rules (src/lib/guest-delay.ts).
   Run: npx tsx scripts/check-demo-gate.ts   (exit code 1 on a failed assertion) */
import {
  DEMO_BUDGET_MS,
  MAX_STEP_MS,
  addUsage,
  clampStep,
  freshState,
  isExhausted,
  localDay,
  mergeStates,
  normalizeState,
  parseState,
  serializeState,
} from "../src/lib/demo-gate";
import { guestGateAlgopack, guestRealtimeFlag, realtimeAllowed } from "../src/lib/guest-delay";
import { algopackPolicy } from "../src/lib/algopack-policy";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const D1 = "2026-10-04";
const D2 = "2026-10-05";

/* constants */
eq("budget is 5 minutes", DEMO_BUDGET_MS, 300_000);
eq("step clamp is 2 s", MAX_STEP_MS, 2000);
eq("localDay formats a local date", localDay(new Date(2026, 0, 9, 23, 59)), "2026-01-09");

/* clamping of one step */
eq("clamp: normal step kept", clampStep(1000), 1000);
eq("clamp: 2 s kept", clampStep(2000), 2000);
eq("clamp: a sleeping laptop (8 h) counts 2 s", clampStep(8 * 3600_000), 2000);
eq("clamp: negative -> 0", clampStep(-5), 0);
eq("clamp: NaN -> 0", clampStep(NaN), 0);
eq("clamp: Infinity -> 0", clampStep(Infinity), 0);
eq("addUsage clamps the delta", addUsage(freshState(D1), 60_000, D1).usedMs, 2000);

/* accumulation to the boundary */
let s = freshState(D1);
for (let i = 0; i < 149; i++) s = addUsage(s, 1000, D1);
eq("149 s used: not exhausted", isExhausted(s, D1), false);
let t = freshState(D1);
for (let i = 0; i < 299; i++) t = addUsage(t, 1000, D1);
eq("299 s used: not exhausted", [t.usedMs, isExhausted(t, D1)], [299_000, false]);
t = addUsage(t, 999, D1);
eq("299.999 s used: not exhausted", [t.usedMs, isExhausted(t, D1)], [299_999, false]);
t = addUsage(t, 1, D1);
eq("exactly 5:00: exhausted", [t.usedMs, isExhausted(t, D1)], [300_000, true]);
t = addUsage(t, 2000, D1);
eq("over the budget stays capped at 5:00", [t.usedMs, isExhausted(t, D1)], [300_000, true]);
eq("addUsage does not mutate its input", (() => { const a = freshState(D1); addUsage(a, 1000, D1); return a.usedMs; })(), 0);

/* day rollover */
const used = { day: D1, usedMs: 300_000 };
eq("exhausted yesterday: not exhausted today", isExhausted(used, D2), false);
eq("addUsage on a new day starts from zero", addUsage(used, 1000, D2), { day: D2, usedMs: 1000 });
eq("a state of another day is normalised to a fresh one", normalizeState(used, D2), freshState(D2));
eq("a future day (clock set back) is a fresh state", normalizeState({ day: "2099-01-01", usedMs: 300_000 }, D1), freshState(D1));

/* corrupt / hostile storage */
eq("null storage", parseState(null, D1), freshState(D1));
eq("empty string", parseState("", D1), freshState(D1));
eq("corrupt JSON", parseState("{not json", D1), freshState(D1));
eq("JSON null", parseState("null", D1), freshState(D1));
eq("JSON array", parseState("[1,2]", D1), freshState(D1));
eq("JSON number", parseState("42", D1), freshState(D1));
eq("missing day", parseState('{"usedMs":5}', D1), freshState(D1));
eq("bad day format", parseState('{"day":"yesterday","usedMs":5}', D1), freshState(D1));
eq("negative usage", parseState('{"day":"2026-10-04","usedMs":-1}', D1), freshState(D1));
eq("string usage", parseState('{"day":"2026-10-04","usedMs":"900"}', D1), freshState(D1));
eq("null usage", parseState('{"day":"2026-10-04","usedMs":null}', D1), freshState(D1));
eq("NaN usage (serialised as null)", parseState(JSON.stringify({ day: D1, usedMs: NaN }), D1), freshState(D1));
eq("huge usage is capped to the budget (exhausted)", parseState('{"day":"2026-10-04","usedMs":1e15}', D1), { day: D1, usedMs: DEMO_BUDGET_MS });
eq("valid state survives a round trip", parseState(serializeState({ day: D1, usedMs: 123_456 }), D1), { day: D1, usedMs: 123_456 });
eq("extra fields are dropped", parseState('{"day":"2026-10-04","usedMs":10,"admin":true}', D1), { day: D1, usedMs: 10 });
eq("normalizeState(undefined)", normalizeState(undefined, D1), freshState(D1));
eq("isExhausted(garbage) is false", isExhausted({ day: "x", usedMs: 1e9 } as never, D1), false);

/* tabs */
eq("merge: the larger usage wins", mergeStates({ day: D1, usedMs: 10_000 }, { day: D1, usedMs: 70_000 }, D1), { day: D1, usedMs: 70_000 });
eq("merge: another day's state is ignored", mergeStates({ day: D1, usedMs: 10_000 }, { day: "2026-09-01", usedMs: 290_000 }, D1), { day: D1, usedMs: 10_000 });
// two visible tabs count the same wall time once (max merge), not twice
let a = freshState(D1);
let b = freshState(D1);
for (let i = 0; i < 100; i++) {
  a = addUsage(a, 1000, D1);
  b = addUsage(b, 1000, D1);
  if (i % 4 === 0) {
    const m = mergeStates(a, b, D1);
    a = m;
    b = m;
  }
}
eq("two simultaneously visible tabs: 100 s of wall time = 100 s used", mergeStates(a, b, D1).usedMs, 100_000);

/* guest real time (licensing) */
const env = (v?: string) => ({ GUEST_REALTIME: v });
eq("GUEST_REALTIME unset", guestRealtimeFlag(env()), false);
eq("GUEST_REALTIME=1", guestRealtimeFlag(env("1")), true);
eq("GUEST_REALTIME=true", guestRealtimeFlag(env("true")), true);
eq("GUEST_REALTIME=0", guestRealtimeFlag(env("0")), false);
eq("GUEST_REALTIME=yes is not accepted", guestRealtimeFlag(env("yes")), false);
eq("signed-in gets real time", realtimeAllowed(true, false), true);
eq("guest gets delayed data", realtimeAllowed(false, false), false);
eq("guest + GUEST_REALTIME gets real time", realtimeAllowed(false, true), true);

const pub = algopackPolicy(null, { enabled: true, publicFlag: true });
eq("policy precondition: ALGOPACK_PUBLIC opens it for anonymous", pub.allowed, true);
eq("guest is denied even with ALGOPACK_PUBLIC", guestGateAlgopack(pub, false, false).allowed, false);
eq("signed-in user keeps ALGOPACK_PUBLIC access", guestGateAlgopack(algopackPolicy({ role: "USER" }, { enabled: true, publicFlag: true }), true, false).allowed, true);
eq("GUEST_REALTIME restores the guest access", guestGateAlgopack(pub, false, true).allowed, true);
const adm = algopackPolicy({ role: "ADMIN" }, { enabled: true, publicFlag: false });
eq("admin stays allowed", guestGateAlgopack(adm, true, false), adm);
const none = algopackPolicy(null, { enabled: true, publicFlag: false });
eq("anonymous without ALGOPACK_PUBLIC stays denied", guestGateAlgopack(none, false, true).allowed, false);

if (fails > 0) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall demo-gate checks passed");
