import type { DrawingStyle } from "../contracts";
import type { Drawing, DrawingPatch } from "./types";
import { DEFAULT_TEXT_BG, type HAlign, type LevelKind, type VAlign } from "./render";

/* Per-tool property schema. The Properties dialog (Style / Text tabs) and the floating style bar are generated from it,
   and every property is really consumed by the tool's draw() (see tools.ts / render.ts).

   Storage: scalar properties live in `Drawing.style` (scope "style", the default), structured ones
   (fibonacci levels, per-timeframe visibility) in `Drawing.extra` (scope "extra").

   New tools add their entry with `registerPropSchema(toolId, schema)`. Without one the dialog builds a basic schema from
   the tool's `ui` flags (see `schemaFromUi`). This file must not import tools.ts (tools-*.ts import it). */

export type Scope = "style" | "extra";

export interface Ref {
  key: string;
  scope?: Scope;
}

export interface Opt {
  value: string;
  labelKey: string;
}

/** `def` may be "@key" = "same as that style property" (e.g. the midline colour follows the line colour). */
export type Control =
  | (Ref & { type: "color"; def?: string; alpha?: boolean })
  /** Background colour: style.fill + style.fillOpacity together (falls back to the line colour). */
  | { type: "fill"; scope?: undefined; key?: undefined }
  | (Ref & { type: "width"; def?: number; max?: number })
  | (Ref & { type: "dash"; def?: string })
  | (Ref & { type: "number"; min: number; max: number; step?: number; def: number | ((s: DrawingStyle) => number); suffix?: string })
  | (Ref & { type: "slider"; min: number; max: number; step?: number; def: number })
  | (Ref & { type: "select"; options: Opt[]; def: string })
  | (Ref & { type: "bool"; def: boolean })
  /** Icon-like on/off button (bold, italic). */
  | (Ref & { type: "toggle"; def: boolean; glyph: string; titleKey: string })
  /** Exclusive choice shown as a row of buttons (text alignment). */
  | (Ref & { type: "segment"; def: string; options: Opt[] })
  | (Ref & { type: "text"; def?: string; multiline?: boolean; placeholder?: string })
  | { type: "levels"; kind: LevelKind; scope?: undefined; key?: undefined };

export interface PropRow {
  labelKey?: string;
  /** Leading checkbox that switches the row on (the label belongs to it). */
  check?: Ref & { def: boolean };
  controls?: Control[];
  /** Only shown when another property has this value. */
  showIf?: Ref & { eq: string | number | boolean };
}

export interface PropSection {
  titleKey?: string;
  rows: PropRow[];
}

export interface TextSpec {
  /** Default font size (the value the tool paints with when fontSize was never set). */
  size: number | ((s: DrawingStyle) => number);
  bold?: boolean;
  align?: HAlign;
  valign?: VAlign;
  /** Offer the vertical alignment (lines / shapes: above, on, below). */
  vAlign?: boolean;
  /** Default of the "background" checkbox. */
  bg?: boolean;
  border?: boolean;
  /** Text colour is stored in `color` instead of `textColor` (the plain text tool). */
  colorKey?: "color" | "textColor";
  /** Default text background = the drawing colour instead of the dark default. */
  bgFromColor?: boolean;
  /** No wrapping option (labels that are always one line). */
  noWrap?: boolean;
}

export interface PropSchema {
  style: PropSection[];
  /** Text tab; absent = the tool has no text. */
  text?: TextSpec;
  /** Label keys of the anchors for the Coordinates tab (else "Point N"). */
  pointLabels?: string[];
  /** Open on the Text tab first (text, note, flag). */
  primary?: "text";
  /** Hide the Coordinates tab (freehand brush). */
  noCoords?: boolean;
}

const REGISTRY = new Map<string, PropSchema>();

export function registerPropSchema(toolId: string, schema: PropSchema): void {
  REGISTRY.set(toolId, schema);
}

export function getPropSchema(toolId: string): PropSchema | undefined {
  // stamps added later share the size-only schema
  return REGISTRY.get(toolId) ?? (toolId.startsWith("stamp_") ? STAMP_SCHEMA : undefined);
}

