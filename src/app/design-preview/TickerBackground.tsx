"use client";

import { useEffect, useRef } from "react";

/**
 * Live growing price chart + moving shadow waves that partially obscure it.
 * - A new price tick is appended every ~700ms; the chart scrolls left.
 * - Slight positive drift so the line tends upward over time.
 * - Several dark "wave shadows" drift horizontally at different speeds and
 *   layer over the chart, hiding fragments of it.
 */
export default function ChartBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const t0 = performance.now();

    // ── price series (random walk with slight upward drift) ──
    // Line GROWS from the left edge: one new tick is appended per TICK_MS.
    // X position is fixed per index, so earlier ticks don't slide — the line
    // simply extends to the right until it fills the screen, then it fades
    // and a fresh price history starts again.
    const MAX_POINTS = 420;       // capacity = visible span at full width
    const TICK_MS = 500;          // new tick cadence
    const DRIFT = 0.05;           // small positive per-tick bias
    const VOL = 1.1;              // tick volatility
    const HOLD_FULL_MS = 2500;    // how long to linger after filling
    const FADE_MS = 1200;         // fade duration before reset

    const prices: number[] = [];
    let lastPrice = 0;
    let lastTick = performance.now();
    let fullAt = 0;               // timestamp when chart reached MAX_POINTS
    let cycleAlpha = 1;           // multiplier for chart alpha during fade

    // start with a single price
    prices.push(lastPrice);

    function pushTick(now: number) {
      if (prices.length >= MAX_POINTS) {
        if (fullAt === 0) fullAt = now;
        return;
      }
      lastPrice += DRIFT + (Math.random() - 0.5) * VOL;
      prices.push(lastPrice);
    }

    function maybeReset(now: number) {
      if (fullAt === 0) {
        cycleAlpha = 1;
        return;
      }
      const elapsed = now - fullAt;
      if (elapsed < HOLD_FULL_MS) {
        cycleAlpha = 1;
      } else if (elapsed < HOLD_FULL_MS + FADE_MS) {
        cycleAlpha = 1 - (elapsed - HOLD_FULL_MS) / FADE_MS;
      } else {
        // reset — start a new growing line
        prices.length = 0;
        lastPrice = 0;
        prices.push(lastPrice);
        fullAt = 0;
        cycleAlpha = 1;
      }
    }

    // ── shadow waves ──
    type Shadow = {
      widthFrac: number;   // width as fraction of screen
      cx: number;          // center x (px, updated each frame)
      speed: number;       // px/sec
      alpha: number;       // max darken alpha
      seedY: number;       // phase for vertical wobble
    };
    const shadows: Shadow[] = [
      { widthFrac: 0.32, cx: -400, speed: 22, alpha: 0.55, seedY: 0.3 },
      { widthFrac: 0.22, cx: 200,  speed: 14, alpha: 0.45, seedY: 1.7 },
      { widthFrac: 0.45, cx: 900,  speed: 28, alpha: 0.60, seedY: 2.9 },
      { widthFrac: 0.18, cx: 1400, speed: 18, alpha: 0.50, seedY: 4.1 },
    ];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGrid() {
      ctx.lineWidth = 1;
      const rows = 8;
      for (let i = 1; i < rows; i++) {
        const y = (h / rows) * i;
        ctx.strokeStyle = "rgba(220, 220, 225, 0.025)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      const cols = 14;
      for (let i = 1; i < cols; i++) {
        const x = (w / cols) * i;
        ctx.strokeStyle = "rgba(220, 220, 225, 0.02)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }

    function drawChart() {
      if (prices.length < 2) return;

      // auto-scale y against current history
      let min = Infinity;
      let max = -Infinity;
      for (const p of prices) {
        if (p < min) min = p;
        if (p > max) max = p;
      }
      const pad = (max - min) * 0.12 || 1;
      min -= pad;
      max += pad;
      const yRange = max - min;

      const topPad = h * 0.18;
      const bottomPad = h * 0.15;
      const plotH = h - topPad - bottomPad;

      // FIXED x step — each point keeps its x position; new ticks extend right
      const dx = w / (MAX_POINTS - 1);

      const points: [number, number][] = [];
      for (let i = 0; i < prices.length; i++) {
        const x = i * dx;
        const norm = (prices[i] - min) / yRange;
        const y = topPad + (1 - norm) * plotH;
        points.push([x, y]);
      }

      const aLine = 0.22 * cycleAlpha;
      const aFill = 0.035 * cycleAlpha;

      // area fill under the currently-drawn portion only
      const grad = ctx.createLinearGradient(0, topPad, 0, h);
      grad.addColorStop(0, `rgba(230, 230, 230, ${aFill})`);
      grad.addColorStop(1, "rgba(230, 230, 230, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points) ctx.lineTo(x, y);
      const lastX = points[points.length - 1][0];
      ctx.lineTo(lastX, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      // main line
      ctx.strokeStyle = `rgba(220, 220, 220, ${aLine})`;
      ctx.lineWidth = 1.1;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points) ctx.lineTo(x, y);
      ctx.stroke();

      // live tick marker at the current right end
      const last = points[points.length - 1];
      ctx.fillStyle = `rgba(230, 230, 230, ${0.6 * cycleAlpha})`;
      ctx.beginPath();
      ctx.arc(last[0], last[1], 2.2, 0, Math.PI * 2);
      ctx.fill();
      const glow = ctx.createRadialGradient(last[0], last[1], 0, last[0], last[1], 16);
      glow.addColorStop(0, `rgba(230, 230, 230, ${0.18 * cycleAlpha})`);
      glow.addColorStop(1, "rgba(230, 230, 230, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(last[0], last[1], 16, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawShadows(now: number) {
      for (const s of shadows) {
        const totalSpan = w + w * s.widthFrac * 2;
        const rawCx = s.cx + (s.speed * (now - t0)) / 1000;
        const cx = ((rawCx + w * s.widthFrac) % totalSpan) - w * s.widthFrac;

        const halfW = (w * s.widthFrac) / 2;
        const left = cx - halfW * 2;
        const right = cx + halfW * 2;

        // vertical center wobbles slightly so shadow isn't a flat vertical band
        const yWobble = Math.sin((now / 3500) + s.seedY) * h * 0.08;
        const cy = h * 0.5 + yWobble;

        // gaussian-ish horizontal blob using radial gradient — wide ellipse
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, halfW * 2.2);
        grad.addColorStop(0, `rgba(8, 8, 8, ${s.alpha})`);
        grad.addColorStop(0.55, `rgba(8, 8, 8, ${s.alpha * 0.55})`);
        grad.addColorStop(1, "rgba(8, 8, 8, 0)");
        ctx.fillStyle = grad;
        // draw as ellipse (tall): scale vertically to cover full height
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, Math.max(2.2, h / (halfW * 2.2)));
        ctx.beginPath();
        ctx.arc(0, 0, halfW * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        void left; void right;
      }
    }

    function render(now: number) {
      // tick appends — stop accumulating when full (pushTick no-ops)
      while (now - lastTick >= TICK_MS) {
        pushTick(now);
        lastTick += TICK_MS;
      }
      maybeReset(now);

      ctx.clearRect(0, 0, w, h);
      drawChart();
      drawShadows(now);
      raf = requestAnimationFrame(render);
    }

    resize();
    raf = requestAnimationFrame(render);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 0,
          background:
            "radial-gradient(ellipse at 50% 30%, #1d1d1d 0%, #121212 55%, #080808 100%)",
        }}
      />
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      />
    </>
  );
}
