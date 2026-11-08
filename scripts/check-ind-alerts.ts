// Run: npx tsx scripts/check-ind-alerts.ts
import { stepIndAlert, type IndAlert } from "../src/lib/chart/indicator-alerts";

let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
};

const base = { level: 20, condition: "cross" as const, repeat: false, status: "active" as const, lastSide: 0, lastFiredAt: null as number | null };

check("first sight only records the side", JSON.stringify(stepIndAlert(base, 30, 1)) === JSON.stringify({ triggered: false, patch: { lastSide: 1 } }));
check("RSI falls through 20: fires once", stepIndAlert({ ...base, lastSide: 1 }, 18, 2).triggered === true && stepIndAlert({ ...base, lastSide: 1 }, 18, 2).patch?.status === "triggered");
check("same side: nothing", stepIndAlert({ ...base, lastSide: 1 }, 25, 2).triggered === false && stepIndAlert({ ...base, lastSide: 1 }, 25, 2).patch === null);
check("«up» ignores a fall (and records the new side)", (() => { const r = stepIndAlert({ ...base, condition: "up", lastSide: 1 }, 18, 2); return !r.triggered && r.patch?.lastSide === -1; })());
check("«down» fires on a fall, not on a rise", stepIndAlert({ ...base, condition: "down", lastSide: 1 }, 18, 2).triggered && !stepIndAlert({ ...base, condition: "down", lastSide: -1 }, 25, 2).triggered);
check("a triggered alert is not checked", stepIndAlert({ ...base, status: "triggered", lastSide: 1 }, 18, 2).triggered === false);
check("repeat re-arms and keeps the cooldown", (() => {
  const a = { ...base, repeat: true, lastSide: 1 };
  const first = stepIndAlert(a, 18, 100_000);
  const again = stepIndAlert({ ...a, lastSide: 1, lastFiredAt: 100_000 }, 18, 110_000);
  return first.triggered && first.patch?.status === "active" && !again.triggered;
})());
check("NaN and a value exactly on the level do nothing", !stepIndAlert(base, NaN, 1).triggered && stepIndAlert(base, 20, 1).patch === null);
check("negative levels work (MACD)", stepIndAlert({ ...base, level: -0.5, lastSide: 1 }, -0.7, 3).triggered);
void ({} as IndAlert);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\nall passed");
