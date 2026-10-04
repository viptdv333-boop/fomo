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

/* ───────────── SF-Symbols-like glyph set (iOS style) ─────────────
   24 grid, stroke 1.8, round caps/joins, simple shapes. The active tool / tab shows a FILLED variant (iOS tab-bar convention):
   solid glyph with cut-outs (SVG masks) in the accent colour on a tinted rounded square. Anchor dots of lines are small hollow circles. */

/** Path of a rounded rectangle (SF-like corners). */
export const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

const CUR = "currentColor";

/** Solid shape with transparent cut-outs: `cut` is drawn black into a mask (strokes are 1.8 round by default, add fill="#000" for solids). */
function Cutout({ id, cut, children }: { id: string; cut: ReactNode; children: ReactNode }) {
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="-12" y="-12" width="48" height="48">
        <rect x="-12" y="-12" width="48" height="48" fill="#fff" stroke="none" />
        <g fill="none" stroke="#000" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {cut}
        </g>
      </mask>
      <g mask={`url(#${id})`} fill={CUR} stroke={CUR} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
        {children}
      </g>
    </>
  );
}

/* shared outlines (also used by the filled variants) */
const P = {
  bell: "M12 3.8a5.6 5.6 0 00-5.6 5.6v2.9c0 .8-.3 1.6-.8 2.2L4.5 16c-.5.7 0 1.5.9 1.5h13.2c.9 0 1.4-.8.9-1.5l-1.1-1.5c-.5-.6-.8-1.4-.8-2.2V9.4A5.6 5.6 0 0012 3.8z",
  bellClapper: "M9.6 20.2a2.6 2.6 0 004.8 0",
  doc: "M7 3.5h6L18.5 9v10a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 19V5A1.5 1.5 0 017 3.5z",
  docFold: "M13 3.5V8a1 1 0 001 1h4.5",
  docLines: "M8.8 13.2h6.4M8.8 16.6h6.4",
  circle: "M12 3a9 9 0 100 18 9 9 0 000-18z",
  magnet: "M5.5 4.5h4v7.3a2.5 2.5 0 005 0V4.5h4V12a6.5 6.5 0 01-13 0z",
  pencil: "M4.6 19.4l.9-3.9 9.6-9.6a1.7 1.7 0 012.4 0l1.1 1.1a1.7 1.7 0 010 2.4l-9.6 9.6z",
  star: "M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.8 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z",
  almond: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z",
  lockBody: rr(5.5, 10.5, 13, 9.5, 2.6),
  calendar: rr(4, 5, 16, 15, 3.2),
  newsBody: "M5 5.5A1.5 1.5 0 016.5 4h9A1.5 1.5 0 0117 5.5V19H7a2 2 0 01-2-2z",
  newsSide: "M17 9h1.5a1.5 1.5 0 011.5 1.5V17a2 2 0 01-2 2",
  layerTop: "M12 3.5l8.5 4.6-8.5 4.7-8.5-4.7z",
  layerBottom: "M3.5 12.6L12 17.3l8.5-4.7",
  triangle: "M12 3.8l8.4 15H3.6z",
  brush: "M20 4.2l-7.6 7.6M12.4 11.8c-2.4-.3-4.4 1.2-4.6 3.5-.1 1.3-.8 2.2-2.2 2.6 2.7 1.8 6.6 1.3 8-1.2.9-1.6.6-3.1-1.2-4.9z",
};

type SfDraw = (on: boolean) => ReactNode;
const sw = (on: boolean, base = 1.8) => (on ? base + 0.5 : base);
const hollow = (on: boolean) => (on ? CUR : "none");

