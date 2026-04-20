"use client";

import { useEffect, useRef } from "react";

/**
 * Monochrome slow trading-chart background:
 *  - faint horizontal grid lines (Y-axis scale of a chart)
 *  - a single price line gently undulating across the viewport,
 *    softly filled below with a fading gradient
 *  - one lighter echo line for parallax depth
 *  - everything grey, no colour, no ticker text, no candles
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

    // smooth layered noise for price wave
    function wave(x: number, time: number, seed = 0): number {
      return (
        Math.sin(x * 0.0035 + time * 0.00008 + seed) * 0.55 +
        Math.sin(x * 0.0012 - time * 0.00005 + seed * 1.7) * 0.30 +
        Math.sin(x * 0.008 + time * 0.00011 + seed * 2.3) * 0.15
      );
    }

    function render(now: number) {
      const t = now - t0;
      ctx.clearRect(0, 0, w, h);

      // ── horizontal grid lines (chart Y-axis) ──
      const rows = 8;
      ctx.strokeStyle = "rgba(200, 200, 200, 0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < rows; i++) {
        const y = (h / rows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // ── faint echo line (parallax, behind main) ──
      const echoBaseY = h * 0.58;
      const echoAmp = h * 0.14;
      ctx.strokeStyle = "rgba(180, 180, 180, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -5; x <= w + 5; x += 5) {
        const y = echoBaseY + wave(x, t * 0.7, 4.2) * echoAmp;
        if (x === -5) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ── main price line ──
      const baseY = h * 0.5;
      const amp = h * 0.22;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(220, 220, 220, 0.32)";
      ctx.beginPath();
      const points: [number, number][] = [];
      for (let x = -5; x <= w + 5; x += 3) {
        const y = baseY + wave(x, t, 0) * amp;
        points.push([x, y]);
        if (x === -5) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ── gradient fill below main line ──
      const grad = ctx.createLinearGradient(0, baseY - amp, 0, h);
      grad.addColorStop(0, "rgba(200, 200, 200, 0.07)");
      grad.addColorStop(1, "rgba(200, 200, 200, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points) ctx.lineTo(x, y);
      ctx.lineTo(w + 5, h);
      ctx.lineTo(-5, h);
      ctx.closePath();
      ctx.fill();

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
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
