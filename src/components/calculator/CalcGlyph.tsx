import MacSvg from "@/components/chart/MacSvg";

/* Duotone glyphs of the calculator in the language of the "macOS" look (same recipe as src/components/chart/mac-glyph-data.ts:
   [light fill colour, stroke colour, outline path, fill path]). Used by the site page and by the app screen, only while the skin is on. */
type G = [string, string, string, string];

export const CALC_GLYPHS = {
  calc: ["#7CC29B", "#4F9A74", "M6 3h12v18H6zM8.5 6.5h7v3h-7zM9 13h.01M12 13h.01M15 13h.01M9 17h.01M12 17h.01M15 17h.01", "M6 3h12v18H6z"],
  sliders: ["#7DB0D6", "#5B8FC0", "M4 7h10M18 7h2M4 17h2M10 17h10M16 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0", "M16 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"],
  target: ["#6A8FD0", "#5577B8", "M2 12h4M18 12h4M12 2v4M12 18v4M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0", "M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0"],
  shield: ["#E6B877", "#CC9446", "M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z", "M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"],
  gauge: ["#DE96A0", "#C46A78", "M4 17a8 8 0 0116 0zM12 17l3.5-4.5", "M4 17a8 8 0 0116 0z"],
  box: ["#6BB3B8", "#4F9AA0", "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5", "M12 3l9 5-9 5-9-5z"],
  wallet: ["#7DB0D6", "#5B8FC0", "M3 9a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 9V6a2 2 0 012-2h11M16 14h.01", "M3 9a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"],
  profit: ["#7CC29B", "#4F9A74", "M3 17l6-6 4 4 8-8M15 7h6v6", "M3 17l6-6 4 4 6-6v9H3z"],
  scale: ["#A78BC9", "#8A6DB0", "M12 4v16M6 20h12M5 8h14M5 8l-3 7h6zM19 8l-3 7h6z", "M5 8l-3 7h6zM19 8l-3 7h6z"],
  copy: ["#ffffff", "#ffffff", "M9 9h11v11H9zM5 15V4h11", "M9 9h11v11H9z"],
} satisfies Record<string, G>;

export type CalcGlyphName = keyof typeof CALC_GLYPHS;

/** The duotone glyph: translucent fill + stroke + soft glow. */
export default function CalcGlyph({ name, size = 24, alpha = "66", width = 1.7 }: { name: CalcGlyphName; size?: number; alpha?: string; width?: number }) {
  const [light, stroke, d, fl] = CALC_GLYPHS[name];
  return <MacSvg d={d} fl={fl} light={light} stroke={stroke} size={size} alpha={alpha} width={width} glow={name !== "copy"} />;
}

/** a coloured rounded tile with the glyph (the big icon of a row / the title) */
export function CalcTile({ name, size = 44 }: { name: CalcGlyphName; size?: number }) {
  const stroke = CALC_GLYPHS[name][1];
  return (
    <span className="calc-tile" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: `${stroke}1f`, boxShadow: `inset 0 0 0 0.5px ${stroke}33` }} aria-hidden="true">
      <CalcGlyph name={name} size={Math.round(size * 0.58)} />
    </span>
  );
}
