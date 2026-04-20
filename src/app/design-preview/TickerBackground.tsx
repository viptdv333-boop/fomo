"use client";

import { useEffect, useRef } from "react";

/**
 * Chart background — a few continuous light-grey price lines drawn on a
 * dark-grey gradient. A slow "visibility wave" sweeps across the screen:
 * a bright moving head trails a fading tail, so the chart keeps revealing
 * and dissolving in different areas. Inspired by the Claude interface.
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

    // Layered sine curve — gives a believable price-like shape
    function wave(x: number, seed: number): number {
      return (
        Math.sin(x * 0.0032 + seed) * 0.55 +
        Math.sin(x * 0.0011 - seed * 1.7) * 0.30 +
        Math.sin(x * 0.0075 + seed * 2.3) * 0.15
      );
    }

    type Sweep = {
      y: number;        // baseline (fraction of h)
      amp: number;      // amplitude (fraction of h)
      seed: number;
      speed: number;    // head speed, px/sec
      headOffset: number; // initial x offset (px)
      trail: number;    // visible tail length (px)
      headLead: number; // short fade ahead of the head (px)
      thickness: number;
      alphaScale: number;
    };

    const sweeps: Sweep[] = [
      { y: 0.30, amp: 0.10, seed: 1.2, speed: 42,  headOffset: -200, trail: 620, headLead: 70, thickness: 1.3, alphaScale: 0.55 },
      { y: 0.58, amp: 0.18, seed: 4.7, speed: 34,  headOffset: -900, trail: 780, headLead: 90, thickness: 1.4, alphaScale: 0.65 },
      { y: 0.78, amp: 0.09, seed: 9.1, speed: 48,  headOffset: -1500, trail: 540, headLead: 60, thickness: 1.2, alphaScale: 0.45 },
    ];

    // Visibility of point x given head position hx and sweep params.
    // Fade-in briefly ahead of the head, full bright at the head,
    // smooth fade-out over `trail` behind it.
    function visibility(x: number, hx: number, trail: number, lead: number): number {
      const dx = hx - x;
      if (dx < -lead) return 0;              // too far ahead
      if (dx > trail) return 0;               // already gone
      if (dx < 0) {
        // ahead of head — short fade-in
        return 1 - Math.min(1, -dx / lead);
      }
      // behind head — long fade-out (ease-out)
      const k = dx / trail;
      return Math.pow(1 - k, 1.8);
    }

    function drawSweep(s: Sweep, now: number) {
      const baseY = h * s.y;
      const amp = h * s.amp;
      // Head position wraps across a total span a bit wider than screen
      const span = w + s.trail + 200;
      const rawHx = s.headOffset + (s.speed * (now - t0)) / 1000;
      const hx = ((rawHx % span) + span) % span - s.trail; // can go negative so tail exits cleanly

      const step = 3;
      type Pt = { x: number; y: number; a: number };
      const pts: Pt[] = [];
      for (let x = -5; x <= w + 5; x += step) {
        const a = visibility(x, hx, s.trail, s.headLead) * s.alphaScale;
        const y = baseY + wave(x, s.seed) * amp;
        pts.push({ x, y, a });
      }

      // stroke line in short segments so each keeps its own alpha
      ctx.lineWidth = s.thickness;
      ctx.lineCap = "round";
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const a = (p0.a + p1.a) / 2;
        if (a <= 0.005) continue;
        ctx.strokeStyle = `rgba(235, 235, 240, ${a})`;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }

      // soft area fill under the visible portion — subtle glow
      ctx.beginPath();
      let started = false;
      let firstX = 0;
      for (const p of pts) {
        if (p.a > 0.02) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            firstX = p.x;
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      if (started) {
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, h);
        ctx.lineTo(firstX, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, baseY - amp, 0, h);
        g.addColorStop(0, `rgba(230, 230, 235, ${0.06 * s.alphaScale})`);
        g.addColorStop(1, "rgba(230, 230, 235, 0)");
        ctx.fillStyle = g;
        ctx.fill();
      }

      // bright head dot
      // find visible head (closest x to hx)
      if (hx >= -5 && hx <= w + 5) {
        const y = baseY + wave(hx, s.seed) * amp;
        const headAlpha = 0.9 * s.alphaScale;
        ctx.fillStyle = `rgba(245, 245, 250, ${headAlpha})`;
        ctx.beginPath();
        ctx.arc(hx, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawGrid() {
      // static faint grid on the backdrop
      ctx.lineWidth = 1;
      const rows = 8;
      for (let i = 1; i < rows; i++) {
        const y = (h / rows) * i;
        ctx.strokeStyle =
          i === Math.floor(rows / 2)
            ? "rgba(220, 220, 225, 0.06)"
            : "rgba(220, 220, 225, 0.03)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      const cols = 14;
      ctx.strokeStyle = "rgba(220, 220, 225, 0.025)";
      for (let i = 1; i < cols; i++) {
        const x = (w / cols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }

    function render(now: number) {
      ctx.clearRect(0, 0, w, h);
      drawGrid();
      for (const s of sweeps) drawSweep(s, now);
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
      {/* dark gradient backdrop */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 0,
          background:
            "radial-gradient(ellipse at 50% 30%, #1a1a22 0%, #101014 55%, #08080a 100%)",
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
