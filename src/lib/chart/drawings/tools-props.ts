import { registerPropSchema, type Control, type PropRow, type PropSchema, type TextSpec } from "./props";
import { STAMP_DEFS } from "./tools-stamps";

/* Property schemas of the extended drawing tools. Every property listed here is read by the tool's draw():
   line colour / width / dash, background (showFill + fill), border (showBorder), text (shared text pipeline),
   and the tool options `showLabels`, `showRatios`, `showMedian`, `showBase`, `deviation`, `mirror`, `rows`, `widthPct`, `vaPct`. */

const c = (key = "color", extra: Partial<Extract<Control, { type: "color" }>> = {}): Control => ({ type: "color", key, ...extra });
const w: Control = { type: "width", key: "width" };
const dash: Control = { type: "dash", key: "dash" };
const chk = (key: string, def: boolean, labelKey: string, controls?: Control[]): PropRow => ({ labelKey, check: { key, def }, controls });

const lineRow: PropRow = { labelKey: "dp.line", controls: [c(), w, dash] };
const borderRow: PropRow = chk("showBorder", true, "dp.border", [c(), w, dash]);
const fillRow: PropRow = chk("showFill", true, "dp.background", [{ type: "fill" }]);
const labelsRow: PropRow = chk("showLabels", true, "draw.opt.showLabels");
const extL = chk("extendLeft", false, "dp.extendLeft");
const extR = chk("extendRight", false, "dp.extendRight");

const LINE_TEXT: TextSpec = { size: 12, valign: "top", align: "center", vAlign: true };
const SHAPE_TEXT: TextSpec = { size: 14, valign: "middle", align: "center", vAlign: true };
const BOX_TEXT: TextSpec = { size: 12, bold: true, align: "left", vAlign: false };

const schema = (rows: PropRow[], extra: Partial<PropSchema> = {}): PropSchema => ({ style: [{ rows }], ...extra });

const reg = (ids: string[], s: PropSchema) => ids.forEach((id) => registerPropSchema(id, s));

/* ───────────── lines ───────────── */

registerPropSchema("trend_angle", schema([lineRow, chk("showAngle", true, "dp.showAngle")], { text: LINE_TEXT }));
reg(["disjoint_channel", "flat_top_bottom"], schema([lineRow, fillRow], { text: LINE_TEXT }));
registerPropSchema(
  "regression",
  schema(
    [
      lineRow,
      chk("showMid", true, "dp.midLine"),
      extL,
      extR,
      { labelKey: "draw.opt.deviation", controls: [{ type: "number", key: "deviation", min: 0.1, max: 10, step: 0.1, def: 2, suffix: "σ" }] },
      labelsRow,
      fillRow,
    ],
    { pointLabels: ["draw.pt.start", "draw.pt.end"] }
  )
);
reg(["schiff", "mschiff", "inside_fork"], schema([lineRow, chk("showMedian", true, "dp.median"), chk("showBase", true, "dp.baseLine"), fillRow]));
registerPropSchema("pitchfan", schema([lineRow, fillRow]));

/* ───────────── fibonacci & gann ───────────── */

reg(["fib_time", "fib_trend_time", "fib_circles", "fib_arcs", "fib_wedge", "fib_speed_fan", "gann_box", "gann_square", "gann_square_fixed", "gann_fan"], schema([lineRow, labelsRow, fillRow]));
registerPropSchema("fib_spiral", schema([lineRow]));

/* ───────────── patterns, waves, cycles ───────────── */

const HARMONIC = ["xabcd", "cypher", "abcd", "three_drives"];
reg(HARMONIC, schema([lineRow, labelsRow, chk("showRatios", true, "draw.opt.showRatios"), fillRow]));
reg(["head_shoulders", "triangle_pattern", "elliott_impulse", "elliott_correction", "elliott_triangle", "elliott_double", "elliott_triple"], schema([lineRow, labelsRow, fillRow]));
registerPropSchema("xabcd", schema([lineRow, labelsRow, chk("showRatios", true, "draw.opt.showRatios"), fillRow], { pointLabels: ["X", "A", "B", "C", "D"] }));
registerPropSchema("cypher", schema([lineRow, labelsRow, chk("showRatios", true, "draw.opt.showRatios"), fillRow], { pointLabels: ["X", "A", "B", "C", "D"] }));
registerPropSchema("abcd", schema([lineRow, labelsRow, chk("showRatios", true, "draw.opt.showRatios"), fillRow], { pointLabels: ["A", "B", "C", "D"] }));
registerPropSchema("elliott_impulse", schema([lineRow, labelsRow, fillRow], { pointLabels: ["0", "1", "2", "3", "4", "5"] }));
registerPropSchema("elliott_correction", schema([lineRow, labelsRow, fillRow], { pointLabels: ["0", "A", "B", "C"] }));
registerPropSchema("elliott_triangle", schema([lineRow, labelsRow, fillRow], { pointLabels: ["0", "A", "B", "C", "D", "E"] }));
registerPropSchema("elliott_double", schema([lineRow, labelsRow, fillRow], { pointLabels: ["0", "W", "X", "Y"] }));
registerPropSchema("elliott_triple", schema([lineRow, labelsRow, fillRow], { pointLabels: ["0", "W", "X", "Y", "X", "Z"] }));
reg(["cyclic_lines", "time_cycles"], schema([lineRow, fillRow]));
registerPropSchema("sine_line", schema([lineRow]));

