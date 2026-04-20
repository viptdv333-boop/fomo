"use client";

import { useEffect, useRef } from "react";

/**
 * Animated stock-market background:
 *  - layer 1: soft radial glow (static gradient, CSS)
 *  - layer 2: drifting price-lines (sparkline paths that slowly morph + scroll)
 *  - layer 3: ghosted candlesticks in parallax, slow left-drift
 *  - layer 4: two ticker-tape rows with scrolling symbols/prices
 *  - layer 5: subtle noise (CSS dots)
 * All drawn on a single canvas for perf.
 */
export default function TickerBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initScene();
    }

    // ─────────── scene data ───────────
    interface PriceLine {
      baseY: number;
      amp: number;
      freq: number;
      speed: number;
      offset: number;
      hue: "up" | "down" | "neutral";
      thickness: number;
      opacity: number;
    }
    interface Candle {
      x: number;
      y: number;
      w: number;
      h: number;
      body: number;
      wickTop: number;
      wickBot: number;
      up: boolean;
      speed: number;
      opacity: number;
    }
    interface Ticker {
      y: number;
      speed: number;
      items: { symbol: string; price: string; change: number }[];
      offset: number;
    }

    let priceLines: PriceLine[] = [];
    let candles: Candle[] = [];
    let tickers: Ticker[] = [];

    const SYMBOLS = [
      "SBER", "GAZP", "LKOH", "YDEX", "ROSN", "GMKN", "NVTK",
      "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE",
      "MOEX", "RTS", "S&P", "NDX", "GOLD", "BRENT", "USDRUB",
    ];

    function makeTickerItem() {
      const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const price = (Math.random() * 5000 + 50).toFixed(2);
      const change = (Math.random() - 0.45) * 5;
      return { symbol: sym, price, change: +change.toFixed(2) };
    }

    function initScene() {
      // price lines (5 layers at different depths)
      priceLines = Array.from({ length: 5 }, (_, i) => {
        const depth = i / 4; // 0..1
        return {
          baseY: h * (0.25 + Math.random() * 0.5),
          amp: 30 + Math.random() * 80,
          freq: 0.003 + Math.random() * 0.004,
          speed: 0.15 + depth * 0.4,
          offset: Math.random() * 1000,
          hue: Math.random() > 0.6 ? "up" : Math.random() > 0.5 ? "down" : "neutral",
          thickness: 0.6 + depth * 1.2,
          opacity: 0.08 + depth * 0.12,
        };
      });

      // candlesticks (two parallax rows)
      candles = [];
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        const rowY = h * (0.2 + r * 0.5);
        const depth = r / rows;
        let x = -50;
        while (x < w + 200) {
          const cw = 14 + depth * 10;
          const gap = 6 + depth * 4;
          const up = Math.random() > 0.5;
          const bodyH = 18 + Math.random() * 70;
          candles.push({
            x,
            y: rowY,
            w: cw,
            h: bodyH,
            body: bodyH,
            wickTop: 8 + Math.random() * 18,
            wickBot: 8 + Math.random() * 18,
            up,
            speed: 0.08 + depth * 0.25,
            opacity: 0.04 + depth * 0.08,
          });
          x += cw + gap;
        }
      }

      // two ticker tapes
      tickers = [
        {
          y: 90,
          speed: 0.35,
          offset: 0,
          items: Array.from({ length: 20 }, makeTickerItem),
        },
        {
          y: h - 70,
          speed: 0.28,
          offset: 0,
          items: Array.from({ length: 20 }, makeTickerItem),
        },
      ];
    }

    // ─────────── render ───────────
    function render(t: number) {
      // clear (keep body bg underneath by alpha-clearing)
      ctx.clearRect(0, 0, w, h);

      // ── candlesticks ──
      for (const c of candles) {
        c.x -= c.speed;
        if (c.x + c.w < -30) {
          c.x = w + 30;
          c.body = 18 + Math.random() * 70;
          c.up = Math.random() > 0.5;
        }
        const color = c.up ? "34, 197, 94" : "239, 68, 68"; // green / red
        ctx.globalAlpha = c.opacity;
        // wick
        ctx.strokeStyle = `rgba(${color}, 1)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x + c.w / 2, c.y - c.body / 2 - c.wickTop);
        ctx.lineTo(c.x + c.w / 2, c.y + c.body / 2 + c.wickBot);
        ctx.stroke();
        // body
        ctx.fillStyle = `rgba(${color}, 1)`;
        ctx.fillRect(c.x, c.y - c.body / 2, c.w, c.body);
      }
      ctx.globalAlpha = 1;

      // ── price lines ──
      for (const p of priceLines) {
        p.offset += p.speed;
        const color =
          p.hue === "up"
            ? "74, 222, 128"
            : p.hue === "down"
            ? "248, 113, 113"
            : "156, 163, 175";
        ctx.strokeStyle = `rgba(${color}, ${p.opacity})`;
        ctx.lineWidth = p.thickness;
        ctx.beginPath();
        let first = true;
        for (let x = -10; x <= w + 10; x += 4) {
          const y =
            p.baseY +
            Math.sin((x + p.offset) * p.freq) * p.amp +
            Math.sin((x + p.offset) * p.freq * 2.3) * p.amp * 0.3;
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // subtle area fill below line for the brightest layer
        if (p.opacity > 0.18) {
          const grad = ctx.createLinearGradient(0, p.baseY - p.amp, 0, p.baseY + p.amp + 200);
          grad.addColorStop(0, `rgba(${color}, ${p.opacity * 0.5})`);
          grad.addColorStop(1, `rgba(${color}, 0)`);
          ctx.fillStyle = grad;
          ctx.lineTo(w + 10, h);
          ctx.lineTo(-10, h);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ── ticker tapes ──
      ctx.font = "600 13px 'IBM Plex Mono', monospace";
      ctx.textBaseline = "middle";
      for (const tk of tickers) {
        tk.offset -= tk.speed;
        // draw row bg line
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath();
        ctx.moveTo(0, tk.y - 18);
        ctx.lineTo(w, tk.y - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, tk.y + 18);
        ctx.lineTo(w, tk.y + 18);
        ctx.stroke();

        // render items repeated to fill
        let x = tk.offset;
        const gap = 80;
        let i = 0;
        let safety = 0;
        while (x < w + 200 && safety++ < 200) {
          const item = tk.items[i % tk.items.length];
          const up = item.change >= 0;
          const symW = ctx.measureText(item.symbol).width;
          const priceW = ctx.measureText(" " + item.price).width;
          const chgText = (up ? "+" : "") + item.change.toFixed(2) + "%";
          const chgW = ctx.measureText("  " + chgText).width;
          // symbol
          ctx.fillStyle = "rgba(229, 231, 235, 0.55)";
          ctx.fillText(item.symbol, x, tk.y);
          // price
          ctx.fillStyle = "rgba(156, 163, 175, 0.5)";
          ctx.fillText(" " + item.price, x + symW, tk.y);
          // change
          ctx.fillStyle = up ? "rgba(74, 222, 128, 0.75)" : "rgba(248, 113, 113, 0.75)";
          ctx.fillText("  " + chgText, x + symW + priceW, tk.y);

          x += symW + priceW + chgW + gap;
          i++;
          if (tk.offset < -(symW + priceW + chgW + gap) && i === 1) {
            tk.offset += symW + priceW + chgW + gap;
          }
        }
      }

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
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
