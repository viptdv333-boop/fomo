import { mkStyle, type ToolDef } from "./tools-kit";

/* Extra stamps (emoji glyphs). The first eight stamps live in tools.ts; ids here continue the same stamp_* scheme. */

export const STAMP_DEFS: [string, string][] = [
  ["stamp_thumbup", "\u{1F44D}"],
  ["stamp_thumbdown", "\u{1F44E}"],
  ["stamp_bell", "\u{1F514}"],
  ["stamp_target", "\u{1F3AF}"],
  ["stamp_crown", "\u{1F451}"],
  ["stamp_bolt", "\u26A1"],
  ["stamp_diamond", "\u{1F48E}"],
  ["stamp_money", "\u{1F4B0}"],
  ["stamp_eyes", "\u{1F440}"],
  ["stamp_bulb", "\u{1F4A1}"],
  ["stamp_heart", "\u2764\uFE0F"],
  ["stamp_skull", "\u{1F480}"],
  ["stamp_bull", "\u{1F402}"],
  ["stamp_bear", "\u{1F43B}"],
  ["stamp_trophy", "\u{1F3C6}"],
  ["stamp_pushpin", "\u{1F4CC}"],
  ["stamp_redflag", "\u{1F6A9}"],
  ["stamp_hourglass", "\u231B"],
  ["stamp_question", "\u2753"],
  ["stamp_exclaim", "\u2757"],
  ["stamp_lock", "\u{1F512}"],
  ["stamp_chart", "\u{1F4CA}"],
  ["stamp_party", "\u{1F389}"],
  ["stamp_smile", "\u{1F600}"],
  ["stamp_sad", "\u{1F61E}"],
  ["stamp_think", "\u{1F914}"],
  ["stamp_cool", "\u{1F60E}"],
  ["stamp_shock", "\u{1F631}"],
  ["stamp_muscle", "\u{1F4AA}"],
  ["stamp_pray", "\u{1F64F}"],
  ["stamp_bomb", "\u{1F4A3}"],
  ["stamp_moon", "\u{1F319}"],
];

function stamp(id: string, glyph: string): ToolDef {
  const sizeOf = (d: { style: { width: number; fontSize?: number } }) => (typeof d.style.fontSize === "number" ? d.style.fontSize : 14 + Math.round(Math.max(1, d.style.width)) * 4);
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 1,
    style: mkStyle("#f59e0b", 2),
    ui: { color: false, width: true, dash: false, fill: false, text: false },
    glyph,
    draw(ctx, env, d, P, st) {
      const size = sizeOf(d);
      ctx.save();
      ctx.font = `${size}px ${env.font}, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000";
      ctx.fillText(glyph, P[0].x, P[0].y);
      if (st.hover && !st.selected) {
        ctx.strokeStyle = env.theme.crosshair;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(P[0].x, P[0].y, size / 2 + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
    hit(_env, d, P, x, y) {
      return Math.hypot(x - P[0].x, y - P[0].y) <= sizeOf(d) / 2 + 4;
    },
  };
}

export const STAMP_TOOLS: ToolDef[] = STAMP_DEFS.map(([id, g]) => stamp(id, g));
