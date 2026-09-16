"use client";

// Faint tiled FOMO logo behind paid idea text. Doesn't stop a screenshot
// (nothing on the web can), but marks the content as FOMO's own.
export default function Watermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute inset-0 z-10 opacity-[0.05] dark:opacity-[0.08]"
      style={{
        backgroundImage: "url('/logo-fomo.png')",
        backgroundRepeat: "repeat",
        backgroundSize: "160px auto",
      }}
    />
  );
}