/** Basic schema for a tool that registered none, from its `ui` flags. */
export function schemaFromUi(ui: { color: boolean; width: boolean; dash: boolean; fill: boolean; text: boolean }): PropSchema {
  const controls: Control[] = [];
  if (ui.color) controls.push({ type: "color", key: "color" });
  if (ui.width) controls.push({ type: "width", key: "width" });
  if (ui.dash) controls.push({ type: "dash", key: "dash" });
  const rows: PropRow[] = [];
  if (controls.length) rows.push({ labelKey: "dp.line", controls });
  if (ui.fill) rows.push({ labelKey: "dp.background", check: { key: "showFill", def: true }, controls: [{ type: "fill" }] });
  return { style: [{ rows }], text: ui.text ? { size: 14, vAlign: true } : undefined };
}

/* ───────────── reading / writing a property ───────────── */

export type Holder = Pick<Drawing, "style" | "extra">;

export function readRaw(d: Holder, ref: Ref): unknown {
  return ref.scope === "extra" ? d.extra?.[ref.key] : (d.style as Record<string, unknown>)[ref.key];
}

/** Value of a control with its default applied ("@key" defaults resolve against the style). */
export function readProp(d: Holder, ref: Ref, def?: unknown): unknown {
  const v = readRaw(d, ref);
  if (v !== undefined && v !== null) return v;
  if (typeof def === "function") return (def as (s: DrawingStyle) => unknown)(d.style);
  if (typeof def === "string" && def.startsWith("@")) return (d.style as Record<string, unknown>)[def.slice(1)];
  return def;
}

/** Patch that sets one property (undefined removes it). */
export function propPatch(ref: Ref, value: unknown): DrawingPatch {
  return ref.scope === "extra" ? { extra: { [ref.key]: value } } : { style: { [ref.key]: value } as Partial<DrawingStyle> };
}

/* ───────────── builders ───────────── */

const DASHES: Opt[] = [
  { value: "solid", labelKey: "draw.style.solid" },
  { value: "dashed", labelKey: "draw.style.dashed" },
  { value: "dotted", labelKey: "draw.style.dotted" },
];
const ENDS: Opt[] = [
  { value: "none", labelKey: "dp.end.none" },
  { value: "arrow", labelKey: "dp.end.arrow" },
];

const c = (key = "color", extra: Partial<Extract<Control, { type: "color" }>> = {}): Control => ({ type: "color", key, ...extra });
const w: Control = { type: "width", key: "width" };
const dash: Control = { type: "dash", key: "dash" };
const chk = (key: string, def: boolean, labelKey: string, controls?: Control[]): PropRow => ({ labelKey, check: { key, def }, controls });

const lineRow = (labelKey = "dp.line"): PropRow => ({ labelKey, controls: [c(), w, dash] });
const borderRow: PropRow = chk("showBorder", true, "dp.border", [c(), w, dash]);
const fillRow = (key = "showFill", labelKey = "dp.background"): PropRow => chk(key, true, labelKey, [{ type: "fill" }]);
const extL = chk("extendLeft", false, "dp.extendLeft");
const extR = chk("extendRight", false, "dp.extendRight");
const endL: PropRow = { labelKey: "dp.leftEnd", controls: [{ type: "select", key: "leftEnd", options: ENDS, def: "none" }] };
const endR: PropRow = { labelKey: "dp.rightEnd", controls: [{ type: "select", key: "rightEnd", options: ENDS, def: "none" }] };
const midPoint = chk("showMid", false, "dp.midPoint", [c("midColor", { def: "@color" })]);
const endPrice = chk("showEndPrice", false, "dp.endPrice");

const statRows = (keys: ("showPrice" | "showPct" | "showBars" | "showTime" | "showDist" | "showAngle")[], defs: Partial<Record<string, boolean>> = {}): PropRow[] =>
  keys.map((k) => chk(k, defs[k] ?? false, `dp.${k}`));

const LINE_TEXT: TextSpec = { size: 12, valign: "top", align: "center", vAlign: true };
const SHAPE_TEXT: TextSpec = { size: 14, valign: "middle", align: "center", vAlign: true };

