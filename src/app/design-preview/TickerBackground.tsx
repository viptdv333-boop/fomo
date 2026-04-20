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

    // ── session config ──
    // Every ~10s a fresh chart grows inside a randomly-placed rectangle.
    // After the session ends, the chart fades out and a new one appears
    // in a different location.
    const SESSION_MS = 40000;     // total visible time per session (4× slower)
    const FADE_IN_MS = 2200;
    const FADE_OUT_MS = 3200;
    const MAX_POINTS = 120;       // ticks per session
    const TICK_MS = Math.floor((SESSION_MS - FADE_IN_MS - FADE_OUT_MS) / MAX_POINTS);
    const DRIFT_ABS = 0.12;       // magnitude of per-session drift (signed)
    const VOL = 1.15;

    let sessionDrift = (Math.random() - 0.5) * 2 * DRIFT_ABS; // random up/down each session

    type Region = { x: number; y: number; width: number; height: number };
    let region: Region = pickRegion(null);
    let sessionStart = performance.now();
    const prices: number[] = [0];
    let lastPrice = 0;
    let lastTick = performance.now();
    let cycleAlpha = 1;

    function rand(min: number, max: number) { return min + Math.random() * (max - min); }

    function pickRegion(prev: Region | null): Region {
      // Sample a rectangle; retry a few times to avoid heavy overlap with prev.
      const tryPick = (): Region => {
        const rw = rand(w * 0.28, w * 0.55);
        const rh = rand(h * 0.16, h * 0.34);
        const rx = rand(w * 0.02, w - rw - w * 0.02);
        const ry = rand(h * 0.05, h - rh - h * 0.05);
        return { x: rx, y: ry, width: rw, height: rh };
      };
      let r = tryPick();
      if (prev) {
        for (let i = 0; i < 6; i++) {
          const dx = Math.abs((r.x + r.width / 2) - (prev.x + prev.width / 2));
          const dy = Math.abs((r.y + r.height / 2) - (prev.y + prev.height / 2));
          if (dx > w * 0.22 || dy > h * 0.18) break;
          r = tryPick();
        }
      }
      return r;
    }

    function pushTick() {
      if (prices.length >= MAX_POINTS) return;
      lastPrice += sessionDrift + (Math.random() - 0.5) * VOL;
      prices.push(lastPrice);
    }

    function updateSession(now: number) {
      const elapsed = now - sessionStart;
      if (elapsed < FADE_IN_MS) {
        cycleAlpha = elapsed / FADE_IN_MS;
      } else if (elapsed < SESSION_MS - FADE_OUT_MS) {
        cycleAlpha = 1;
      } else if (elapsed < SESSION_MS) {
        cycleAlpha = (SESSION_MS - elapsed) / FADE_OUT_MS;
      } else {
        // new session in a new location, fresh random drift direction
        region = pickRegion(region);
        sessionStart = now;
        lastTick = now;
        prices.length = 0;
        lastPrice = 0;
        prices.push(lastPrice);
        sessionDrift = (Math.random() - 0.5) * 2 * DRIFT_ABS;
        cycleAlpha = 0;
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
      // re-pick region so it fits the new viewport
      region = pickRegion(null);
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

      // fixed dx inside the region — earlier ticks keep their x
      const dx = region.width / (MAX_POINTS - 1);

      const points: [number, number][] = [];
      for (let i = 0; i < prices.length; i++) {
        const x = region.x + i * dx;
        const norm = (prices[i] - min) / yRange;
        const y = region.y + (1 - norm) * region.height;
        points.push([x, y]);
      }

      const aLine = 0.14 * cycleAlpha;
      const aFill = 0.02 * cycleAlpha;

      // everything in this block is blurred so the chart reads as background
      ctx.save();
      ctx.filter = "blur(2.2px)";

      const lastPt = points[points.length - 1];

      // area fill below the line, contained to the region
      const grad = ctx.createLinearGradient(0, region.y, 0, region.y + region.height);
      grad.addColorStop(0, `rgba(230, 230, 230, ${aFill})`);
      grad.addColorStop(1, "rgba(230, 230, 230, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points) ctx.lineTo(x, y);
      ctx.lineTo(lastPt[0], region.y + region.height);
      ctx.lineTo(points[0][0], region.y + region.height);
      ctx.closePath();
      ctx.fill();

      // main line — paler + slightly thicker to read well through the blur
      ctx.strokeStyle = `rgba(210, 210, 210, ${aLine})`;
      ctx.lineWidth = 1.4;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points) ctx.lineTo(x, y);
      ctx.stroke();

      // live tick dot — dim
      ctx.fillStyle = `rgba(225, 225, 225, ${0.28 * cycleAlpha})`;
      ctx.beginPath();
      ctx.arc(lastPt[0], lastPt[1], 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
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
      updateSession(now);
      while (now - lastTick >= TICK_MS) {
        pushTick();
        lastTick += TICK_MS;
      }

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
