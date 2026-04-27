"use client";

import { useEffect, useRef } from "react";

/**
 * Cardiogram backdrop.
 * A single horizontal EKG-like line crosses the screen at the FOMO logo
 * latitude, emerging from fog on the left, passing under the logo, and
 * fading into fog on the right. Slow drift, soft blur, dim grey on a
 * dark-grey gradient.
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

    // ── geometry ──
    const BASELINE_FRAC = 0.40;   // vertical center of the trace (≈ logo line)
    const AMP_PX = 60;            // peak amplitude of R spike (px)
    const PERIOD_PX = 240;        // one beat span (px)
    const SPEED_PX_S = 26;        // horizontal scroll speed (px/sec)
    const FADE_FRAC = 0.22;       // edge fog fade as fraction of width
    const SAMPLE_STEP = 2;        // px between samples

    // ── EKG shape: piecewise function over phase t ∈ [0,1] ──
    // returns normalized value, +1 = up spike, -1 = down spike
    function ekg(x: number): number {
      const t = (((x % PERIOD_PX) + PERIOD_PX) % PERIOD_PX) / PERIOD_PX;
      // baseline first half
      if (t < 0.50) return 0;
      // P wave — small upward bump
      if (t < 0.56) {
        const p = (t - 0.50) / 0.06;
        return Math.sin(p * Math.PI) * 0.08;
      }
      // PR segment flat
      if (t < 0.60) return 0;
      // Q — small dip
      if (t < 0.62) {
        const p = (t - 0.60) / 0.02;
        return -p * 0.10;
      }
      // R — sharp upward spike
      if (t < 0.65) {
        const p = (t - 0.62) / 0.03;
        return -0.10 + p * 1.10;
      }
      // S — sharp downward spike below baseline
      if (t < 0.67) {
        const p = (t - 0.65) / 0.02;
        return 1.0 - p * 1.30;
      }
      // recovery to baseline
      if (t < 0.71) {
        const p = (t - 0.67) / 0.04;
        return -0.30 + p * 0.30;
      }
      // T wave — broad upward bump
      if (t < 0.85) {
        const p = (t - 0.71) / 0.14;
        return Math.sin(p * Math.PI) * 0.18;
      }
      return 0;
    }

    // smoothstep helper
    function smooth(x: number): number {
      const c = Math.max(0, Math.min(1, x));
      return c * c * (3 - 2 * c);
    }

    // edge fog mask: 0 at far edges, 1 in middle
    function edgeAlpha(x: number): number {
      const fade = w * FADE_FRAC;
      if (x < fade) return smooth(x / fade);
      if (x > w - fade) return smooth((w - x) / fade);
      return 1;
    }

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

    function render(now: number) {
      const elapsed = (now - t0) / 1000;
      const offset = SPEED_PX_S * elapsed; // ekg pattern shifts right over time
      const baseline = h * BASELINE_FRAC;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.filter = "blur(1.6px)";
      ctx.lineWidth = 1.4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Stroke in short segments so each can carry its own alpha (edge fade)
      let prevX = 0;
      let prevY = baseline;
      let started = false;
      for (let x = 0; x <= w; x += SAMPLE_STEP) {
        const sample = ekg(x - offset);
        const y = baseline - sample * AMP_PX;
        if (!started) {
          prevX = x;
          prevY = y;
          started = true;
          continue;
        }
        const a = edgeAlpha((x + prevX) / 2);
        if (a > 0.005) {
          ctx.strokeStyle = `rgba(215, 215, 215, ${0.18 * a})`;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        prevX = x;
        prevY = y;
      }

      ctx.restore();
    }

    function loop(now: number) {
      render(now);
      raf = requestAnimationFrame(loop);
    }

    resize();
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      {/* dark grey radial gradient backdrop */}
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