const STATS_LINE = statRows(["showPrice", "showPct", "showBars", "showTime", "showDist", "showAngle"]);

const trendSchema = (defs: Partial<Record<string, boolean>> = {}): PropSchema => ({
  style: [
    { rows: [lineRow(), extL, extR, endL, endR, midPoint, endPrice] },
    { titleKey: "dp.stats", rows: statRows(["showPrice", "showPct", "showBars", "showTime", "showDist", "showAngle"], defs) },
  ],
  text: LINE_TEXT,
});

const levelRows = (kind: LevelKind): PropRow[] => [{ controls: [{ type: "levels", kind }] }];

const fibSchema = (kind: LevelKind, opts: { extend?: boolean } = { extend: true }): PropSchema => ({
  style: [
    { titleKey: "dp.levels", rows: levelRows(kind) },
    {
      rows: [
        chk("useOneColor", false, "dp.useOneColor"),
        lineRow(),
        chk("showTrend", true, "dp.trendLine", [c("trendColor", { def: "#787b86" }), { type: "width", key: "trendWidth", def: 1, max: 4 }, { type: "dash", key: "trendDash", def: "dashed" }]),
        ...(opts.extend ? [extL, extR] : []),
        chk("reverse", false, "dp.reverse"),
        chk("logScale", false, "dp.logLevels"),
        fillRow(),
      ],
    },
    {
      titleKey: "dp.labels",
      rows: [
        {
          labelKey: "dp.labelPos",
          controls: [
            {
              type: "select",
              key: "labelPos",
              def: "left",
              options: [
                { value: "left", labelKey: "dp.pos.left" },
                { value: "right", labelKey: "dp.pos.right" },
                { value: "off", labelKey: "dp.pos.off" },
              ],
            },
          ],
        },
        {
          labelKey: "dp.labelFmt",
          controls: [
            {
              type: "select",
              key: "labelFmt",
              def: "value",
              options: [
                { value: "value", labelKey: "dp.fmt.value" },
                { value: "percent", labelKey: "dp.fmt.percent" },
              ],
            },
          ],
        },
        chk("showPrice", true, "dp.levelPrice"),
      ],
    },
  ],
  text: LINE_TEXT,
});

const shapeBase = (extra: PropRow[] = []): PropRow[] => [borderRow, fillRow(), ...extra];

const positionSchema: PropSchema = {
  style: [
    {
      titleKey: "dp.inputs",
      rows: [
        { labelKey: "dp.accountSize", controls: [{ type: "number", key: "accountSize", min: 1, max: 1e12, step: 100, def: 1000 }] },
        {
          labelKey: "dp.riskType",
          controls: [
            {
              type: "select",
              key: "riskType",
              def: "pct",
              options: [
                { value: "pct", labelKey: "dp.risk.pct" },
                { value: "cash", labelKey: "dp.risk.cash" },
              ],
            },
            { type: "number", key: "risk", min: 0.01, max: 1e12, step: 0.5, def: 1 },
          ],
        },
        { labelKey: "dp.lotSize", controls: [{ type: "number", key: "lotSize", min: 0.0001, max: 1e9, step: 1, def: 1 }] },
      ],
    },
    {
      titleKey: "dp.style",
      rows: [
        { labelKey: "dp.profitColor", controls: [c()] },
        { labelKey: "dp.stopColor", controls: [{ type: "fill" }] },
        { labelKey: "dp.entryLine", controls: [c("entryColor", { def: "#787b86" })] },
        { labelKey: "dp.textColor", controls: [c("textColor", { def: "#ffffff" })] },
        chk("showBorder", true, "dp.border", [w, dash]),
        chk("showFill", true, "dp.background"),
        chk("showStats", true, "dp.alwaysStats"),
        chk("showQty", true, "dp.showQty"),
      ],
    },
  ],
  pointLabels: ["dp.pt.entry", "dp.pt.target", "dp.pt.stop"],
};

