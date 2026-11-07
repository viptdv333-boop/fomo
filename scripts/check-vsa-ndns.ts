// VSA ND / NS indicator: an up bar with a narrow spread and volume below the previous bars is No Demand, a down one is No Supply.
import { INDICATOR_DEFS, defaultParams, getIndicatorDef, computeIndicator } from "../src/lib/chart/indicators/registry";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/lib/chart/settings";

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const def = getIndicatorDef("vsa_nd_ns");
check("the indicator is registered", !!def && INDICATOR_DEFS.includes(def));
if (def) {
  // 30 ordinary bars (range 2, volume 100), then: a narrow up bar on low volume (ND), a wide up bar, a narrow down bar on low volume (NS), a narrow up bar on HIGH volume
  const cs = Array.from({ length: 30 }, (_, i) => ({ t: i * 60_000, o: 100, h: 101, l: 99, c: i % 2 ? 100.4 : 99.6, v: 100 }));
  const add = (o: number, h: number, l: number, c: number, v: number) => cs.push({ t: cs.length * 60_000, o, h, l, c, v });
  add(100, 100.6, 100, 100.5, 40); // 30: narrow, up (close above the previous 99.6), volume below the two before -> ND
  add(100.5, 103, 100.4, 102.8, 30); // 31: wide spread: nothing
  add(102.8, 103, 102.4, 102.5, 20); // 32: narrow, down, quiet -> NS
  add(102.5, 103, 102.4, 102.9, 500); // 33: narrow, up, loud: nothing
  const res = computeIndicator(def, cs, defaultParams(def));
  const ex = res.extra as { nd: number[]; ns: number[] };
  check("ND on the narrow quiet up bar", ex.nd.includes(30));
  check("NS on the narrow quiet down bar", ex.ns.includes(32));
  check("no signal on the wide bar", !ex.nd.includes(31) && !ex.ns.includes(31));
  check("no signal when the volume is high", !ex.nd.includes(33) && !ex.ns.includes(33));
}

check("max line width defaults to 0.5 px", DEFAULT_SETTINGS.maxLineWidth === 0.5 && normalizeSettings({}).maxLineWidth === 0.5 && normalizeSettings({ maxLineWidth: 0 }).maxLineWidth === 0.5 && normalizeSettings({ maxLineWidth: -1 }).maxLineWidth === -1);
check("0.5 px survives the settings normaliser", normalizeSettings({ maxLineWidth: 0.5 }).maxLineWidth === 0.5);
check("a nonsense width falls back to 0.5 px", normalizeSettings({ maxLineWidth: -3 }).maxLineWidth === 0.5 && normalizeSettings({ maxLineWidth: "x" }).maxLineWidth === 0.5);
check("a huge width is cut to 4 px", normalizeSettings({ maxLineWidth: 99 }).maxLineWidth === 4);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
