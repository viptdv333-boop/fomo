import * as G from "./geometry";
import {
  BLUE,
  GRAY,
  GREEN,
  ORANGE,
  PURPLE,
  TOL,
  borderOn,
  dot,
  fillOn,
  guide,
  mkStyle,
  paintTextBlock,
  roundRect,
  segHit,
  stroke,
  strokeSeg,
  textBlock,
  type Drawing,
  type Env,
  type Pt,
  type TextDefaults,
  type ToolDef,
  tx,
} from "./tools-kit";

/* Annotation tools: anchored text, price note, pin, table, callout, comment, signpost.
   Text goes through the shared text pipeline (render.ts), so the Text tab of the properties dialog works for all of them. */

const UI_BOX_TEXT = { color: true, width: false, dash: false, fill: true, text: true } as const;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inBox(b: Box, x: number, y: number, pad = 3): boolean {
  return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
}

/** Text block with a padded box around it. */
function boxed(env: Env, d: Drawing, def: TextDefaults, opts: Parameters<typeof textBlock>[3] = {}, padX = 6, padY = 4) {
  const tb = textBlock(env, d, def, opts);
  return { ...tb, w: tb.lay.w + padX * 2, h: tb.lay.h + padY * 2, padX, padY };
}

function fillStyleAlpha(d: Drawing, def: number): number {
  return Math.max(0, Math.min(1, d.style.fillOpacity ?? def));
}

function paintIn(ctx: CanvasRenderingContext2D, env: Env, b: ReturnType<typeof boxed>, x: number, y: number) {
  paintTextBlock(ctx, env, b.cfg, b.lay, x + b.padX, y + b.padY, b.empty ? 0.55 : 1);
}

/* ───────────── anchored text ───────────── */

const anchoredSize = (d: Drawing) => 11 + Math.round(Math.max(1, d.style.width)) * 2;

function anchoredBox(env: Env, d: Drawing, P: Pt[]) {
  const b = boxed(env, d, { size: anchoredSize(d), bold: true, align: "left", valign: "middle" });
  return { ...b, x: P[0].x, y: P[0].y - b.h / 2 };
}

const anchoredText: ToolDef = {
  id: "anchored_text",
  labelKey: "draw.tool.anchored_text",
  points: 1,
  style: mkStyle(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.12, text: "" }),
  ui: { color: true, width: true, dash: false, fill: true, text: true },
  draw(ctx, env, d, P, st) {
    const b = anchoredBox(env, d, P);
    roundRect(ctx, b.x, b.y, b.w, b.h, 5);
    if (fillOn(d)) {
      ctx.save();
      ctx.globalAlpha = fillStyleAlpha(d, 0.12);
      ctx.fillStyle = d.style.fill ?? d.style.color;
      ctx.fill();
      ctx.restore();
    }
    if (borderOn(d)) {
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = st.selected || st.hover ? 1.5 : 1;
      ctx.setLineDash([]);
      ctx.stroke();
    }
    dot(ctx, P[0], 3, d.style.color);
    paintIn(ctx, env, b, b.x, b.y);
  },
  hit: (env, d, P, x, y) => inBox(anchoredBox(env, d, P), x, y, 4),
};

/* ───────────── price note ───────────── */

function noteBox(env: Env, d: Drawing, P: Pt[]) {
  const t = d.style.text ?? "";
  const b = boxed(env, d, { size: 12, bold: true, color: "#1f2937", align: "left", valign: "middle" }, { text: t === "" ? env.fmt(d.points[0].p) : `${env.fmt(d.points[0].p)}\n${t}` });
  return { ...b, x: P[1].x, y: P[1].y - b.h / 2 };
}

const priceNote: ToolDef = {
  id: "price_note",
  labelKey: "draw.tool.price_note",
  points: 2,
  style: mkStyle(ORANGE, 1, "solid", { fill: ORANGE, fillOpacity: 0.95, text: "", textColor: "#1f2937" }),
  ui: UI_BOX_TEXT,
  draw(ctx, env, d, P, st) {
    const b = noteBox(env, d, P);
    stroke(ctx, d, st, undefined, "solid");
    ctx.lineWidth = 1;
    strokeSeg(ctx, P[0], { x: b.x, y: P[1].y });
    dot(ctx, P[0], 3.5, d.style.color);
    guide(ctx, d);
    ctx.globalAlpha = 0.6;
    strokeSeg(ctx, { x: P[0].x - 10, y: P[0].y }, { x: P[0].x + 10, y: P[0].y });
    ctx.globalAlpha = 1;
    roundRect(ctx, b.x, b.y, b.w, b.h, 5);
    if (fillOn(d)) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.2, fillStyleAlpha(d, 0.95));
      ctx.fillStyle = d.style.fill ?? d.style.color;
      ctx.fill();
      ctx.restore();
    }
    if (borderOn(d) && (st.selected || st.hover)) {
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    paintIn(ctx, env, b, b.x, b.y);
  },
  hit(env, d, P, x, y) {
    const b = noteBox(env, d, P);
    return inBox(b, x, y, 2) || segHit(x, y, [P[0], { x: b.x, y: P[1].y }, "segment"]) || Math.hypot(x - P[0].x, y - P[0].y) <= 8;
  },
};

