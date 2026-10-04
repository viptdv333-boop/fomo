import type { ReactNode } from "react";
import { DESIGN_PATHS, rr, ui } from "./icons";

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
  compare: ui(<path d={DESIGN_PATHS.compare} />, 20, 1.8),
  layout: ui(
    <>
      <path d={rr(3.5, 4.5, 17, 15, 3) + "M12 4.5v15M3.5 12H12"} />
    </>,
    20,
    1.8
  ),
  template: ui(<path d={DESIGN_PATHS.templates} />, 20, 1.8),
  star: ui(<path d={DESIGN_PATHS.star} />, 18, 1.8),
  starFilled: ui(<path d={DESIGN_PATHS.star} fill="currentColor" />, 18, 1.8),
  calendar: ui(<path d={DESIGN_PATHS.calendar} />, 16, 2),
  clock: ui(<path d="M12 5a8 8 0 100 16 8 8 0 000-16zM12 9v4l2 2M9 3h6" />, 17, 2),
  eye: ui(<path d={DESIGN_PATHS.eye} />, 16, 2),
  eyeOff: ui(<path d={DESIGN_PATHS.eye + "M4.6 4.6l14.8 14.8"} />, 16, 2),
  close: ui(<path d={DESIGN_PATHS.close} />, 18, 1.8),
  copy: ui(
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6.5A2 2 0 0013.5 4.5h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
    </>,
    20
  ),
  download: ui(<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />, 20),
  keyboard: ui(
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="3" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10" />
    </>,
    20
  ),
  zoomIn: ui(<path d="M12 5v14M5 12h14" />, 21, 2),
  zoomOut: ui(<path d="M5 12h14" />, 21, 2),
  toLatest: ui(<path d="M6 6l6 6-6 6M13 6l6 6-6 6" />, 21, 1.9),
  resetView: ui(<path d={DESIGN_PATHS.refresh} />, 21, 1.8),
  trash: ui(<path d={DESIGN_PATHS.trash} />, 18, 1.8),
  check: ui(<path d={DESIGN_PATHS.check} />, 18, 2.4),
};
