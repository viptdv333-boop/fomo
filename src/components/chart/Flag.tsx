"use client";

import { memo, type ReactNode } from "react";

/* Small inline-SVG flags (emoji flags do not render on Windows). Simplified artwork on a 30x20 grid; unknown codes get a
   neutral badge with the letters, an empty code is a globe. */

const W = 30;
const H = 20;
const R = (x: number, y: number, w: number, h: number, fill: string, key?: string) => <rect key={key ?? `${x}${y}${fill}`} x={x} y={y} width={w} height={h} fill={fill} />;
const hStripes = (cols: string[], ratios?: number[]) => {
  const rs = ratios ?? cols.map(() => 1);
  const total = rs.reduce((a, b) => a + b, 0);
  let y = 0;
  return cols.map((c, i) => {
    const h = (H * rs[i]) / total;
    const el = R(0, y, W, h + 0.2, c, `h${i}`);
    y += h;
    return el;
  });
};
const vStripes = (cols: string[], ratios?: number[]) => {
  const rs = ratios ?? cols.map(() => 1);
  const total = rs.reduce((a, b) => a + b, 0);
  let x = 0;
  return cols.map((c, i) => {
    const w = (W * rs[i]) / total;
    const el = R(x, 0, w + 0.2, H, c, `v${i}`);
    x += w;
    return el;
  });
};
const star = (cx: number, cy: number, r: number, fill: string, key?: string) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return <polygon key={key ?? `s${cx}${cy}`} points={pts.join(" ")} fill={fill} />;
};
const cross = (x: number, w: number, fill: string, key: string) => (
  <g key={key} fill={fill}>
    <rect x={x - w / 2} y={0} width={w} height={H} />
    <rect x={0} y={H / 2 - w / 2} width={W} height={w} />
  </g>
);

const RED = "#d52b1e";
const BLUE = "#0a3d91";
const WHITE = "#ffffff";
const YEL = "#fcd116";
const GRN = "#009a49";

const usStripes = Array.from({ length: 7 }, (_, i) => R(0, (H / 7) * i * 1, W, H / 7 + 0.1, i % 2 === 0 ? "#b22234" : WHITE, `us${i}`));

const euDots = Array.from({ length: 12 }, (_, i) => {
  const a = (Math.PI / 6) * i;
  return <circle key={`eu${i}`} cx={15 + 6.2 * Math.cos(a)} cy={10 + 6.2 * Math.sin(a)} r={1} fill={YEL} />;
});