/* ───────────── pin ───────────── */

const PIN_R = 9;
const PIN_H = 26;

function pinLabel(env: Env, d: Drawing, P: Pt[]) {
  if ((d.style.text ?? "") === "") return null;
  const b = boxed(env, d, { size: 11, bold: true, color: "#ffffff", bg: true, align: "left", valign: "middle" }, { placeholder: false, bgFromColor: true }, 3, 2);
  return { ...b, x: P[0].x + PIN_R + 6, y: P[0].y - PIN_H - b.h / 2 };
}

const pin: ToolDef = {
  id: "pin",
  labelKey: "draw.tool.pin",
  points: 1,
  style: mkStyle("#f23645", 2, "solid", { text: "", textColor: "#ffffff" }),
  ui: { color: true, width: false, dash: false, fill: false, text: true },
  draw(ctx, env, d, P, st) {
    const cx = P[0].x;
    const cy = P[0].y - PIN_H;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = d.style.color;
    // teardrop: circle head that narrows to the tip at the anchor
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(cx - PIN_R * 0.86, cy + PIN_R * 0.5);
    ctx.arc(cx, cy, PIN_R, Math.PI * 0.833, Math.PI * 0.167 + Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (st.hover || st.selected) {
      ctx.strokeStyle = d.style.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, PIN_R + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    const b = pinLabel(env, d, P);
    if (b) paintIn(ctx, env, b, b.x, b.y);
  },
  hit(env, d, P, x, y) {
    if (Math.hypot(x - P[0].x, y - (P[0].y - PIN_H)) <= PIN_R + 4) return true;
    if (Math.abs(x - P[0].x) <= 6 && y >= P[0].y - PIN_H + 4 && y <= P[0].y + 3) return true;
    const b = pinLabel(env, d, P);
    return !!b && inBox(b, x, y, 2);
  },
};

/* ───────────── table ───────────── */

const TABLE_DEFAULT = "A1|B1;A2|B2";

function tableCells(d: Drawing): string[][] {
  const raw = (d.style.text ?? "") === "" ? TABLE_DEFAULT : (d.style.text as string);
  const rows = raw.split(/[;\n]/).map((r) => r.split("|"));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: cols }, (_, i) => (r[i] ?? "").trim()));
}

function tableLayout(env: Env, d: Drawing, P: Pt[]) {
  const cells = tableCells(d);
  const cfg = textBlock(env, d, { size: 12, bold: true, color: env.theme.text, align: "left", valign: "middle" }, { text: "" }).cfg;
  const padX = 9;
  const rowH = Math.round(cfg.size * 2);
  const colW: number[] = [];
  const ctxFont = `${cfg.italic ? "italic " : ""}${cfg.bold ? 700 : 500} ${cfg.size}px ${env.font}`;
  cells[0].forEach((_, c) => {
    let w = 34;
    for (const row of cells) w = Math.max(w, measureText(ctxFont, row[c], cfg.size) + padX * 2);
    colW.push(w);
  });
  return { cells, cfg, rowH, colW, padX, x: P[0].x, y: P[0].y, w: colW.reduce((a, b) => a + b, 0), h: cells.length * rowH };
}

let mctx: CanvasRenderingContext2D | null = null;
function measureText(font: string, s: string, size: number): number {
  if (!mctx && typeof document !== "undefined") {
    try {
      mctx = document.createElement("canvas").getContext("2d");
    } catch {
      mctx = null;
    }
  }
  if (!mctx) return s.length * size * 0.58;
  mctx.font = font;
  return mctx.measureText(s).width;
}

