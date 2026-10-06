import type { ReactElement } from "react";

// Line icons of the app design (24-grid, round caps). A shape is a path string, ["c", cx, cy, r] or ["r", x, y, w, h, rx].
type Shape = string | readonly ["c", number, number, number] | readonly ["r", number, number, number, number, number?];

export const APP_ICONS = {
  board: [["r", 3, 3, 7, 9, 1.5], ["r", 14, 3, 7, 5, 1.5], ["r", 14, 12, 7, 9, 1.5], ["r", 3, 16, 7, 5, 1.5]],
  terminal: ["M3 3v18h18", ["r", 7, 8, 4, 7, 1], "M9 5v3", "M9 15v3", ["r", 15, 5, 4, 7, 1], "M17 2v3", "M17 12v4"],
  chat: ["M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z", "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"],
  cal: [["r", 3, 4, 18, 18, 2], "M16 2v4", "M8 2v4", "M3 10h18"],
  channels: ["m3 11 18-5v12L3 14v-3z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"],
  user: [["c", 12, 8, 5], "M20 21a8 8 0 0 0-16 0"],
  sun: [["c", 12, 12, 4], "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  plus: ["M5 12h14", "M12 5v14"],
  chevR: ["m9 18 6-6-6-6"],
  inst: ["M3 3v18h18", "m19 9-5 5-4-4-3 3"],
  help: [["c", 12, 12, 10], "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
  lock: [["r", 3, 11, 18, 11, 2], "M7 11V7a5 5 0 0 1 10 0v4"],
  sliders: ["M21 4h-7", "M10 4H3", "M21 12h-9", "M8 12H3", "M21 20h-5", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  card: ["M3 6h18v12H3z", "M3 10h18"],
  wallet: ["M12 2v20", "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
  refresh: ["M3 12a9 9 0 0 1 15-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15 6.7L3 16", "M3 21v-5h5"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
} as const satisfies Record<string, readonly Shape[]>;

export type AppIconName = keyof typeof APP_ICONS;

export default function AppIcon({ name, size = 24, stroke = 1.7, className }: { name: AppIconName; size?: number; stroke?: number; className?: string }): ReactElement {
  const shapes = APP_ICONS[name] as readonly Shape[];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {shapes.map((s, i) =>
        typeof s === "string" ? (
          <path key={i} d={s} />
        ) : s[0] === "c" ? (
          <circle key={i} cx={s[1]} cy={s[2]} r={s[3]} />
        ) : (
          <rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5] ?? 0} />
        ),
      )}
    </svg>
  );
}