const FLAGS: Record<string, ReactNode> = {
  US: (
    <>
      {usStripes}
      {R(0, 0, 13, (H / 7) * 4, "#3c3b6e")}
      {[2, 5, 8, 11].flatMap((x) => [2.5, 6.5, 10].map((y) => <circle key={`d${x}${y}`} cx={x} cy={y * 0.85 + 0.6} r={0.7} fill={WHITE} />))}
    </>
  ),
  EU: (
    <>
      {R(0, 0, W, H, "#003399")}
      {euDots}
    </>
  ),
  GB: (
    <>
      {R(0, 0, W, H, "#012169")}
      <path d="M0 0L30 20M30 0L0 20" stroke={WHITE} strokeWidth={4} />
      <path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" strokeWidth={1.6} />
      {cross(15, 6.4, WHITE, "gbw")}
      {cross(15, 3.6, "#c8102e", "gbr")}
    </>
  ),
  DE: hStripes(["#000000", "#dd0000", "#ffce00"]),
  FR: vStripes(["#0055a4", WHITE, "#ef4135"]),
  IT: vStripes(["#009246", WHITE, "#ce2b37"]),
  ES: hStripes(["#aa151b", "#f1bf00", "#aa151b"], [1, 2, 1]),
  JP: (
    <>
      {R(0, 0, W, H, WHITE)}
      <circle cx={15} cy={10} r={6} fill="#bc002d" />
    </>
  ),
  CN: (
    <>
      {R(0, 0, W, H, "#de2910")}
      {star(6.5, 6, 3.6, YEL)}
      {star(12.5, 2.6, 1.1, YEL, "c2")}
      {star(14.6, 5, 1.1, YEL, "c3")}
      {star(14.6, 8, 1.1, YEL, "c4")}
      {star(12.5, 10.4, 1.1, YEL, "c5")}
    </>
  ),
  RU: hStripes([WHITE, "#0039a6", "#d52b1e"]),
  CA: (
    <>
      {vStripes(["#d52b1e", WHITE, "#d52b1e"], [1, 2, 1])}
      <path d="M15 4l1.6 3.2 2.2-.9-.8 4.2 2.2-1-.6 2.2 1.2.8-4 .7-.2 2.3h-3.2l-.2-2.3-4-.7 1.2-.8-.6-2.2 2.2 1-.8-4.2 2.2.9z" fill="#d52b1e" />
    </>
  ),
  AU: (
    <>
      {R(0, 0, W, H, "#00008b")}
      {star(8, 15, 2.6, WHITE)}
      {star(22, 5, 1.2, WHITE, "a1")}
      {star(26, 9, 1.2, WHITE, "a2")}
      {star(22, 14, 1.2, WHITE, "a3")}
      {star(18, 9, 1.2, WHITE, "a4")}
      {R(0, 0, 13, 9, "#012169")}
      <path d="M0 0L13 9M13 0L0 9" stroke={WHITE} strokeWidth={1.8} />
      <path d="M6.5 0v9M0 4.5h13" stroke={WHITE} strokeWidth={2.6} />
      <path d="M6.5 0v9M0 4.5h13" stroke="#c8102e" strokeWidth={1.4} />
    </>
  ),
  NZ: (
    <>
      {R(0, 0, W, H, "#00247d")}
      {R(0, 0, 13, 9, "#012169")}
      <path d="M0 0L13 9M13 0L0 9" stroke={WHITE} strokeWidth={1.8} />
      <path d="M6.5 0v9M0 4.5h13" stroke={WHITE} strokeWidth={2.6} />
      <path d="M6.5 0v9M0 4.5h13" stroke="#cc142b" strokeWidth={1.4} />
      {star(22, 5, 1.5, "#cc142b", "n1")}
      {star(26, 10, 1.5, "#cc142b", "n2")}
      {star(22, 15, 1.5, "#cc142b", "n3")}
      {star(18, 10, 1.5, "#cc142b", "n4")}
    </>
  ),
  CH: (
    <>
      {R(0, 0, W, H, "#da291c")}
      <rect x={13} y={4} width={4} height={12} fill={WHITE} />
      <rect x={9} y={8} width={12} height={4} fill={WHITE} />
    </>
  ),
  IN: (
    <>
      {hStripes(["#ff9933", WHITE, "#138808"])}
      <circle cx={15} cy={10} r={2.6} fill="none" stroke="#000080" strokeWidth={0.8} />
    </>
  ),
  BR: (
    <>
      {R(0, 0, W, H, "#009b3a")}
      <path d="M15 2.2L27 10 15 17.8 3 10z" fill={YEL} />
      <circle cx={15} cy={10} r={4.4} fill="#002776" />
    </>
  ),
  MX: (
    <>
      {vStripes(["#006847", WHITE, "#ce1126"])}
      <circle cx={15} cy={10} r={2.4} fill="#8a6a2f" />
    </>
  ),
  KR: (
    <>
      {R(0, 0, W, H, WHITE)}
      <path d="M9.6 10a5.4 5.4 0 0110.8 0z" fill="#cd2e3a" />
      <path d="M9.6 10a5.4 5.4 0 0010.8 0z" fill="#0047a0" />
      {R(2, 2.5, 4, 1, "#000000", "k1")}
      {R(24, 16.5, 4, 1, "#000000", "k2")}
    </>
  ),
  TR: (
    <>
      {R(0, 0, W, H, "#e30a17")}
      <circle cx={11.5} cy={10} r={5.4} fill={WHITE} />
      <circle cx={13} cy={10} r={4.3} fill="#e30a17" />
      {star(17.5, 10, 2.2, WHITE)}
    </>
  ),
  ZA: (
    <>
      {hStripes(["#de3831", "#002395"])}
      <path d="M0 0l11 10L0 20z" fill="#000000" />
      <path d="M0 1.5L9 10 0 18.5M0 10h30" stroke={GRN} strokeWidth={3.2} fill="none" />
      <path d="M0 0l11 10L0 20" stroke={YEL} strokeWidth={0.8} fill="none" />
    </>
  ),
  SE: (
    <>
      {R(0, 0, W, H, "#006aa7")}
      <rect x={8} y={0} width={4} height={H} fill="#fecc02" />
      <rect x={0} y={8} width={W} height={4} fill="#fecc02" />
    </>
  ),
  NO: (
    <>
      {R(0, 0, W, H, "#ba0c2f")}
      {cross(11, 6, WHITE, "now")}
      {cross(11, 3, "#00205b", "nob")}
    </>
  ),
  DK: (
    <>
      {R(0, 0, W, H, "#c8102e")}
      <rect x={9} y={0} width={3.4} height={H} fill={WHITE} />
      <rect x={0} y={8.3} width={W} height={3.4} fill={WHITE} />
    </>
  ),
  FI: (
    <>
      {R(0, 0, W, H, WHITE)}
      <rect x={8} y={0} width={4.4} height={H} fill="#003580" />
      <rect x={0} y={7.8} width={W} height={4.4} fill="#003580" />
    </>
  ),
  PL: hStripes([WHITE, "#dc143c"]),
  CZ: (
    <>
      {hStripes([WHITE, "#d7141a"])}
      <path d="M0 0l15 10L0 20z" fill="#11457e" />
    </>
  ),
  HU: hStripes(["#ce2939", WHITE, "#477050"]),
  NL: hStripes(["#ae1c28", WHITE, "#21468b"]),
  AT: hStripes(["#ed2939", WHITE, "#ed2939"]),
  BE: vStripes(["#000000", "#fdda24", "#ef3340"]),
  IE: vStripes(["#169b62", WHITE, "#ff883e"]),
  PT: (
    <>
      {vStripes(["#006600", "#ff0000"], [2, 3])}
      <circle cx={12} cy={10} r={3.2} fill={YEL} />
    </>
  ),
  GR: (
    <>
      {hStripes(["#0d5eaf", WHITE, "#0d5eaf", WHITE, "#0d5eaf", WHITE, "#0d5eaf", WHITE, "#0d5eaf"])}
      {R(0, 0, 11, 11.1, "#0d5eaf")}
      <rect x={4.4} y={0} width={2.2} height={11.1} fill={WHITE} />
      <rect x={0} y={4.4} width={11} height={2.2} fill={WHITE} />
    </>
  ),
  UA: hStripes(["#0057b7", "#ffd700"]),
  KZ: (
    <>
      {R(0, 0, W, H, "#00afca")}
      <circle cx={15} cy={9} r={3.6} fill={YEL} />
    </>
  ),
  HK: (
    <>
      {R(0, 0, W, H, "#de2910")}
      <circle cx={15} cy={10} r={4} fill={WHITE} />
      <circle cx={15} cy={10} r={1.2} fill="#de2910" />
    </>
  ),
  SG: (
    <>
      {hStripes(["#ef3340", WHITE])}
      <circle cx={8} cy={5} r={3.2} fill={WHITE} />
      <circle cx={9.2} cy={5} r={2.7} fill="#ef3340" />
    </>
  ),
  ID: hStripes(["#ce1126", WHITE]),
  SA: (
    <>
      {R(0, 0, W, H, "#006c35")}
      <rect x={7} y={7.5} width={16} height={1.4} fill={WHITE} />
      <rect x={9} y={12.5} width={12} height={1.2} fill={WHITE} />
    </>
  ),
  AR: (
    <>
      {hStripes(["#74acdf", WHITE, "#74acdf"])}
      <circle cx={15} cy={10} r={2} fill="#f6b40e" />
    </>
  ),
  IL: (
    <>
      {R(0, 0, W, H, WHITE)}
      {R(0, 2.2, W, 2.6, "#0038b8", "i1")}
      {R(0, 15.2, W, 2.6, "#0038b8", "i2")}
      <circle cx={15} cy={10} r={3.2} fill="none" stroke="#0038b8" strokeWidth={0.9} />
    </>
  ),
  TH: hStripes(["#a51931", WHITE, "#2d2a4a", WHITE, "#a51931"], [1, 1, 2, 1, 1]),
  TW: (
    <>
      {R(0, 0, W, H, "#fe0000")}
      {R(0, 0, 15, 10, "#000095")}
      <circle cx={7.5} cy={5} r={2.6} fill={WHITE} />
    </>
  ),
  UK: <></>,
};
FLAGS.UK = FLAGS.GB;

function Globe() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
      <circle cx={15} cy={10} r={7.5} />
      <ellipse cx={15} cy={10} rx={3.4} ry={7.5} />
      <path d="M7.5 10h15" />
    </g>
  );
}

function FlagBase({ code, width = 18, className = "" }: { code: string; width?: number; className?: string }) {
  const c = (code || "").toUpperCase();
  const art = FLAGS[c];
  const height = Math.round((width * H) / W);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={height}
      role="img"
      aria-label={c || "world"}
      className={`shrink-0 rounded-[2px] ${art || !c ? "" : "bg-gray-200 dark:bg-gray-700"} ${!c ? "text-gray-400" : ""} ${className}`}
      style={{ boxShadow: "0 0 0 0.5px rgba(128,128,128,.45)" }}
    >
      {art ?? (c ? <text x={15} y={14.2} textAnchor="middle" fontSize={11} fontWeight={700} fill="currentColor" className="text-gray-600 dark:text-gray-300" fontFamily="system-ui,sans-serif">{c}</text> : <Globe />)}
    </svg>
  );
}

const Flag = memo(FlagBase);
export default Flag;
