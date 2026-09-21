"use client";

// FOMO logo centered behind paid-channel content. Doesn't stop a screenshot
// (nothing on the web can), but marks the content as FOMO's own.
// "card" fits a short list card, "page" a full idea page.
export default function Watermark({ variant = "page" }: { variant?: "card" | "page" }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-fomo.png"
        alt=""
        className={
          (variant === "card" ? "h-[80%] w-auto max-w-[60%] object-contain" : "w-[70%] max-w-md") +
          " opacity-[0.12] dark:opacity-[0.16] dark:invert"
        }
      />
    </div>
  );
}

// Small visible FOMO mark for idea cards on the board.
export function FomoMark({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-fomo.png"
      alt="FOMO"
      className={`h-4 w-auto select-none opacity-70 dark:invert ${className}`}
      draggable={false}
    />
  );
}