const table: ToolDef = {
  id: "table",
  labelKey: "draw.tool.table",
  points: 1,
  style: mkStyle(GRAY, 1, "solid", { fill: BLUE, fillOpacity: 0.85, text: "" }),
  ui: UI_BOX_TEXT,
  draw(ctx, env, d, P, st) {
    const L = tableLayout(env, d, P);
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = env.theme.bg;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(L.x, L.y, L.w, L.h);
    if (fillOn(d)) {
      ctx.globalAlpha = Math.max(0.2, fillStyleAlpha(d, 0.85));
      ctx.fillStyle = d.style.fill ?? BLUE;
      ctx.fillRect(L.x, L.y, L.w, L.rowH);
    }
    ctx.globalAlpha = 1;
    if (borderOn(d)) {
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = st.selected || st.hover ? 1.5 : Math.max(1, d.style.width);
      ctx.beginPath();
      ctx.rect(L.x + 0.5, L.y + 0.5, L.w, L.h);
      let cx = L.x;
      L.colW.forEach((w, i) => {
        if (i > 0) {
          ctx.moveTo(cx + 0.5, L.y);
          ctx.lineTo(cx + 0.5, L.y + L.h);
        }
        cx += w;
      });
      for (let r = 1; r < L.cells.length; r++) {
        ctx.moveTo(L.x, L.y + r * L.rowH + 0.5);
        ctx.lineTo(L.x + L.w, L.y + r * L.rowH + 0.5);
      }
      ctx.stroke();
    }
    ctx.font = `${L.cfg.italic ? "italic " : ""}${L.cfg.bold ? 700 : 500} ${L.cfg.size}px ${env.font}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = L.cfg.align === "center" ? "center" : L.cfg.align === "right" ? "right" : "left";
    L.cells.forEach((row, r) => {
      let x = L.x;
      row.forEach((cell, c) => {
        ctx.fillStyle = r === 0 && fillOn(d) && d.style.textColor === undefined ? "#ffffff" : L.cfg.color;
        const tx0 = L.cfg.align === "center" ? x + L.colW[c] / 2 : L.cfg.align === "right" ? x + L.colW[c] - L.padX : x + L.padX;
        ctx.fillText(cell, tx0, L.y + r * L.rowH + L.rowH / 2 + 0.5);
        x += L.colW[c];
      });
    });
    ctx.restore();
  },
  hit(env, d, P, x, y) {
    const L = tableLayout(env, d, P);
    return x >= L.x - 3 && x <= L.x + L.w + 3 && y >= L.y - 3 && y <= L.y + L.h + 3;
  },
};

/* ───────────── callout & comment ───────────── */

const BUBBLE_TEXT: TextDefaults = { size: 12, bold: true, color: "#ffffff", align: "left", valign: "middle" };

function bubble(env: Env, d: Drawing) {
  return boxed(env, d, BUBBLE_TEXT, {}, 10, 6);
}

/** Point of the box outline nearest to `p` plus the tangent used to spread the tail base. */
function tailBase(b: Box, p: Pt): { c: Pt; tang: Pt } {
  const cx = Math.max(b.x + 8, Math.min(b.x + b.w - 8, p.x));
  const cy = Math.max(b.y + 8, Math.min(b.y + b.h - 8, p.y));
  const dl = Math.abs(p.x - b.x);
  const dr = Math.abs(p.x - (b.x + b.w));
  const dt = Math.abs(p.y - b.y);
  const db = Math.abs(p.y - (b.y + b.h));
  const inside = p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  if (inside) return { c: { x: b.x + b.w / 2, y: b.y + b.h }, tang: { x: 1, y: 0 } };
  const horizontal = p.x < b.x || p.x > b.x + b.w;
  const vertical = p.y < b.y || p.y > b.y + b.h;
  if (horizontal && (!vertical || Math.min(dl, dr) > Math.min(dt, db))) {
    return { c: { x: p.x < b.x ? b.x : b.x + b.w, y: cy }, tang: { x: 0, y: 1 } };
  }
  return { c: { x: cx, y: p.y < b.y ? b.y : b.y + b.h }, tang: { x: 1, y: 0 } };
}

function bubbleFill(ctx: CanvasRenderingContext2D, d: Drawing, def: number) {
  ctx.globalAlpha = Math.max(0.2, fillStyleAlpha(d, def));
  ctx.fillStyle = fillOn(d) ? (d.style.fill ?? d.style.color) : "rgba(0,0,0,0)";
}

function selectRing(ctx: CanvasRenderingContext2D, d: Drawing, b: Box, r: number, st: { selected: boolean; hover: boolean }) {
  if (!(st.selected || st.hover)) return;
  ctx.save();
  ctx.strokeStyle = d.style.color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  roundRect(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, r + 1);
  ctx.stroke();
  ctx.restore();
}

function calloutBox(env: Env, d: Drawing, P: Pt[]) {
  const b = bubble(env, d);
  return { ...b, x: P[1].x - b.w / 2, y: P[1].y - b.h / 2 };
}

const callout: ToolDef = {
  id: "callout",
  labelKey: "draw.tool.callout",
  points: 2,
  style: mkStyle(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.92, text: "", textColor: "#ffffff" }),
  ui: UI_BOX_TEXT,
  draw(ctx, env, d, P, st) {
    const b = calloutBox(env, d, P);
    const { c, tang } = tailBase(b, P[0]);
    ctx.save();
    ctx.setLineDash([]);
    bubbleFill(ctx, d, 0.92);
    ctx.beginPath();
    ctx.moveTo(c.x - tang.x * 8, c.y - tang.y * 8);
    ctx.lineTo(P[0].x, P[0].y);
    ctx.lineTo(c.x + tang.x * 8, c.y + tang.y * 8);
    ctx.closePath();
    ctx.fill();
    roundRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.restore();
    selectRing(ctx, d, b, 8, st);
    paintIn(ctx, env, b, b.x, b.y);
  },
  hit(env, d, P, x, y) {
    const b = calloutBox(env, d, P);
    return inBox(b, x, y, 2) || G.distToSegment({ x, y }, P[0], tailBase(b, P[0]).c) <= TOL;
  },
};

function commentBox(env: Env, d: Drawing, P: Pt[]) {
  const b = bubble(env, d);
  return { ...b, x: P[0].x - 4, y: P[0].y - 12 - b.h };
}

const comment: ToolDef = {
  id: "comment",
  labelKey: "draw.tool.comment",
  points: 1,
  style: mkStyle(GREEN, 1, "solid", { fill: GREEN, fillOpacity: 0.95, text: "", textColor: "#ffffff" }),
  ui: UI_BOX_TEXT,
  draw(ctx, env, d, P, st) {
    const b = commentBox(env, d, P);
    ctx.save();
    ctx.setLineDash([]);
    bubbleFill(ctx, d, 0.95);
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x + 5, b.y + b.h - 1);
    ctx.lineTo(b.x + 20, b.y + b.h - 1);
    ctx.lineTo(P[0].x, P[0].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    selectRing(ctx, d, b, 10, st);
    paintIn(ctx, env, b, b.x, b.y);
  },
  hit(env, d, P, x, y) {
    const b = commentBox(env, d, P);
    return inBox(b, x, y, 2) || (x >= P[0].x - 4 && x <= P[0].x + 20 && y >= b.y + b.h - 2 && y <= P[0].y + 3);
  },
};

/* ───────────── signpost ───────────── */

function signBox(env: Env, d: Drawing, P: Pt[]) {
  const empty = (d.style.text ?? "") === "";
  const b = boxed(env, d, BUBBLE_TEXT, empty ? { text: tx("draw.txt.signpost") } : {}, 8, 5);
  return { ...b, x: P[0].x, y: P[1].y - b.h / 2 };
}

const signpost: ToolDef = {
  id: "signpost",
  labelKey: "draw.tool.signpost",
  points: 2,
  style: mkStyle(PURPLE, 2, "solid", { fill: PURPLE, fillOpacity: 0.95, text: "", textColor: "#ffffff" }),
  ui: UI_BOX_TEXT,
  constrain(d) {
    d.points[1].t = d.points[0].t;
  },
  draw(ctx, env, d, P, st) {
    const b = signBox(env, d, P);
    const x = Math.round(P[0].x) + 0.5;
    stroke(ctx, d, st, undefined, "solid");
    ctx.beginPath();
    ctx.moveTo(x, P[0].y);
    ctx.lineTo(x, Math.min(b.y - 6, P[0].y));
    ctx.stroke();
    dot(ctx, P[0], 3, d.style.color);
    // sign: rectangle with a pointed right end
    ctx.save();
    ctx.setLineDash([]);
    bubbleFill(ctx, d, 0.95);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w + 10, b.y + b.h / 2);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    paintIn(ctx, env, b, b.x, b.y);
  },
  hit(env, d, P, x, y) {
    const b = signBox(env, d, P);
    return inBox({ ...b, w: b.w + 10 }, x, y, 2) || segHit(x, y, [P[0], { x: P[0].x, y: b.y - 6 }, "segment"]);
  },
  handles(_env, _d, P) {
    return [
      { x: P[0].x, y: P[0].y, idx: 0 },
      {
        x: P[0].x,
        y: P[1].y,
        drag: (pts, _t, p) => {
          pts[1].p = p;
          pts[1].t = pts[0].t;
        },
      },
    ];
  },
};

export const ANNOTATION_TOOLS: ToolDef[] = [anchoredText, priceNote, pin, table, callout, comment, signpost];
