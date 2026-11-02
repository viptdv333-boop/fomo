/** A glyph of the macOS look drawn the way the design does it (translucent fill of the light colour under a stroke of the dark one with a soft glow),
 *  for the phone version where no classic icon sits next to it (MacGlyph is the desktop's twin that hides behind `.tvmac`). */
export default function MacSvg({ d, fl, light, stroke, size = 24, alpha = "66", width = 1.7, glow = true }: { d: string; fl: string; light: string; stroke: string; size?: number; alpha?: string; width?: number; glow?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={glow ? { filter: `drop-shadow(0 2px 3px ${stroke}55)` } : undefined}
    >
      {fl && <path d={fl} fill={`${light}${alpha}`} stroke="none" />}
      <path d={d} />
    </svg>
  );
}
