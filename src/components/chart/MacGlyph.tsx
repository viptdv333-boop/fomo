import { RAIL_GLYPHS, SIDE_GLYPHS, TB_GLYPHS, type Glyph } from "./mac-glyph-data";

/** A glyph of the macOS look, drawn like the design does it: a translucent fill of the light colour under a stroke of the dark one with a soft glow.
 *  It sits next to the classic icon of the same button; terminal-mac.css shows one or the other (`.mg` is hidden unless `.tvmac`). */
export default function MacGlyph({ set, k, alpha = "66", width = 1.7 }: { set: "rail" | "side" | "tb"; k: string; alpha?: string; width?: number }) {
  const g: Glyph | undefined = (set === "rail" ? RAIL_GLYPHS : set === "side" ? SIDE_GLYPHS : TB_GLYPHS)[k];
  if (!g) return null;
  const [light, stroke, d, fl] = g;
  return (
    <svg className="mg" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ ["--mg-glow" as string]: `${stroke}55` }}>
      {fl && <path d={fl} fill={`${light}${alpha}`} stroke="none" />}
      <path d={d} />
    </svg>
  );
}