/** Rail / toolbar drawing glyphs: [id] -> (active) => svg children. */
export const SF_DRAW: Record<string, SfDraw> = {
  cursor_cross: (on) => <path d="M12 4.5v15M4.5 12h15" strokeWidth={sw(on, 1.9)} />,
  trend: (on) => (
    <>
      <path d="M6.6 17.4L17.4 6.6" strokeWidth={sw(on)} />
      <circle cx="5" cy="19" r="2.2" fill={hollow(on)} />
      <circle cx="19" cy="5" r="2.2" fill={hollow(on)} />
    </>
  ),
  hline: (on) => (
    <>
      <path d="M3.5 12h6.1M14.4 12h6.1" strokeWidth={sw(on)} />
      <circle cx="12" cy="12" r="2.4" fill={hollow(on)} />
    </>
  ),
  fib_retr: (on) => <path d="M4 5.5h16M4 10.2h11M4 14.8h16M4 19.5h11" strokeWidth={sw(on)} />,
  rect: (on) => <path d={rr(4.5, 6.5, 15, 11, 2.6)} fill={hollow(on)} />,
  brush: (on) => (on ? (
    <>
      <path d={P.brush} fill={CUR} />
      <path d="M20 4.2l-7.6 7.6" strokeWidth={2.4} />
    </>
  ) : <path d={P.brush} />),
  text: (on) => <path d="M5.5 7.5V5h13v2.5M12 5v14.5M9 19.5h6" strokeWidth={sw(on)} />,
  measure: (on) =>
    on ? (
      <g transform="rotate(-45 12 12)">
        <Cutout id="tv3m-ruler" cut={<path d="M7.5 7.6v3.2M11 7.6v4.6M14.5 7.6v3.2M18 7.6v4.6" strokeWidth={1.6} />}>
          <path d={rr(2.5, 7.6, 19, 8.8, 2.2)} />
        </Cutout>
      </g>
    ) : (
      <g transform="rotate(-45 12 12)">
        <path d={rr(2.5, 7.6, 19, 8.8, 2.2)} />
        <path d="M7.5 7.6v3.2M11 7.6v4.6M14.5 7.6v3.2M18 7.6v4.6" />
      </g>
    ),
  stamp_star: (on) => <path d={P.star} fill={hollow(on)} />,
  magnet: (on) =>
    on ? (
      <Cutout id="tv3m-magnet" cut={<path d="M5.5 8.6h4M14.5 8.6h4" />}>
        <path d={P.magnet} />
      </Cutout>
    ) : (
      <>
        <path d={P.magnet} />
        <path d="M5.5 8.6h4M14.5 8.6h4" />
      </>
    ),
  stay: (on) =>
    on ? (
      <Cutout id="tv3m-pencil" cut={<path d="M12.9 7.6l3.5 3.5" />}>
        <path d={P.pencil} />
      </Cutout>
    ) : (
      <>
        <path d={P.pencil} />
        <path d="M12.9 7.6l3.5 3.5" />
      </>
    ),
  lock: (on) =>
    on ? (
      <Cutout id="tv3m-lock" cut={<path d="M12 14.2h.01" strokeWidth={2.8} />}>
        <path d={P.lockBody} />
        <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" fill="none" strokeWidth={1.8} />
      </Cutout>
    ) : (
      <>
        <path d={P.lockBody} />
        <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
      </>
    ),
  unlock: (on) =>
    on ? (
      <Cutout id="tv3m-unlock" cut={<path d="M12 14.2h.01" strokeWidth={2.8} />}>
        <path d={P.lockBody} />
        <path d="M8.5 10.5V8a3.5 3.5 0 016.9-1.1" fill="none" strokeWidth={1.8} />
      </Cutout>
    ) : (
      <>
        <path d={P.lockBody} />
        <path d="M8.5 10.5V8a3.5 3.5 0 016.9-1.1" />
      </>
    ),
  eye: (on) =>
    on ? (
      <Cutout id="tv3m-eye" cut={<circle cx="12" cy="12" r="3.1" fill="#000" stroke="none" />}>
        <path d={P.almond} />
      </Cutout>
    ) : (
      <>
        <path d={P.almond} />
        <circle cx="12" cy="12" r="3.1" />
      </>
    ),
  eyeOff: (on) =>
    on ? (
      <>
        <Cutout id="tv3m-eyeoff" cut={
          <>
            <circle cx="12" cy="12" r="3.1" fill="#000" stroke="none" />
            <path d="M4.6 4.6l14.8 14.8" strokeWidth={4.6} />
          </>
        }>
          <path d={P.almond} />
        </Cutout>
        <path d="M4.6 4.6l14.8 14.8" />
      </>
    ) : (
      <>
        <path d={P.almond} />
        <circle cx="12" cy="12" r="3.1" />
        <path d="M4.6 4.6l14.8 14.8" />
      </>
    ),
  trash: () => <path d="M4.5 7h15M9.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2M6.5 7l.9 11.4A2 2 0 009.4 20.2h5.2a2 2 0 002-1.8L17.5 7M10 11v5M14 11v5" />,
  undo: () => <path d="M9 4.5L4.5 9 9 13.5M5 9h9.5a5 5 0 010 10H10" />,
  redo: () => <path d="M15 4.5L19.5 9 15 13.5M19 9H9.5a5 5 0 000 10H14" />,
};
SF_DRAW.measureBtn = SF_DRAW.measure;

