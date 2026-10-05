"use client";

import Flag from "./Flag";
import { FX_CURRENCIES, parseFxSymbol } from "@/lib/forex-meta";
import type { TerminalInstrument } from "@/lib/terminal-data";

/** Two overlapping flags of a currency pair (EUR/USD); the metals have artwork and never get here. */
function PairIcon({ symbol, size }: { symbol: string; size: number }) {
  const p = parseFxSymbol(symbol);
  const fw = Math.round(size * 0.72);
  const fh = Math.round((fw * 20) / 30);
  return (
    <span className="relative shrink-0 inline-block" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute left-0 top-0 leading-none">
        <Flag code={p ? FX_CURRENCIES[p.base]?.flag ?? "" : ""} width={fw} />
      </span>
      <span className="absolute right-0 leading-none" style={{ top: size - fh }}>
        <Flag code={p ? FX_CURRENCIES[p.quote]?.flag ?? "" : ""} width={fw} />
      </span>
    </span>
  );
}

/** Round icon of an instrument: its artwork, the two flags of a currency pair, or the first letters of the ticker. */
export default function InstIcon({ inst, size = 20 }: { inst: TerminalInstrument; size?: number }) {
  if (!inst.emoji && inst.source === "forex" && parseFxSymbol(inst.dataTicker)) return <PairIcon symbol={inst.dataTicker} size={size} />;
  if (inst.emoji) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={inst.emoji} alt="" width={size} height={size} className="rounded-full shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="rounded-full shrink-0 flex items-center justify-center bg-[var(--tv3-fill2)] text-[var(--tv3-text2)] font-bold"
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42) }}
      aria-hidden
    >
      {inst.ticker.slice(0, 2).toUpperCase()}
    </span>
  );
}
