import type { ReactNode } from "react";
import { getToolDef } from "@/lib/chart/drawings/tools";
import { EXTRA_DRAW_ICONS } from "./icons-draw-extra";

/*
 * Own icon set for the terminal chrome.
 *  - drawing icons: 28x28 grid, stroke 1.6, round caps/joins, currentColor
 *  - UI icons (top toolbar, right strip): 24x24 grid, stroke 1.7
 * Anchor points are small filled dots, secondary strokes (dashed guides) are dimmed.
 */

/* ───────────── drawing icons (28 grid) ───────────── */

const Dot = ({ x, y, r = 2 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;
const Guide = { strokeDasharray: "2 3", opacity: 0.7 } as const;

const DRAW_ICONS: Record<string, ReactNode> = {
  /* cursors */
  cursor_cross: (
    <>
      <path d="M14 3.5v8M14 16.5v8M3.5 14h8M16.5 14h8" />
      <Dot x={14} y={14} r={1.4} />
    </>
  ),
  cursor_dot: (
    <>
      <circle cx="14" cy="14" r="8.5" opacity={0.45} />
      <Dot x={14} y={14} r={3.6} />
    </>
  ),
  cursor_arrow: <path d="M8 4.5v17.5l4.4-4 3 6.5 3-1.4-3-6.2 6-.4z" />,

  /* lines */
  trend: (
    <>
      <path d="M6.5 21.5L21.5 6.5" />
      <Dot x={5.5} y={22.5} />
      <Dot x={22.5} y={5.5} />
    </>
  ),
  ray: (
    <>
      <path d="M6 22L24 4" />
      <path d="M17.5 4H24v6.5" />
      <Dot x={5.5} y={22.5} />
    </>
  ),
  info: (
    <>
      <path d="M6 22.5L14 14.5" />
      <rect x="13" y="4" width="12" height="9.5" rx="2" />
      <path d="M16.5 7.8h5M16.5 10.6h3" />
      <Dot x={5.5} y={23} />
    </>
  ),
  extended: (
    <>
      <path d="M3 25L25 3" />
      <Dot x={10} y={18} />
      <Dot x={18} y={10} />
    </>
  ),
  hline: (
    <>
      <path d="M3 14h22" />
      <Dot x={14} y={14} />
    </>
  ),
  hray: (
    <>
      <path d="M6 14h19" />
      <path d="M20.5 9.5L25 14l-4.5 4.5" />
      <Dot x={5.5} y={14} />
    </>
  ),
  vline: (
    <>
      <path d="M14 3v22" />
      <Dot x={14} y={14} />
    </>
  ),
  crossline: (
    <>
      <path d="M14 3v22M3 14h22" />
      <Dot x={14} y={14} />
    </>
  ),
  channel: (
    <>
      <path d="M4.5 17.5L17.5 4.5M10.5 23.5L23.5 10.5" />
      <path d="M7.5 20.5L20.5 7.5" {...Guide} />
      <Dot x={4.5} y={17.5} />
      <Dot x={17.5} y={4.5} />
      <Dot x={10.5} y={23.5} />
    </>
  ),
  pitchfork: (
    <>
      <path d="M5 23L24 4M4 12L12 4M16 24l8-8" />
      <path d="M4 12l12 12" {...Guide} />
      <Dot x={5} y={23} />
      <Dot x={4} y={12} />
      <Dot x={16} y={24} />
    </>
  ),

  /* fibonacci */
  fib_retr: (
    <>
      <path d="M4 5h20M4 10.5h20M4 16h20M4 21.5h20" />
      <path d="M7 21.5L21 5" {...Guide} />
      <Dot x={7} y={21.5} />
      <Dot x={21} y={5} />
    </>
  ),
  fib_ext: (
    <>
      <path d="M4.5 23L9.5 8.5l5 8" />
      <path d="M15 5h10M15 10h10M15 15h10M15 20h10" opacity={0.75} />
      <Dot x={4.5} y={23} r={1.9} />
      <Dot x={9.5} y={8.5} r={1.9} />
      <Dot x={14.5} y={16.5} r={1.9} />
    </>
  ),
  fib_channel: (
    <>
      <path d="M4 15.5L15.5 4M4 20.5L20.5 4M8 24.5L24.5 8" />
      <Dot x={4} y={15.5} />
      <Dot x={15.5} y={4} />
    </>
  ),

  /* forecast / measure */
  long: (
    <>
      <rect x="4" y="4" width="20" height="10" rx="1" />
      <rect x="4" y="14" width="20" height="9" rx="1" opacity={0.6} />
      <path d="M14 11V7M11.6 9.4L14 7l2.4 2.4" />
    </>
  ),
  short: (
    <>
      <rect x="4" y="5" width="20" height="9" rx="1" opacity={0.6} />
      <rect x="4" y="14" width="20" height="10" rx="1" />
      <path d="M14 17v4M11.6 18.6L14 21l2.4-2.4" />
    </>
  ),
  price_range: (
    <>
      <path d="M5 5h18M5 23h18" />
      <path d="M14 7.5v13M10.8 10.5L14 7.3l3.2 3.2M10.8 17.5l3.2 3.2 3.2-3.2" />
    </>
  ),
  date_range: (
    <>
      <path d="M5 5v18M23 5v18" />
      <path d="M7.5 14h13M10.5 10.8L7.3 14l3.2 3.2M17.5 10.8l3.2 3.2-3.2 3.2" />
    </>
  ),
  datprice_range: (
    <>
      <rect x="4" y="5" width="20" height="18" rx="1.5" />
      <path d="M14 8.5v11M8.5 14h11" />
      <path d="M12 10.5l2-2 2 2M12 17.5l2 2 2-2M10.5 12l-2 2 2 2M17.5 12l2 2-2 2" />
    </>
  ),
  measure: (
    <g transform="rotate(-45 14 14)">
      <rect x="2" y="9" width="24" height="10" rx="2" />
      <path d="M7 9v4M11 9v5.5M15 9v4M19 9v5.5M23 9v4" />
    </g>
  ),

  /* shapes */
  rect: (
    <>
      <rect x="4.5" y="7.5" width="19" height="13" rx="1.5" />
      <Dot x={4.5} y={7.5} r={1.8} />
      <Dot x={23.5} y={20.5} r={1.8} />
    </>
  ),
  ellipse: (
    <>
      <ellipse cx="14" cy="14" rx="10" ry="7.5" />
      <Dot x={4} y={14} r={1.8} />
      <Dot x={24} y={14} r={1.8} />
    </>
  ),
  triangle: (
    <>
      <path d="M14 5L24.5 22.5h-21z" />
      <Dot x={14} y={5} r={1.8} />
      <Dot x={3.5} y={22.5} r={1.8} />
      <Dot x={24.5} y={22.5} r={1.8} />
    </>
  ),
  brush: (
    <>
      <path d="M22 3.5l3 3-9.5 9.5-3-3z" />
      <path d="M12.5 13c-2.6 0-4 1.7-4.3 3.9-.2 1.6-1 2.6-3.2 3 2.2 2.6 7.2 2.6 9-.3 1-1.6.6-3.5-.7-4.8" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 23l12-12" />
      <path d="M24.5 3.5L14 7l7 7z" fill="currentColor" />
    </>
  ),

  /* text / notes */
  text: <path d="M6 8.5V5.5h16v3M14 5.5v17.5M10.5 23h7" />,
  note: (
    <>
      <path d="M4 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-8l-5 5v-5H6a2 2 0 01-2-2z" />
      <path d="M9 10h10M9 14h6" />
    </>
  ),
  price_label: (
    <>
      <path d="M3 14l6-6h14.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H9z" />
      <Dot x={9.5} y={14} r={1.5} />
      <path d="M14 14h7" />
    </>
  ),
  flag: (
    <>
      <path d="M7 25V4" />
      <path d="M7 5.5h15.5l-4 5 4 5H7" />
    </>
  ),

  /* toolbar actions */
  magnet: (
    <>
      <path d="M7 4h4v11a3 3 0 006 0V4h4v11a7 7 0 01-14 0z" />
      <path d="M7 9h4M17 9h4" />
    </>
  ),
  stay: (
    <>
      <path d="M5 23l1-4.5L18.5 6l3.5 3.5L9.5 22z" />
      <path d="M15.5 9l3.5 3.5" />
      <path d="M15 25h8" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="12.5" width="17" height="11.5" rx="2.5" />
      <path d="M9.5 12.5V9.5a4.5 4.5 0 019 0v3" />
      <Dot x={14} y={18} r={1.6} />
    </>
  ),
  unlock: (
    <>
      <rect x="5.5" y="12.5" width="17" height="11.5" rx="2.5" />
      <path d="M9.5 12.5V9.5a4.5 4.5 0 018.6-1.9" />
      <Dot x={14} y={18} r={1.6} />
    </>
  ),
  eye: (
    <>
      <path d="M3 14s4.4-7.5 11-7.5S25 14 25 14s-4.4 7.5-11 7.5S3 14 3 14z" />
      <circle cx="14" cy="14" r="3.4" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 14s4.4-7.5 11-7.5S25 14 25 14s-4.4 7.5-11 7.5S3 14 3 14z" />
      <circle cx="14" cy="14" r="3.4" />
      <path d="M5 5l18 18" />
    </>
  ),
  trash: (
    <>
      <path d="M5 8h18M11 8V5.5h6V8" />
      <path d="M7 8l1.2 15h11.6L21 8M12 12v7M16 12v7" />
    </>
  ),
  undo: <path d="M10 7l-6 6 6 6M4 13h11a5.5 5.5 0 010 11h-5" />,
  redo: <path d="M18 7l6 6-6 6M24 13H13a5.5 5.5 0 000 11h5" />,
  clone: (
    <>
      <rect x="10" y="10" width="14" height="14" rx="2.5" />
      <path d="M6 18V8a2 2 0 012-2h10" />
    </>
  ),
  dashSolid: <path d="M3 14h22" />,
  dashDashed: <path d="M3 14h5M11.5 14h5M20 14h5" />,
  dashDotted: <path d="M4 14h.01M9 14h.01M14 14h.01M19 14h.01M24 14h.01" strokeWidth={3} />,
};

// the measure button shares the ruler glyph
DRAW_ICONS.measureBtn = DRAW_ICONS.measure;
Object.assign(DRAW_ICONS, EXTRA_DRAW_ICONS);

/* Glyphs of the Claude Design handoff ("FOMO Terminal Desktop v3"): 24 grid, stroke 1.8, round caps/joins, 20px in a 36px button.
   Anchor dots are zero-length strokes (`h.01`) that the round caps turn into dots. They win over the older 28-grid drawings above. */
export const DESIGN_DRAW_PATHS: Record<string, string> = {
  cursor_cross: "M12 4v16M4 12h16",
  trend: "M4 20L20 4M4 20h.01M20 4h.01",
  hline: "M3 12h18M7 12h.01M17 12h.01",
  fib_retr: "M3 5h18M3 11h12M3 16h18M3 21h12",
  rect: "M5 7h14v10H5z",
  brush: "M14 4l6 6-9 9H5v-6z",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  measure: "M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2",
  stamp_star: "M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.8 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z",
  magnet: "M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z",
  stay: "M4 20l4-1 11-11-3-3L5 16z",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  unlock: "M6 11h12v9H6zM8 11V8a4 4 0 017.6-1.7",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  eyeOff: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6zM4 4l16 16",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
};
DESIGN_DRAW_PATHS.measureBtn = DESIGN_DRAW_PATHS.measure;

export function DrawIcon({ id, className, size = 20 }: { id: string; className?: string; size?: number }) {
  const def = getToolDef(id);
  const design = DESIGN_DRAW_PATHS[id];
  if (def?.glyph && !design) {
    return (
      <span className={`inline-flex items-center justify-center leading-none ${className ?? ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.72) }} aria-hidden="true">
        {def.glyph}
      </span>
    );
  }
  return (
    <svg
      viewBox={design ? "0 0 24 24" : "0 0 28 28"}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      // 28-grid drawings get the same rendered line weight as the 24-grid design glyphs (1.8 / 24 * 28)
      strokeWidth={design ? 1.8 : 2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {design ? <path d={design} /> : (DRAW_ICONS[id] ?? <circle cx="14" cy="14" r="5" />)}
    </svg>
  );
}

/* ───────────── UI icons (24 grid) ───────────── */

export function ui(children: ReactNode, size = 17, sw = 1.8) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="shrink-0"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** One design glyph (a single path string from design/FOMO Terminal Desktop v3.dc.html). */
const g = (d: string, size = 17, sw = 1.8) => ui(<path d={d} />, size, sw);

/* Design glyph paths shared by several places (top toolbar 17px, right-hand buttons 18px, rail 20px) */
export const DESIGN_PATHS = {
  indicators: "M3 16l5-6 4 3 5-8 4 4",
  compare: "M3 17l5-5 4 3 8-9M3 7l5 5 4-3 8 8",
  alert: "M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  templates: "M3 5h8v8H3zM13 5h8v4h-8zM13 11h8v8h-8zM3 15h8v4H3z",
  replay: "M12 6v6l4 2M4 12a8 8 0 108-8M4 4v4h4",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z",
  search: "M20 20l-4-4",
  calendar: "M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 10h16M8 3v4M16 3v4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  star: "M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.8 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z",
  watchlist: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 8h.01M11 12h1v4h1",
  ideas: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6",
  objects: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12l5 5L20 7",
} as const;

export const UI_ICONS = {
  search: ui(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d={DESIGN_PATHS.search} />
    </>,
    15,
    2
  ),
  indicators: g(DESIGN_PATHS.indicators),
  alert: g(DESIGN_PATHS.alert),
  replay: g(DESIGN_PATHS.replay),
  undo: g(DESIGN_PATHS.undo),
  redo: g(DESIGN_PATHS.redo),
  gear: g(DESIGN_PATHS.gear, 18),
  fullscreen: g(DESIGN_PATHS.fullscreen, 18),
  camera: g(DESIGN_PATHS.camera, 18),
  tools: g("M4 20l4-1 11-11-3-3L5 16z", 18),
  panel: ui(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </>,
    18
  ),
  chevron: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
};

export const CHART_TYPE_ICONS: Record<string, ReactNode> = {
  candles: g("M7 4v3M7 17v3M5 7h4v10H5zM17 8v3M17 18v2M15 11h4v7h-4z"),
  hollow: g("M7 4v3M7 17v3M5 7h4v10H5zM17 8v3M17 18v2M15 11h4v7h-4z"),
  bars: g("M7 4v16M4 8h3M7 15h3M17 4v16M14 6h3M17 12h3"),
  line: g("M3 17l5-5 4 3 8-9"),
  area: g("M3 17l5-5 4 3 8-9v11H3z"),
  heikin: ui(
    <>
      <path d="M7 4v3M7 17v3M5 7h4v10H5zM17 8v3M17 18v2M15 11h4v7h-4z" />
      <path d="M5 7h4v10H5zM15 11h4v7h-4z" fill="currentColor" fillOpacity={0.3} stroke="none" />
    </>
  ),
};

/* right panel tab icons (design rail: 20px, stroke 1.8) */
const rail = (d: string) => ui(<path d={d} />, 20, 1.8);
export const PANEL_TAB_ICONS: Record<string, ReactNode> = {
  watchlist: rail(DESIGN_PATHS.watchlist),
  info: rail(DESIGN_PATHS.info),
  news: rail("M5 5h11a2 2 0 012 2v12H7a2 2 0 01-2-2zM18 9h1a1 1 0 011 1v7a2 2 0 01-2 2M8.5 9h6M8.5 12.5h6M8.5 16h3.5"),
  calendar: rail(DESIGN_PATHS.calendar),
  objects: rail(DESIGN_PATHS.objects),
  orderbook: rail("M4 5.5h9M4 9h6M4 12.5h11M20 11.5h-9M20 15h-6M20 18.5h-11"),
  algo: rail("M12 3.5l8.5 15.5h-17zM12 10v4M12 16.6h.01"),
};

/* ───────────── indicator UI icons (legend, catalog, settings) ───────────── */

const indIcon = (body: ReactNode, filled = false) =>
  function IndIcon(size = 16) {
    return filled ? (
      <svg viewBox="0 0 24 24" width={size} height={size} className="shrink-0" aria-hidden="true" focusable="false" fill="currentColor" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
        {body}
      </svg>
    ) : (
      ui(body, size, 1.8)
    );
  };

export const IND_ICONS = {
  eye: indIcon(<path d={DESIGN_PATHS.eye} />),
  eyeOff: indIcon(<path d={DESIGN_PATHS.eye + "M4 4l16 16"} />),
  gear: indIcon(<path d={DESIGN_PATHS.gear} />),
  more: indIcon(
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  close: indIcon(<path d={DESIGN_PATHS.close} />),
  chevronDown: indIcon(<path d="M6 9l6 6 6-6" />),
  chevronUp: indIcon(<path d="M6 15l6-6 6 6" />),
  chevronRight: indIcon(<path d="M9 6l6 6-6 6" />),
  star: indIcon(<path d={DESIGN_PATHS.star} />),
  starFilled: indIcon(<path d={DESIGN_PATHS.star} />, true),
  copy: indIcon(
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5" />
    </>
  ),
  trash: indIcon(<path d={DESIGN_PATHS.trash} />),
  plus: indIcon(<path d="M12 5v14M5 12h14" />),
  check: indIcon(<path d={DESIGN_PATHS.check} />),
  search: indIcon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d={DESIGN_PATHS.search} />
    </>
  ),
  pane: indIcon(
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 13.5h17" />
    </>
  ),
  reset: indIcon(<path d={DESIGN_PATHS.refresh} />),
  template: indIcon(<path d={DESIGN_PATHS.templates} />),
  recent: indIcon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  layers: indIcon(<path d={DESIGN_PATHS.objects} />),
};
