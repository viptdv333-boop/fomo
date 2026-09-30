import { ANNOTATION_TOOLS } from "./tools-annotation";
import { CYCLE_TOOLS } from "./tools-cycles";
import { FIB_TOOLS } from "./tools-fib";
import { FORECAST_TOOLS } from "./tools-forecast";
import type { ToolDef } from "./tools-kit";
import { LINE_TOOLS } from "./tools-lines";
import { PATTERN_TOOLS } from "./tools-patterns";
import { SHAPE_TOOLS } from "./tools-shapes";
import "./tools-props";
import { STAMP_DEFS, STAMP_TOOLS } from "./tools-stamps";

/* Aggregates every additional tool and lays out the left toolbar the way TradingView groups them. */

export const EXTRA_TOOLS: ToolDef[] = [...LINE_TOOLS, ...FIB_TOOLS, ...PATTERN_TOOLS, ...CYCLE_TOOLS, ...FORECAST_TOOLS, ...SHAPE_TOOLS, ...ANNOTATION_TOOLS, ...STAMP_TOOLS];

export interface GroupLayout {
  id: string;
  grid?: boolean;
  sections: { id: string; ids: string[] }[];
}

export const GROUP_LAYOUT: GroupLayout[] = [
  {
    id: "lines",
    sections: [
      { id: "lines", ids: ["trend", "ray", "info", "extended", "trend_angle", "hline", "hray", "vline", "crossline"] },
      { id: "channels", ids: ["channel", "regression", "flat_top_bottom", "disjoint_channel"] },
      { id: "pitchforks", ids: ["pitchfork", "schiff", "mschiff", "inside_fork"] },
    ],
  },
  {
    id: "fib",
    sections: [
      { id: "fib", ids: ["fib_retr", "fib_ext", "fib_channel", "fib_time", "fib_speed_fan", "fib_trend_time", "fib_circles", "fib_spiral", "fib_arcs", "fib_wedge", "pitchfan"] },
      { id: "gann", ids: ["gann_box", "gann_square_fixed", "gann_square", "gann_fan"] },
    ],
  },
  {
    id: "patterns",
    sections: [
      { id: "patterns", ids: ["xabcd", "cypher", "head_shoulders", "abcd", "triangle_pattern", "three_drives"] },
      { id: "elliott", ids: ["elliott_impulse", "elliott_correction", "elliott_triangle", "elliott_double", "elliott_triple"] },
      { id: "cycles", ids: ["cyclic_lines", "time_cycles", "sine_line"] },
    ],
  },
  {
    id: "forecast",
    sections: [
      { id: "forecasting", ids: ["long", "short", "forecast", "bars_pattern", "ghost_feed", "projection"] },
      { id: "volume", ids: ["anchored_vwap", "fixed_volume_profile", "anchored_volume_profile"] },
      { id: "measure", ids: ["price_range", "date_range", "datprice_range", "measure"] },
    ],
  },
  {
    id: "shapes",
    sections: [
      { id: "brushes", ids: ["brush", "highlighter"] },
      { id: "shapes", ids: ["rect", "rotated_rect", "path", "circle", "ellipse", "polyline", "triangle", "arc", "curve", "double_curve"] },
      { id: "arrows", ids: ["arrow_marker", "arrow", "arrow_up", "arrow_down"] },
    ],
  },
  {
    id: "text",
    sections: [{ id: "annotation", ids: ["text", "anchored_text", "note", "price_note", "pin", "table", "callout", "comment", "price_label", "signpost", "flag"] }],
  },
  {
    id: "stamps",
    grid: true,
    sections: [
      {
        id: "stamps",
        ids: ["stamp_star", "stamp_rocket", "stamp_fire", "stamp_warn", "stamp_check", "stamp_cross", "stamp_up", "stamp_down", ...STAMP_DEFS.map(([id]) => id)],
      },
    ],
  },
];
