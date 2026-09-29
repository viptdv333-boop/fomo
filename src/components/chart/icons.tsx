import type { ReactNode } from "react";
import { getToolDef } from "@/lib/chart/drawings/tools";

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

export function DrawIcon({ id, className, size = 20 }: { id: string; className?: string; size?: number }) {
  const def = getToolDef(id);
  if (def?.glyph) {
    return (
      <span className={`inline-flex items-center justify-center leading-none ${className ?? ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.72) }} aria-hidden="true">
        {def.glyph}
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DRAW_ICONS[id] ?? <circle cx="14" cy="14" r="5" />}
    </svg>
  );
}

/* ───────────── UI icons (24 grid) ───────────── */

export function ui(children: ReactNode, size = 22, sw = 1.7) {
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

export const UI_ICONS = {
  search: ui(
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </>
  ),
  indicators: ui(
    <>
      <path d="M3 14.5c2.6-8 5.4-8 8-2.5s5.4 5.5 10-4" />
      <path d="M3 20h18" opacity={0.5} />
    </>
  ),
  alert: ui(
    <>
      <path d="M6 17.5V11a6 6 0 0112 0v6.5l1.6 2H4.4z" />
      <path d="M12 3v2M10 22a2 2 0 004 0" />
    </>
  ),
  replay: ui(
    <>
      <path d="M4.8 12a7.2 7.2 0 107.2-7.2H8.5" />
      <path d="M11.5 2l-3 2.8 3 2.8" />
      <path d="M10.5 9.3v5.4l4.3-2.7z" fill="currentColor" stroke="none" />
    </>
  ),
  undo: ui(
    <>
      <path d="M9 6l-5 5 5 5" />
      <path d="M4 11h10a5 5 0 010 10h-3" />
    </>
  ),
  redo: ui(
    <>
      <path d="M15 6l5 5-5 5" />
      <path d="M20 11H10a5 5 0 000 10h3" />
    </>
  ),
  gear: ui(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8l1.7 2.4 2.9-.7 1 2.8 2.8 1-.7 2.9L21.2 12l-2.4 1.7.7 2.9-2.8 1-1 2.8-2.9-.7L12 21.2l-1.7-2.4-2.9.7-1-2.8-2.8-1 .7-2.9L2.8 12l2.4-1.7-.7-2.9 2.8-1 1-2.8 2.9.7z" />
    </>
  ),
  fullscreen: ui(<path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15" />),
  camera: ui(
    <>
      <path d="M3.5 9a1.5 1.5 0 011.5-1.5h2.3l1.4-2.5h6.6l1.4 2.5H19a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 18z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  tools: ui(
    <>
      <path d="M4 20l1-4.2L16.5 4.3a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.2 19z" />
      <path d="M14 7l3 3" />
    </>
  ),
  panel: ui(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
};

export const CHART_TYPE_ICONS: Record<string, ReactNode> = {
  candles: ui(
    <>
      <path d="M6 4v3.5M6 15v5M12 3v4M12 13v4M18 7v3M18 17v4" />
      <rect x="4.2" y="7.5" width="3.6" height="7.5" rx=".6" fill="currentColor" />
      <rect x="10.2" y="7" width="3.6" height="6" rx=".6" fill="currentColor" />
      <rect x="16.2" y="10" width="3.6" height="7" rx=".6" fill="currentColor" />
    </>
  ),
  hollow: ui(
    <>
      <path d="M6 4v3.5M6 15v5M12 3v4M12 13v4M18 7v3M18 17v4" />
      <rect x="4.2" y="7.5" width="3.6" height="7.5" rx=".6" />
      <rect x="10.2" y="7" width="3.6" height="6" rx=".6" />
      <rect x="16.2" y="10" width="3.6" height="7" rx=".6" />
    </>
  ),
  bars: ui(<path d="M6 4v16M3.5 8H6M6 16h2.5M12 3v14M9.5 6H12M12 13h2.5M18 7v14M15.5 10H18M18 17h2.5" />),
  line: ui(
    <>
      <path d="M3 17l5-6 4 3 4-7 5 4" />
      <Dot x={21} y={11} r={1.6} />
    </>
  ),
  area: ui(
    <>
      <path d="M3 17l5-6 4 3 4-7 5 4v7H3z" fill="currentColor" fillOpacity={0.22} stroke="none" />
      <path d="M3 17l5-6 4 3 4-7 5 4" />
      <path d="M3 21h18" opacity={0.5} />
    </>
  ),
  heikin: ui(
    <>
      <path d="M6 3v3M6 16v4M12 4v3M12 17v3M18 6v3M18 16v4" />
      <rect x="4.2" y="6" width="3.6" height="10" rx=".6" fill="currentColor" fillOpacity={0.35} />
      <rect x="10.2" y="7" width="3.6" height="10" rx=".6" fill="currentColor" fillOpacity={0.35} />
      <rect x="16.2" y="9" width="3.6" height="7" rx=".6" fill="currentColor" fillOpacity={0.35} />
    </>
  ),
};

/* right panel tab icons */
export const PANEL_TAB_ICONS: Record<string, ReactNode> = {
  watchlist: ui(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <Dot x={4.5} y={6} r={1.3} />
      <Dot x={4.5} y={12} r={1.3} />
      <Dot x={4.5} y={18} r={1.3} />
    </>
  ),
  info: ui(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <Dot x={12} y={7.8} r={1.1} />
    </>
  ),
  news: ui(
    <>
      <path d="M5 5h11a2 2 0 012 2v12H7a2 2 0 01-2-2z" />
      <path d="M18 9h1a1 1 0 011 1v7a2 2 0 01-2 2M8.5 9h6M8.5 12.5h6M8.5 16h3.5" />
    </>
  ),
  calendar: ui(
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
      <Dot x={8.5} y={14} r={1} />
      <Dot x={12} y={14} r={1} />
      <Dot x={15.5} y={14} r={1} />
    </>
  ),
};
