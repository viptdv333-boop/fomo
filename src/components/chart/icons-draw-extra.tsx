import type { ReactNode } from "react";

/*
 * Line icons for the extended drawing tools (28 grid, stroke 1.6, round caps, currentColor).
 * Merged into DRAW_ICONS by icons.tsx. Anchors are small filled dots, secondary strokes are dimmed guides.
 */

const Dot = ({ x, y, r = 1.9 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;
const Guide = { strokeDasharray: "2 3", opacity: 0.7 } as const;
const Dim = { opacity: 0.5 } as const;

export const EXTRA_DRAW_ICONS: Record<string, ReactNode> = {
  /* lines */
  trend_angle: (
    <>
      <path d="M5 22L22 8" />
      <path d="M5 22h19" {...Guide} />
      <path d="M12 22a7 7 0 00-1.7-4.6" />
      <Dot x={5} y={22} />
      <Dot x={22} y={8} />
    </>
  ),
  disjoint_channel: (
    <>
      <path d="M4 11l11-6M13 23l11-6" />
      <path d="M4 11l9 12M15 5l9 12" {...Guide} />
      <Dot x={4} y={11} />
      <Dot x={15} y={5} />
      <Dot x={13} y={23} />
    </>
  ),
  flat_top_bottom: (
    <>
      <path d="M4 6.5h20M4 22L20 12" />
      <path d="M4 6.5V22M20 6.5V12" {...Guide} />
      <Dot x={4} y={22} />
      <Dot x={20} y={12} />
      <Dot x={4} y={6.5} />
    </>
  ),
  regression: (
    <>
      <path d="M4 12L24 3M4 25l20-9" />
      <path d="M4 18.5L24 9.5" {...Guide} />
      <Dot x={4} y={18.5} />
      <Dot x={24} y={9.5} />
    </>
  ),
  schiff: (
    <>
      <path d="M9 18L24 5M4 10L14 3M14 25l10-9" />
      <path d="M4 26l5-8M4 10l10 15" {...Guide} />
      <Dot x={4} y={26} />
      <Dot x={4} y={10} />
      <Dot x={14} y={25} />
    </>
  ),
  mschiff: (
    <>
      <path d="M10 16L24 6M4 9l11-6M13 25l11-8" />
      <path d="M4 25l6-9M4 9l9 16" {...Guide} />
      <Dot x={4} y={25} />
      <Dot x={4} y={9} />
      <Dot x={13} y={25} />
      <Dot x={10} y={16} r={1.2} />
    </>
  ),
  inside_fork: (
    <>
      <path d="M5 23L24 4M4 12L12 4M16 24l8-8" />
      <path d="M4.5 17.5L18 4M10.5 23.5L24 10" {...Guide} />
      <Dot x={5} y={23} />
      <Dot x={4} y={12} />
      <Dot x={16} y={24} />
    </>
  ),
  pitchfan: (
    <>
      <path d="M4 24L24 4M4 24L24 11M4 24L24 18M4 24L14 4" />
      <path d="M24 4v14" {...Guide} />
      <Dot x={4} y={24} />
      <Dot x={24} y={4} />
      <Dot x={24} y={18} />
    </>
  ),

  /* fib & gann */
  fib_time: (
    <>
      <path d="M5 4v20M9 4v20M13 4v20M20 4v20" />
      <path d="M5 14h4" {...Guide} />
      <Dot x={5} y={14} />
      <Dot x={9} y={14} />
    </>
  ),
  fib_trend_time: (
    <>
      <path d="M16 4v20M20 4v20M25 4v20" />
      <path d="M3 22l4-10 4 7" {...Guide} />
      <Dot x={3} y={22} />
      <Dot x={7} y={12} />
      <Dot x={11} y={19} />
    </>
  ),
  fib_circles: (
    <>
      <circle cx="14" cy="14" r="10.5" />
      <circle cx="14" cy="14" r="6.5" />
      <circle cx="14" cy="14" r="2.6" {...Dim} />
      <Dot x={14} y={14} r={1.4} />
    </>
  ),
  fib_speed_fan: (
    <>
      <path d="M4 24L24 5M4 24L24 11M4 24L24 17M4 24L18 5M4 24L11 5" />
      <path d="M4 5h20v19" {...Guide} />
      <Dot x={4} y={24} />
      <Dot x={24} y={5} />
    </>
  ),
  fib_arcs: (
    <>
      <path d="M23 15a8 8 0 00-8 8M23 10a13 13 0 00-13 13M23 5a18 18 0 00-18 18" />
      <path d="M5 23L23 5" {...Guide} />
      <Dot x={23} y={23} />
      <Dot x={5} y={23} />
    </>
  ),
  fib_spiral: (
    <>
      <path d="M14 14c0-1.5 1.5-2 2.5-1.3 1.6 1 1.5 3.6-.4 4.7-2.6 1.4-5.6-.4-5.8-3.4-.2-3.6 3-6 6.5-5.2 4.3 1 6.3 5.6 4.5 9.6" />
      <Dot x={14} y={14} r={1.5} />
      <Dot x={22.8} y={19.6} />
    </>
  ),
  fib_wedge: (
    <>
      <path d="M4 22L24 6M4 22L24 21" />
      <path d="M11.8 15.8A10 10 0 0114 21.5M17.3 11.4A17 17 0 0121 21.2" />
      <Dot x={4} y={22} />
      <Dot x={24} y={6} />
      <Dot x={24} y={21} />
    </>
  ),
  gann_box: (
    <>
      <rect x="4" y="5" width="20" height="18" rx="1" />
      <path d="M4 5l20 18M24 5L4 23" />
      <path d="M4 14h20M14 5v18" {...Guide} />
      <Dot x={4} y={5} />
      <Dot x={24} y={23} />
    </>
  ),
  gann_square_fixed: (
    <>
      <rect x="5" y="5" width="18" height="18" rx="1" />
      <path d="M5 11h18M5 17h18M11 5v18M17 5v18" {...Dim} />
      <path d="M5 5l18 18" />
      <Dot x={5} y={5} />
    </>
  ),
  gann_square: (
    <>
      <rect x="4" y="6" width="20" height="16" rx="1" />
      <path d="M14 6l10 8-10 8-10-8z" {...Dim} />
      <path d="M4 6l20 16M24 6L4 22" />
      <Dot x={4} y={6} />
      <Dot x={24} y={22} />
    </>
  ),
  gann_fan: (
    <>
      <path d="M4 24L24 4M4 24L24 10M4 24L24 16M4 24L10 4M4 24L16 4" />
      <Dot x={4} y={24} />
      <Dot x={24} y={4} />
    </>
  ),

  /* patterns */
  xabcd: (
    <>
      <path d="M3 21L8 6l6 11 4-8 7 13" />
      <path d="M3 21l11-4M8 6l10 3M14 17l11 5" {...Guide} />
      <Dot x={3} y={21} r={1.5} />
      <Dot x={8} y={6} r={1.5} />
      <Dot x={14} y={17} r={1.5} />
      <Dot x={18} y={9} r={1.5} />
      <Dot x={25} y={22} r={1.5} />
    </>
  ),
  cypher: (
    <>
      <path d="M4 22L9 7l6 9 6-12 4 13" />
      <path d="M4 22l11-6M4 22L21 4" {...Guide} />
      <Dot x={4} y={22} r={1.5} />
      <Dot x={9} y={7} r={1.5} />
      <Dot x={15} y={16} r={1.5} />
      <Dot x={21} y={4} r={1.5} />
      <Dot x={25} y={17} r={1.5} />
    </>
  ),
  head_shoulders: (
    <>
      <path d="M3 21L7.5 12 10 18l4-13 4 13 2.5-6L25 21" />
      <path d="M4 18h21" {...Guide} />
    </>
  ),
  abcd: (
    <>
      <path d="M4 22L10 8l6 12 8-13" />
      <path d="M4 22l12-2M10 8l14-1" {...Guide} />
      <Dot x={4} y={22} r={1.5} />
      <Dot x={10} y={8} r={1.5} />
      <Dot x={16} y={20} r={1.5} />
      <Dot x={24} y={7} r={1.5} />
    </>
  ),
  triangle_pattern: (
    <>
      <path d="M4 6L9 21l6-11 4 7" />
      <path d="M4 6l20 8M9 21l15-7" {...Guide} />
      <Dot x={4} y={6} r={1.5} />
      <Dot x={9} y={21} r={1.5} />
      <Dot x={15} y={10} r={1.5} />
      <Dot x={19} y={17} r={1.5} />
    </>
  ),
  three_drives: (
    <>
      <path d="M3 23l4-8 2 3 4-8 2 3 4-8 3 4" />
      <path d="M7 15l6-7 6-5" {...Guide} />
    </>
  ),
  elliott_impulse: (
    <>
      <path d="M3 23l5-11 3 6 7-14 3 7 4-7" />
      <Dot x={8} y={12} r={1.3} />
      <Dot x={18} y={4} r={1.3} />
      <Dot x={25} y={4} r={1.3} />
    </>
  ),
  elliott_correction: (
    <>
      <path d="M3 5l7 15 6-8 9 12" />
      <Dot x={10} y={20} r={1.3} />
      <Dot x={25} y={24} r={1.3} />
    </>
  ),
  elliott_triangle: (
    <>
      <path d="M3 14l5-9 4 18 4-14 3 10 3-6 4 3" />
      <path d="M8 5l14 7M12 23l10-11" {...Guide} />
    </>
  ),
  elliott_double: (
    <>
      <path d="M3 22L8 8l4 6 4-10 4 9 4-5" />
      <Dot x={25} y={8} r={1.3} />
    </>
  ),
  elliott_triple: (
    <>
      <path d="M2 22L6 10l3 6 3-8 3 8 3-6 3 8 3-4" />
      <Dot x={26} y={20} r={1.3} />
    </>
  ),

  /* cycles */
  cyclic_lines: (
    <>
      <path d="M6 4v20M12 4v20M18 4v20M24 4v20" />
      <path d="M6 14h6" {...Guide} />
      <Dot x={6} y={14} />
      <Dot x={12} y={14} />
    </>
  ),
  time_cycles: (
    <>
      <path d="M3 21a5.5 9 0 0111 0M14 21a5.5 9 0 0111 0" />
      <path d="M3 21h22" {...Guide} />
      <Dot x={3} y={21} />
      <Dot x={14} y={21} />
    </>
  ),
  sine_line: (
    <>
      <path d="M3 14c2.5-11 5.5-11 8 0s5.5 11 8 0 4-8 6-4" />
      <Dot x={3} y={14} r={1.6} />
      <Dot x={11} y={14} r={1.6} />
    </>
  ),

  /* forecast & volume */
  forecast: (
    <>
      <path d="M4 22L18 10" />
      <path d="M14.5 9.4L19 9.6l-1 4.4" />
      <rect x="18" y="4" width="8" height="9" rx="1" {...Dim} />
      <Dot x={4} y={22} />
    </>
  ),
  bars_pattern: (
    <>
      <path d="M5 8v14M9 5v12M13 10v12" />
      <rect x="3.6" y="11" width="2.8" height="7" fill="currentColor" stroke="none" />
      <rect x="7.6" y="7" width="2.8" height="7" fill="currentColor" stroke="none" />
      <path d="M17 4v10M21 9v12M25 6v11" {...Dim} />
      <rect x="15.6" y="6" width="2.8" height="6" fill="currentColor" stroke="none" opacity={0.5} />
      <rect x="19.6" y="11" width="2.8" height="7" fill="currentColor" stroke="none" opacity={0.5} />
    </>
  ),
  ghost_feed: (
    <>
      <path d="M5 8v14M9 5v12" />
      <rect x="3.6" y="11" width="2.8" height="7" fill="currentColor" stroke="none" />
      <path d="M14 10v11M18 6v10M22 9v13M26 4v9" {...Guide} />
      <rect x="12.6" y="12" width="2.8" height="6" strokeDasharray="1.5 2" />
      <rect x="20.6" y="12" width="2.8" height="6" strokeDasharray="1.5 2" />
    </>
  ),
  projection: (
    <>
      <path d="M4 22L9 10M14 22l6-12" />
      <path d="M9 10l5 12M4 22h10" {...Guide} />
      <path d="M17.5 10.5L20.5 9.5 21.5 12.5" />
      <Dot x={4} y={22} />
      <Dot x={9} y={10} />
      <Dot x={14} y={22} />
    </>
  ),
  anchored_vwap: (
    <>
      <path d="M4 20c4-2 6 0 9-3s5-6 11-8" />
      <path d="M4 5v19" {...Guide} />
      <Dot x={4} y={20} />
    </>
  ),
  fixed_volume_profile: (
    <>
      <path d="M6 5h8M6 9.5h13M6 14h9M6 18.5h16M6 23h6" />
      <path d="M4 3v22M25 3v22" {...Guide} />
    </>
  ),
  anchored_volume_profile: (
    <>
      <path d="M8 5h7M8 9.5h12M8 14h8M8 18.5h15M8 23h5" />
      <path d="M6 3v22" {...Guide} />
      <Dot x={6} y={14} />
    </>
  ),

  /* shapes */
  rotated_rect: (
    <>
      <path d="M4 15L15 4l9 9-11 11z" />
      <Dot x={4} y={15} r={1.8} />
      <Dot x={15} y={4} r={1.8} />
      <Dot x={18.5} y={18.5} r={1.8} />
    </>
  ),
  circle: (
    <>
      <circle cx="14" cy="14" r="9.5" />
      <Dot x={14} y={14} r={1.8} />
      <Dot x={23.5} y={14} r={1.8} />
    </>
  ),
  path: (
    <>
      <path d="M4 22l7-12 6 8 5-9" />
      <path d="M25 6l-6 1 4 4z" fill="currentColor" />
      <Dot x={4} y={22} r={1.6} />
      <Dot x={11} y={10} r={1.6} />
      <Dot x={17} y={18} r={1.6} />
    </>
  ),
  polyline: (
    <>
      <path d="M5 19L9 7l9 3 6 9-8 4z" />
      <Dot x={5} y={19} r={1.6} />
      <Dot x={9} y={7} r={1.6} />
      <Dot x={18} y={10} r={1.6} />
      <Dot x={24} y={19} r={1.6} />
      <Dot x={16} y={23} r={1.6} />
    </>
  ),
  arc: (
    <>
      <path d="M4 20C6 6 22 6 24 20" />
      <path d="M4 20h20" {...Guide} />
      <Dot x={4} y={20} r={1.8} />
      <Dot x={24} y={20} r={1.8} />
      <Dot x={14} y={9} r={1.8} />
    </>
  ),
  curve: (
    <>
      <path d="M4 22Q14 2 24 14" />
      <Dot x={4} y={22} r={1.8} />
      <Dot x={24} y={14} r={1.8} />
    </>
  ),
  double_curve: (
    <>
      <path d="M4 21C14 21 14 7 24 7" />
      <Dot x={4} y={21} r={1.8} />
      <Dot x={24} y={7} r={1.8} />
    </>
  ),
  highlighter: (
    <>
      <path d="M17 4.5l6.5 6.5-8.5 8.5-6.5-6.5z" />
      <path d="M8.5 13L6 18.5l3.5 1.5" />
      <path d="M5 24.5h13" strokeWidth={3.4} opacity={0.4} />
    </>
  ),
  arrow_marker: (
    <g transform="rotate(-40 14 14)">
      <path d="M3 11.5h11V7l11 7-11 7v-4.5H3z" />
    </g>
  ),
  arrow_up: <path d="M14 4l9 10h-5.5v10h-7V14H5z" />,
  arrow_down: <path d="M14 24L5 14h5.5V4h7v10H23z" />,

  /* annotation */
  anchored_text: (
    <>
      <rect x="5" y="6" width="19" height="15" rx="2" />
      <path d="M10 11h9M14.5 11v6.5" />
      <Dot x={5} y={13.5} r={1.7} />
    </>
  ),
  price_note: (
    <>
      <rect x="12" y="4.5" width="13" height="9" rx="2" />
      <path d="M15 9h7" />
      <path d="M12 9L5 21" />
      <path d="M2.5 21h5" {...Guide} />
      <Dot x={5} y={21} />
    </>
  ),
  pin: (
    <>
      <path d="M14 25C8.5 18 6 14.8 6 10.5a8 8 0 0116 0c0 4.3-2.5 7.5-8 14.5z" />
      <circle cx="14" cy="10.5" r="2.8" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="6" width="20" height="16" rx="2" />
      <path d="M4 12h20M4 17h20M14 6v16" />
    </>
  ),
  callout: (
    <>
      <rect x="10" y="4.5" width="15" height="11" rx="2" />
      <path d="M13.5 8.5h8M13.5 11.5h5" />
      <path d="M11.5 15.5L5.5 22" />
      <Dot x={5} y={22.5} r={1.8} />
    </>
  ),
  comment: (
    <>
      <path d="M5 7a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2h-9l-5.5 5v-5H7a2 2 0 01-2-2z" />
      <path d="M10 11.5h.01M14 11.5h.01M18 11.5h.01" strokeWidth={2.6} />
    </>
  ),
  signpost: (
    <>
      <path d="M8 3.5v21" />
      <path d="M8 6.5h12.5L24 10.5l-3.5 4H8" />
      <path d="M11.5 10.5h6" {...Dim} />
      <Dot x={8} y={24.5} r={1.7} />
    </>
  ),
};