/** Back-compat export (path strings of the former 20px design set; the SF set above wins in DrawIcon). */
export const DESIGN_DRAW_PATHS: Record<string, string> = {};

export function DrawIcon({ id, className, size = 20, filled = false }: { id: string; className?: string; size?: number; filled?: boolean }) {
  const def = getToolDef(id);
  const sf = (SF_DRAW as Record<string, SfDraw | undefined>)[id];
  if (def?.glyph && !sf) {
    return (
      <span className={`inline-flex items-center justify-center leading-none ${className ?? ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.72) }} aria-hidden="true">
        {def.glyph}
      </span>
    );
  }
  return (
    <svg
      viewBox={sf ? "0 0 24 24" : "0 0 28 28"}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      // 28-grid drawings get the same rendered line weight as the 24-grid glyphs (1.8 / 24 * 28)
      strokeWidth={sf ? 1.8 : 2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {sf ? sf(filled) : (DRAW_ICONS[id] ?? <circle cx="14" cy="14" r="5" />)}
    </svg>
  );
}

/* ───────────── UI icons (24 grid) ───────────── */

export function ui(children: ReactNode, size = 20, sw = 1.8) {
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

/** One glyph (a single path string). */
const g = (d: string, size = 20, sw = 1.8) => ui(<path d={d} />, size, sw);

/* Glyph paths shared by several places (top toolbar 20px, right-hand buttons 21px, rail 26px) */
export const DESIGN_PATHS = {
  indicators: "M3.5 17L9 11l4 3.5L20 6.5M15.5 6.5H20V11",
  compare: "M3 17l5-5 4 3 8-9M3 7l5 5 4-3 8 8",
  alert: `${P.bell}${P.bellClapper}`,
  templates: `${rr(3.5, 3.5, 7.5, 7.5, 2)}${rr(13, 3.5, 7.5, 7.5, 2)}${rr(3.5, 13, 7.5, 7.5, 2)}${rr(13, 13, 7.5, 7.5, 2)}`,
  replay: "M12 7v5l3.5 2M4 12a8 8 0 108-8M4 4v4h4",
  undo: "M9 4.5L4.5 9 9 13.5M5 9h9.5a5 5 0 010 10H10",
  redo: "M15 4.5L19.5 9 15 13.5M19 9H9.5a5 5 0 000 10H14",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  fullscreen: "M4 9V6.5A2.5 2.5 0 016.5 4H9M20 9V6.5A2.5 2.5 0 0017.5 4H15M4 15v2.5A2.5 2.5 0 006.5 20H9M20 15v2.5a2.5 2.5 0 01-2.5 2.5H15",
  camera: "M4 9a2 2 0 012-2h1.7l1.3-2h6l1.3 2H18a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2zM12 16.2a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2z",
  search: "M16 16l4.5 4.5",
  calendar: `${P.calendar}M4 10h16M8 3v3.5M16 3v3.5`,
  eye: `${P.almond}M12 8.9a3.1 3.1 0 100 6.2 3.1 3.1 0 000-6.2z`,
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  star: P.star,
  watchlist: "M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01",
  info: `${P.circle}M12 7.9h.01M12 11.3v5.2`,
  ideas: `${P.doc}${P.docFold}${P.docLines}`,
  objects: `${P.layerTop}${P.layerBottom}`,
  trash: "M4.5 7h15M9.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2M6.5 7l.9 11.4A2 2 0 009.4 20.2h5.2a2 2 0 002-1.8L17.5 7M10 11v5M14 11v5",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  check: "M5 12.5l4.5 4.5L19 7.5",
} as const;

/** Bell: solid when there is something armed (iOS: filled = on). */
export const bellIcon = (filled: boolean, size = 20) =>
  ui(
    filled ? (
      <>
        <path d={P.bell} fill={CUR} />
        <path d={P.bellClapper} />
      </>
    ) : (
      <>
        <path d={P.bell} />
        <path d={P.bellClapper} />
      </>
    ),
    size
  );

export const UI_ICONS = {
  search: ui(
    <>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d={DESIGN_PATHS.search} />
    </>,
    17,
    2
  ),
  indicators: g(DESIGN_PATHS.indicators),
  alert: bellIcon(false),
  alertOn: bellIcon(true),
  replay: g(DESIGN_PATHS.replay),
  undo: g(DESIGN_PATHS.undo),
  redo: g(DESIGN_PATHS.redo),
  gear: g(DESIGN_PATHS.gear, 21),
  fullscreen: g(DESIGN_PATHS.fullscreen, 21),
  camera: g(DESIGN_PATHS.camera, 21),
  tools: g(P.pencil, 21),
  panel: ui(
    <>
      <path d={rr(3.5, 4.5, 17, 15, 3)} />
      <path d="M15 4.5v15" />
    </>,
    21
  ),
  chevron: (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
};

const candle = (hollowBody: boolean) => (
  <>
    <path d="M7 4v3M7 17v3M17 8v3M17 18v2" />
    <path d={rr(5, 7, 4, 10, 1.2)} fill={hollowBody ? "none" : CUR} />
    <path d={rr(15, 11, 4, 7, 1.2)} fill={hollowBody ? "none" : CUR} />
  </>
);

export const CHART_TYPE_ICONS: Record<string, ReactNode> = {
  candles: ui(candle(false)),
  hollow: ui(candle(true)),
  bars: g("M7 4v16M4 8h3M7 15h3M17 4v16M14 6h3M17 12h3"),
  line: g("M3.5 17l5-5 4 3 8-9"),
  area: ui(
    <>
      <path d="M3.5 17l5-5 4 3 8-9v12.5a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z" fill={CUR} fillOpacity={0.18} />
      <path d="M3.5 17l5-5 4 3 8-9" />
    </>
  ),
  heikin: ui(
    <>
      <path d="M7 4v3M7 17v3M17 8v3M17 18v2" />
      <path d={rr(5, 7, 4, 10, 1.2)} fill={CUR} fillOpacity={0.3} />
      <path d={rr(15, 11, 4, 7, 1.2)} fill={CUR} fillOpacity={0.3} />
    </>
  ),
};

/* right panel tab icons (rail: 26px, stroke 1.8); the active tab shows the filled variant */
const railSvg = (children: ReactNode, size: number, strokeW = 1.8) => ui(children, size, strokeW);

const TAB_OFF: Record<string, () => ReactNode> = {
  watchlist: () => (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.7" cy="6.5" r="1.1" fill={CUR} />
      <circle cx="4.7" cy="12" r="1.1" fill={CUR} />
      <circle cx="4.7" cy="17.5" r="1.1" fill={CUR} />
    </>
  ),
  info: () => (
    <>
      <path d={P.circle} />
      <path d="M12 7.9h.01M12 11.3v5.2" />
    </>
  ),
  ideas: () => (
    <>
      <path d={P.doc} />
      <path d={P.docFold} />
      <path d={P.docLines} />
    </>
  ),
  news: () => (
    <>
      <path d={P.newsBody} />
      <path d={P.newsSide} />
      <path d="M8.5 9h5.5M8.5 12.4h5.5M8.5 15.8h3" />
    </>
  ),
  calendar: () => (
    <>
      <path d={P.calendar} />
      <path d="M4 10h16M8 3v3.5M16 3v3.5" />
    </>
  ),
  objects: () => (
    <>
      <path d={P.layerTop} />
      <path d={P.layerBottom} />
    </>
  ),
  alerts: () => (
    <>
      <path d={P.bell} />
      <path d={P.bellClapper} />
    </>
  ),
  orderbook: () => <path d="M4 5.5h9M4 9h6M4 12.5h11M20 11.5h-9M20 15h-6M20 18.5h-11" />,
  algo: () => (
    <>
      <path d={P.triangle} />
      <path d="M12 9.8v3.6M12 16.1h.01" />
    </>
  ),
};

const TAB_ON: Record<string, () => ReactNode> = {
  watchlist: () => (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" strokeWidth={2.4} />
      <circle cx="4.7" cy="6.5" r="1.5" fill={CUR} />
      <circle cx="4.7" cy="12" r="1.5" fill={CUR} />
      <circle cx="4.7" cy="17.5" r="1.5" fill={CUR} />
    </>
  ),
  info: () => (
    <Cutout id="tv3m-info" cut={<path d="M12 7.9h.01M12 11.3v5.2" strokeWidth={2} />}>
      <path d={P.circle} />
    </Cutout>
  ),
  ideas: () => (
    <Cutout id="tv3m-doc" cut={<><path d={P.docFold} /><path d={P.docLines} /></>}>
      <path d={P.doc} />
    </Cutout>
  ),
  news: () => (
    <Cutout id="tv3m-news" cut={<path d="M8.5 9h5.5M8.5 12.4h5.5M8.5 15.8h3" />}>
      <path d={P.newsBody} />
      <path d={P.newsSide} fill="none" strokeWidth={1.8} />
    </Cutout>
  ),
  calendar: () => (
    <>
      <Cutout id="tv3m-cal" cut={<path d="M4 10h16" strokeWidth={1.6} />}>
        <path d={P.calendar} />
      </Cutout>
      <path d="M8 3v3.5M16 3v3.5" />
    </>
  ),
  objects: () => (
    <>
      <path d={P.layerTop} fill={CUR} />
      <path d={P.layerBottom} strokeWidth={2.2} />
    </>
  ),
  alerts: () => (
    <>
      <path d={P.bell} fill={CUR} />
      <path d={P.bellClapper} />
    </>
  ),
  orderbook: () => <path d="M4 5.5h9M4 9h6M4 12.5h11M20 11.5h-9M20 15h-6M20 18.5h-11" strokeWidth={2.4} />,
  algo: () => (
    <Cutout id="tv3m-algo" cut={<path d="M12 9.8v3.6M12 16.1h.01" strokeWidth={2} />}>
      <path d={P.triangle} />
    </Cutout>
  ),
};

/** Rail / mobile tab-bar icon of a panel tab; `on` = filled variant. */
export function panelTabIcon(id: string, on: boolean, size = 26): ReactNode {
  const f = (on ? TAB_ON[id] : TAB_OFF[id]) ?? TAB_OFF[id];
  return f ? railSvg(f(), size) : null;
}

export const PANEL_TAB_ICONS: Record<string, ReactNode> = Object.fromEntries(Object.keys(TAB_OFF).map((k) => [k, panelTabIcon(k, false, 26)]));

/* ───────────── indicator UI icons (legend, catalog, settings) ───────────── */

const indIcon = (body: ReactNode, filled = false) =>
  function IndIcon(size = 18) {
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
      <circle cx="10.8" cy="10.8" r="6.6" />
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
