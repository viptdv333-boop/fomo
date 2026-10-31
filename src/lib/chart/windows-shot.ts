import type { ChartEngine } from "./engine";

/** The price chart and its extra windows as one PNG, laid out the way they are on the page, back to front (what is between the windows is filled with the pane border colour). */
export function composeWindows(main: ChartEngine, stack: { engine: ChartEngine; z: number }[]): string {
  const all = stack.map((s) => s.engine);
  const rects = all.map((e) => e.getContainerRect());
  const x0 = Math.min(...rects.map((r) => r.left));
  const y0 = Math.min(...rects.map((r) => r.top));
  const x1 = Math.max(...rects.map((r) => r.right));
  const y1 = Math.max(...rects.map((r) => r.bottom));
  const mainCanvas = main.screenshotCanvas();
  const mi = Math.max(0, all.indexOf(main));
  const dpr = rects[mi].width > 0 ? mainCanvas.width / rects[mi].width : window.devicePixelRatio || 1;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round((x1 - x0) * dpr));
  out.height = Math.max(1, Math.round((y1 - y0) * dpr));
  const ctx = out.getContext("2d");
  if (!ctx) return mainCanvas.toDataURL("image/png");
  ctx.fillStyle = main.getTheme().paneBorder;
  ctx.fillRect(0, 0, out.width, out.height);
  all.forEach((e, i) => {
    const r = rects[i];
    if (r.width <= 0 || r.height <= 0) return;
    ctx.drawImage(e === main ? mainCanvas : e.screenshotCanvas(), Math.round((r.left - x0) * dpr), Math.round((r.top - y0) * dpr), Math.round(r.width * dpr), Math.round(r.height * dpr));
  });
  return out.toDataURL("image/png");
}
