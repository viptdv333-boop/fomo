import type { ReactNode } from "react";
import { ui } from "./icons";

/* Icons of the chart settings / chart types / layouts (kept apart from icons.tsx to avoid edit clashes). */

const Dot = ({ x, y, r = 1.6 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;

export const CHART_TYPE_ICONS_EXTRA: Record<string, ReactNode> = {
  columns: ui(
    <>
      <rect x="3.6" y="11" width="3.4" height="9" rx=".5" fill="currentColor" stroke="none" />
      <rect x="8.4" y="7" width="3.4" height="13" rx=".5" fill="currentColor" stroke="none" />
      <rect x="13.2" y="13" width="3.4" height="7" rx=".5" fill="currentColor" stroke="none" />
      <rect x="18" y="5" width="3.4" height="15" rx=".5" fill="currentColor" stroke="none" />
    </>
  ),
  highlow: ui(
    <>
      <rect x="4" y="6" width="3.6" height="11" rx=".6" fill="currentColor" stroke="none" />
      <rect x="10.2" y="4" width="3.6" height="9" rx=".6" fill="currentColor" stroke="none" />
      <rect x="16.4" y="9" width="3.6" height="11" rx=".6" fill="currentColor" stroke="none" />
    </>
  ),
  linemarkers: ui(
    <>
      <path d="M4 17l5-6 4 3 4-7 3.5 3" />
      <circle cx="4" cy="17" r="1.7" fill="currentColor" />
      <circle cx="9" cy="11" r="1.7" fill="currentColor" />
      <circle cx="13" cy="14" r="1.7" fill="currentColor" />
      <circle cx="17" cy="7" r="1.7" fill="currentColor" />
      <circle cx="20.5" cy="10" r="1.7" fill="currentColor" />
    </>
  ),
  step: ui(<path d="M3 16h4v-6h4v5h4V6h5" />),
  baseline: ui(
    <>
      <path d="M3 12h18" strokeDasharray="2 2.5" opacity={0.6} />
      <path d="M3 9l4-4 4 4 3 5 3-3 4 4" />
      <path d="M3 9l4-4 4 4 1.4 2.3L3 12z" fill="currentColor" fillOpacity={0.25} stroke="none" />
    </>
  ),
  volcandles: ui(
    <>
      <path d="M5 3v3M5 17v4M12 4v3M12 14v5M19 6v2M19 15v3" />
      <rect x="3.6" y="6" width="2.8" height="11" rx=".5" fill="currentColor" />
      <rect x="9.2" y="7" width="5.6" height="7" rx=".5" fill="currentColor" />
      <rect x="17.2" y="8" width="3.6" height="7" rx=".5" fill="currentColor" />
    </>
  ),
  renko: ui(
    <>
      <rect x="3.5" y="14" width="5" height="5" rx=".5" fill="currentColor" stroke="none" />
      <rect x="8.5" y="9" width="5" height="5" rx=".5" fill="currentColor" stroke="none" />
      <rect x="13.5" y="4.5" width="5" height="5" rx=".5" fill="currentColor" stroke="none" />
      <rect x="16" y="9.5" width="5" height="5" rx=".5" fill="none" />
    </>
  ),
  kagi: ui(<path d="M4 18V9h4V17h4V5h4v10h4V8" />),
  linebreak: ui(
    <>
      <rect x="3.5" y="14" width="3.6" height="5" rx=".4" fill="currentColor" stroke="none" />
      <rect x="8" y="10" width="3.6" height="8" rx=".4" fill="currentColor" stroke="none" />
      <rect x="12.5" y="5" width="3.6" height="9" rx=".4" fill="currentColor" stroke="none" />
      <rect x="17" y="8" width="3.6" height="12" rx=".4" fill="none" />
    </>
  ),
  range: ui(
    <>
      <path d="M6 4v3M6 15v3M12 2v4M12 14v3M18 6v2M18 16v3" />
      <rect x="4.4" y="7" width="3.2" height="8" rx=".5" fill="currentColor" />
      <rect x="10.4" y="6" width="3.2" height="8" rx=".5" fill="currentColor" />
      <rect x="16.4" y="8" width="3.2" height="8" rx=".5" fill="currentColor" />
    </>
  ),
  pnf: ui(
    <>
      <path d="M4 5l4 4M8 5L4 9M4 12l4 4M8 12l-4 4" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="15" cy="13" r="2.2" />
      <path d="M13 17.5l4 4M17 17.5l-4 4" />
    </>
  ),
  footprint: ui(
    <>
      <rect x="3" y="4" width="8" height="16" rx="1" />
      <rect x="13" y="7" width="8" height="13" rx="1" />
      <path d="M7 4v16M17 7v13M3 9h8M3 14h8M13 11h8M13 16h8" opacity={0.75} />
      <rect x="7" y="9" width="4" height="5" fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect x="13" y="11" width="4" height="5" fill="currentColor" fillOpacity={0.35} stroke="none" />
    </>
  ),
};

export const CS_ICONS = {
  compare: ui(
    <>
      <path d="M3 17l5-5 4 3 5-8 4 4" />
      <path d="M3 8l5 3 4-5 5 7 4-2" opacity={0.55} />
      <Dot x={12} y={15} />
    </>
  ),
  layout: ui(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M12 4.5v15M3.5 12H12" />
    </>
  ),
  template: ui(
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  star: ui(<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" />, 16, 1.6),
  starFilled: ui(<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" fill="currentColor" />, 16, 1.6),
  calendar: ui(
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
    </>
  ),
  clock: ui(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  eye: ui(
    <>
      <path d="M2.8 12S6 6 12 6s9.2 6 9.2 6-3.2 6-9.2 6S2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  eyeOff: ui(
    <>
      <path d="M4 5l16 14" />
      <path d="M9.8 6.3A9.6 9.6 0 0112 6c6 0 9.2 6 9.2 6a15 15 0 01-3.4 4M6.3 8A15 15 0 002.8 12S6 18 12 18a9 9 0 003.4-.7" />
    </>
  ),
  close: ui(<path d="M6 6l12 12M18 6L6 18" />, 16, 1.8),
  copy: ui(
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6A1.5 1.5 0 0014 4.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h2.5" />
    </>
  ),
  download: ui(<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />),
  keyboard: ui(
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10" />
    </>
  ),
  zoomIn: ui(<path d="M12 5v14M5 12h14" />, 18, 2),
  zoomOut: ui(<path d="M5 12h14" />, 18, 2),
  toLatest: ui(<path d="M6 6l6 6-6 6M13 6l6 6-6 6" />, 18, 1.9),
  resetView: ui(
    <>
      <path d="M4.5 12a7.5 7.5 0 107.5-7.5" />
      <path d="M4.5 4.5V9H9" />
    </>,
    18,
    1.8
  ),
  trash: ui(<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 12.5h8L17 7" />, 16, 1.6),
  check: ui(<path d="M5 12.5l4.5 4.5L19 7.5" />, 16, 2),
};
