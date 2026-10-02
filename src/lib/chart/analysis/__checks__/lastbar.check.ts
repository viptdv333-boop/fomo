/* Finds indicators whose value on a freshly opened forming bar (volume 0, o=h=l=c) jumps to 0 / far away from the previous bar:
   such a value draws a long vertical line to the bottom of the pane. Run: npx tsx src/lib/chart/analysis/__checks__/lastbar.check.ts */
import { INDICATOR_DEFS, computeIndicator, defaultParams } from "../../indicators/registry";

function synth(n: number): any[] {
  const out: any[] = [];
  let p = 468;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o + rnd() * 1.2;
    const h = Math.max(o, c) + Math.abs(rnd()) * 0.4;
    const l = Math.min(o, c) - Math.abs(rnd()) * 0.4;
    out.push({ t: 1_790_000_000_000 + i * 60_000, o, h, l, c, v: 1000 + Math.floor(Math.abs(rnd()) * 3000) });
    p = c;
  }
  return out;
}

const base = synth(600);
const last = base[base.length - 1];
const variants: Record<string, any[]> = {
  "fresh bar v=0": [...base, { t: last.t + 60_000, o: last.c, h: last.c, l: last.c, c: last.c, v: 0 }],
  "fresh bar v=0, new day gap": [...base, { t: last.t + 3 * 3_600_000, o: last.c + 1, h: last.c + 1, l: last.c + 1, c: last.c + 1, v: 0 }],
};

for (const [name, candles] of Object.entries(variants)) {
  console.log(`\n== ${name}`);
  let bad = 0;
  for (const def of INDICATOR_DEFS) {
    let res: any;
    try {
      res = computeIndicator(def, candles, defaultParams(def), { flow: null, intervalMs: 60_000 } as any);
    } catch (e) {
      console.log(`  ${def.id}: THROWS ${(e as Error).message}`);
      continue;
    }
    for (const pl of res.plots ?? []) {
      const v: ArrayLike<number> = pl.data;
      if (!v || v.length < 3) continue;
      const n = v.length;
      const a = v[n - 1];
      const b = v[n - 2];
      const scale = Math.max(1e-9, Math.abs(b) || 1);
      // flag: finite value that is exactly 0 while the previous one was not, or a jump of more than 50% of the level
      if (Number.isFinite(a) && Number.isFinite(b) && ((a === 0 && b !== 0) || Math.abs(a - b) / scale > 0.5)) {
        // oscillators legitimately move a lot; only report when the previous bar was non-zero and the move is to ~0
        console.log(`  ${def.id}.${pl.key}: prev=${b} last=${a}`);
        bad++;
      }
    }
  }
  console.log(`  flagged: ${bad}`);
}
