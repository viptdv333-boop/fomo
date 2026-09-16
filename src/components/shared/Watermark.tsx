"use client";

// One large, legible FOMO logo centered behind the idea's full text.
// Doesn't stop a screenshot (nothing on the web can), but marks the
// content as FOMO's own.
export default function Watermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-fomo.png"
        alt=""
        className="w-[70%] max-w-md opacity-[0.12] dark:opacity-[0.16] dark:invert"
      />
    </div>
  );
}
