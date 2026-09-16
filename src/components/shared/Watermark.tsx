"use client";

// Tiled, low-opacity link overlay printed across paid idea text. Doesn't stop
// a screenshot (nothing on the web can), but makes a leaked screenshot
// traceable back to the idea it was taken from — the same idea used by paid
// PDF/video platforms.
export default function Watermark({ url }: { url: string }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='140'>
    <text x='10' y='75' transform='rotate(-28 160 70)' font-size='12' fill='rgba(120,120,120,0.5)' font-family='sans-serif'>${url}</text>
  </svg>`;

  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute inset-0 z-10"
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}