/** Rows of the Text tab for a tool's TextSpec (content, font, colours, alignment, wrapping). */
export function textSections(spec: TextSpec): PropSection[] {
  const colorKey = spec.colorKey ?? "textColor";
  const H: Opt[] = [
    { value: "left", labelKey: "dp.al.left" },
    { value: "center", labelKey: "dp.al.center" },
    { value: "right", labelKey: "dp.al.right" },
  ];
  const V: Opt[] = [
    { value: "top", labelKey: "dp.al.top" },
    { value: "middle", labelKey: "dp.al.middle" },
    { value: "bottom", labelKey: "dp.al.bottom" },
  ];
  const rows: PropRow[] = [
    { controls: [{ type: "text", key: "text", multiline: true, placeholder: "dp.textPlaceholder" }] },
    {
      labelKey: "dp.font",
      controls: [
        { type: "number", key: "fontSize", min: 6, max: 120, step: 1, def: spec.size, suffix: "px" },
        { type: "toggle", key: "bold", def: !!spec.bold, glyph: "B", titleKey: "dp.bold" },
        { type: "toggle", key: "italic", def: false, glyph: "I", titleKey: "dp.italic" },
      ],
    },
    { labelKey: "dp.textColor", controls: [{ type: "color", key: colorKey, def: colorKey === "color" ? undefined : "@color" }] },
    chk("showTextBg", spec.bg ?? false, "dp.textBg", [{ type: "color", key: "textBg", def: spec.bgFromColor ? "@color" : DEFAULT_TEXT_BG }]),
    chk("showTextBorder", spec.border ?? false, "dp.textBorder", [{ type: "color", key: "textBorder", def: "@color" }]),
    { labelKey: "dp.alignH", controls: [{ type: "segment", key: "textAlign", def: spec.align ?? "center", options: H }] },
  ];
  if (spec.vAlign) rows.push({ labelKey: "dp.alignV", controls: [{ type: "segment", key: "textVAlign", def: spec.valign ?? "middle", options: V }] });
  if (!spec.noWrap) rows.push(chk("textWrap", false, "dp.wrap"));
  return [{ rows }];
}

/* ───────────── schemas of the built-in tools ───────────── */

registerPropSchema("trend", trendSchema());
registerPropSchema("ray", trendSchema());
registerPropSchema("extended", trendSchema());
registerPropSchema("info", trendSchema({ showPrice: true, showPct: true, showBars: true, showTime: true }));
registerPropSchema("arrow", trendSchema());

registerPropSchema("hline", {
  style: [{ rows: [lineRow(), chk("showPrice", true, "dp.priceLabel")] }],
  text: LINE_TEXT,
  pointLabels: ["dp.pt.price"],
});
registerPropSchema("hray", {
  style: [{ rows: [lineRow(), extL, chk("showPrice", true, "dp.priceLabel")] }],
  text: LINE_TEXT,
  pointLabels: ["dp.pt.price"],
});
registerPropSchema("vline", { style: [{ rows: [lineRow()] }], text: LINE_TEXT });
registerPropSchema("crossline", { style: [{ rows: [lineRow()] }] });

registerPropSchema("channel", {
  style: [
    {
      rows: [
        lineRow(),
        extL,
        extR,
        chk("showMid", true, "dp.midLine", [c("midColor", { def: "@color" }), { type: "dash", key: "midDash", def: "dashed" }]),
        fillRow(),
      ],
    },
  ],
  text: LINE_TEXT,
});

registerPropSchema("pitchfork", {
  style: [
    {
      rows: [
        {
          labelKey: "dp.variant",
          controls: [
            {
              type: "select",
              key: "variant",
              def: "original",
              options: [
                { value: "original", labelKey: "dp.variant.original" },
                { value: "schiff", labelKey: "dp.variant.schiff" },
                { value: "modified", labelKey: "dp.variant.modified" },
              ],
            },
          ],
        },
        chk("showMedian", true, "dp.median", [c(), w, dash]),
        chk("showBase", true, "dp.baseLine"),
        fillRow(),
      ],
    },
    { titleKey: "dp.forkLevels", rows: levelRows("pitch") },
  ],
  text: LINE_TEXT,
});

registerPropSchema("fib_retr", fibSchema("retr"));
registerPropSchema("fib_ext", fibSchema("ext"));
registerPropSchema("fib_channel", fibSchema("channel"));

registerPropSchema("long", positionSchema);
registerPropSchema("short", positionSchema);