/* ───────────── forecasting & volume ───────────── */

registerPropSchema("forecast", schema([lineRow, labelsRow, fillRow], { pointLabels: ["dp.pt.entry", "dp.pt.target"] }));
registerPropSchema("projection", schema([lineRow, labelsRow, fillRow]));
registerPropSchema("bars_pattern", schema([lineRow, chk("mirror", false, "draw.opt.mirror")], { pointLabels: ["draw.pt.rangeStart", "draw.pt.rangeEnd", "draw.pt.paste"] }));
registerPropSchema("ghost_feed", schema([lineRow], { pointLabels: ["draw.pt.rangeStart", "draw.pt.rangeEnd", "draw.pt.paste"] }));
registerPropSchema("anchored_vwap", schema([lineRow, labelsRow], { pointLabels: ["dp.pt.anchor"] }));

const profileRows: PropRow[] = [
  { labelKey: "draw.opt.upVolume", controls: [c()] },
  { labelKey: "draw.opt.downVolume", controls: [c("fill", { def: "#ff9800" })] },
  { labelKey: "draw.opt.rows", controls: [{ type: "number", key: "rows", min: 8, max: 120, step: 1, def: 30 }] },
  { labelKey: "draw.opt.widthPct", controls: [{ type: "number", key: "widthPct", min: 10, max: 100, step: 5, def: 70, suffix: "%" }] },
  { labelKey: "draw.opt.vaPct", controls: [{ type: "number", key: "vaPct", min: 10, max: 100, step: 5, def: 70, suffix: "%" }] },
  chk("showLabels", false, "draw.opt.showLabels"),
];
registerPropSchema("fixed_volume_profile", schema(profileRows, { pointLabels: ["draw.pt.rangeStart", "draw.pt.rangeEnd"] }));
registerPropSchema("anchored_volume_profile", schema(profileRows, { pointLabels: ["dp.pt.anchor"] }));

/* ───────────── shapes ───────────── */

reg(["rotated_rect", "circle", "polyline"], schema([borderRow, fillRow], { text: SHAPE_TEXT }));
reg(["arc", "curve"], schema([borderRow, fillRow]));
registerPropSchema("double_curve", schema([lineRow]));
registerPropSchema("path", {
  style: [
    {
      rows: [
        lineRow,
        { labelKey: "dp.leftEnd", controls: [{ type: "select", key: "leftEnd", def: "none", options: [{ value: "none", labelKey: "dp.end.none" }, { value: "arrow", labelKey: "dp.end.arrow" }] }] },
        { labelKey: "dp.rightEnd", controls: [{ type: "select", key: "rightEnd", def: "arrow", options: [{ value: "none", labelKey: "dp.end.none" }, { value: "arrow", labelKey: "dp.end.arrow" }] }] },
      ],
    },
  ],
});
registerPropSchema("highlighter", schema([{ labelKey: "dp.line", controls: [c(), w] }], { noCoords: true }));
reg(["arrow_up", "arrow_down", "arrow_marker"], schema([{ labelKey: "dp.line", controls: [c(), w] }]));

/* ───────────── annotation ───────────── */

registerPropSchema("anchored_text", schema([borderRow, fillRow], { text: { ...BOX_TEXT, size: 13 }, primary: "text", pointLabels: ["dp.pt.anchor"] }));
registerPropSchema("price_note", schema([{ labelKey: "dp.borderColor", controls: [c()] }, fillRow], { text: BOX_TEXT, primary: "text", pointLabels: ["dp.pt.anchor", "dp.pt.note"] }));
registerPropSchema("pin", schema([{ labelKey: "dp.flagColor", controls: [c()] }], { text: { size: 11, bold: true, align: "left", vAlign: false, bg: true, bgFromColor: true }, primary: "text", pointLabels: ["dp.pt.anchor"] }));
registerPropSchema("table", schema([borderRow, fillRow], { text: { ...BOX_TEXT, size: 12 }, primary: "text", pointLabels: ["dp.pt.anchor"] }));
registerPropSchema("callout", schema([fillRow], { text: BOX_TEXT, primary: "text", pointLabels: ["dp.pt.anchor", "dp.pt.note"] }));
registerPropSchema("comment", schema([fillRow], { text: BOX_TEXT, primary: "text", pointLabels: ["dp.pt.anchor"] }));
registerPropSchema("signpost", schema([lineRow, fillRow], { text: BOX_TEXT, primary: "text", pointLabels: ["draw.pt.base", "dp.pt.note"] }));

/* ───────────── stamps ───────────── */

const stampSchema: PropSchema = schema([{ labelKey: "dp.size", controls: [{ type: "number", key: "fontSize", min: 12, max: 160, step: 2, def: 22, suffix: "px" }] }]);
for (const [id] of STAMP_DEFS) registerPropSchema(id, stampSchema);
