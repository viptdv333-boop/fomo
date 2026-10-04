import type { ReactNode } from "react";
import { ui } from "./icons";

/* Icons of the economic calendar (kept apart from icons.tsx to avoid edit clashes; same 24 grid / 1.7 stroke). */

const Dot = ({ x, y, r = 1.3 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;

export const EC_ICONS: Record<string, ReactNode> = {
  expand: ui(
    <>
      <path d="M14 4h6v6M10 20H4v-6" />
      <path d="M20 4l-7 7M4 20l7-7" />
    </>
  ),
  close: ui(<path d="M6 6l12 12M18 6L6 18" />),
  refresh: ui(
    <>
      <path d="M20 11a8 8 0 00-14.3-4.2L4 9" />
      <path d="M4 4v5h5" />
      <path d="M4 13a8 8 0 0014.3 4.2L20 15" />
      <path d="M20 20v-5h-5" />
    </>
  ),
  bell: ui(
    <>
      <path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 004 0" />
    </>
  ),
  bellOn: ui(
    <>
      <path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 2h-15z" fill="currentColor" />
      <path d="M10 20.5a2 2 0 004 0" />
    </>
  ),
  /** events pinned on the chart time axis */
  onChart: ui(
    <>
      <path d="M3.5 4v16.5h17" />
      <path d="M6.5 15l4-4.5 3 2.5 5-6" />
      <path d="M17.5 3.5v5" />
      <path d="M17.5 3.5h3l-1 1.4 1 1.4h-3" fill="currentColor" />
    </>
  ),
  filter: ui(<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />),
  chevron: ui(<path d="M7 10l5 5 5-5" />, 16),
  check: ui(<path d="M5 12.5l4.5 4.5L19 7.5" />, 16),
  search: ui(
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
    </>,
    16
  ),
  clock: ui(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
    16
  ),
  calendarRange: ui(
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
      <path d="M8 14.5h8" />
      <Dot x={8} y={14.5} />
      <Dot x={16} y={14.5} />
    </>,
    16
  ),
};