const rangeSchema = (keys: Parameters<typeof statRows>[0], withBorder = true): PropSchema => ({
  style: [{ rows: [...(withBorder ? [borderRow] : [lineRow()]), fillRow()] }, { titleKey: "dp.stats", rows: statRows(keys, Object.fromEntries(keys.map((k) => [k, true]))) }],
  text: { ...SHAPE_TEXT, valign: "top" },
});

registerPropSchema("price_range", rangeSchema(["showPrice", "showPct"]));
registerPropSchema("date_range", rangeSchema(["showBars", "showTime"]));
registerPropSchema("datprice_range", rangeSchema(["showPrice", "showPct", "showBars", "showTime"]));
registerPropSchema("measure", {
  style: [
    { rows: [{ labelKey: "dp.upColor", controls: [c()] }, { labelKey: "dp.downColor", controls: [c("downColor", { def: "#f23645" })] }, chk("showBorder", true, "dp.border", [w, dash]), fillRow()] },
    { titleKey: "dp.stats", rows: statRows(["showPrice", "showPct", "showBars", "showTime"], { showPrice: true, showPct: true, showBars: true, showTime: true }) },
  ],
  text: { ...SHAPE_TEXT, valign: "top" },
});

registerPropSchema("rect", {
  style: [{ rows: shapeBase([extL, extR, chk("showMid", false, "dp.midLine", [c("midColor", { def: "@color" }), { type: "dash", key: "midDash", def: "dashed" }])]) }],
  text: SHAPE_TEXT,
});
registerPropSchema("ellipse", { style: [{ rows: shapeBase() }], text: SHAPE_TEXT });
registerPropSchema("triangle", { style: [{ rows: shapeBase() }], text: SHAPE_TEXT });

registerPropSchema("brush", {
  style: [
    {
      rows: [
        lineRow(),
        { labelKey: "dp.smoothing", controls: [{ type: "slider", key: "smooth", min: 0, max: 10, step: 1, def: 1 }] },
        endL,
        endR,
        chk("showFill", false, "dp.background", [{ type: "fill" }]),
      ],
    },
  ],
  noCoords: true,
});

const textSize = (s: DrawingStyle) => 11 + Math.round(Math.max(1, s.width)) * 2;

registerPropSchema("text", {
  style: [],
  text: { size: textSize, colorKey: "color", align: "left", valign: "middle", vAlign: false },
  primary: "text",
});
registerPropSchema("note", {
  style: [{ rows: [{ labelKey: "dp.borderColor", controls: [c()] }, chk("showBorder", true, "dp.border"), fillRow()] }],
  text: { size: 12, bold: true, align: "left", vAlign: false, bg: false, border: false },
  primary: "text",
  pointLabels: ["dp.pt.anchor", "dp.pt.note"],
});
registerPropSchema("price_label", {
  style: [
    {
      rows: [
        { labelKey: "dp.background", controls: [c()] },
        { labelKey: "dp.textColor", controls: [c("textColor", { def: "#ffffff" })] },
        { labelKey: "dp.fontSize", controls: [{ type: "number", key: "fontSize", min: 8, max: 48, step: 1, def: 12, suffix: "px" }] },
        chk("bold", true, "dp.bold"),
      ],
    },
  ],
});
registerPropSchema("flag", {
  style: [{ rows: [{ labelKey: "dp.flagColor", controls: [c()] }, { labelKey: "dp.size", controls: [{ type: "number", key: "markSize", min: 12, max: 200, step: 2, def: 30, suffix: "px" }] }] }],
  text: { size: 11, bold: true, align: "left", vAlign: false, bg: true, bgFromColor: true },
  primary: "text",
});

const STAMP_SCHEMA: PropSchema = {
  style: [{ rows: [{ labelKey: "dp.size", controls: [{ type: "number", key: "fontSize", min: 12, max: 160, step: 2, def: 22, suffix: "px" }] }] }],
};
for (const id of ["stamp_star", "stamp_rocket", "stamp_fire", "stamp_warn", "stamp_check", "stamp_cross", "stamp_up", "stamp_down"]) registerPropSchema(id, STAMP_SCHEMA);
