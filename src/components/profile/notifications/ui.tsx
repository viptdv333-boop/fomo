"use client";

import type { ChannelId } from "@/lib/notification-events";

/** Slider-style switch. A real <button role="switch"> so it works with keyboard and screen readers. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  title,
  mixed,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  title?: string;
  /** some, not all (master switches) */
  mixed?: boolean;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? { track: "h-5 w-9", knob: "h-3.5 w-3.5", on: "translate-x-[18px]", off: "translate-x-[3px]", mid: "translate-x-[10px]" } : { track: "h-6 w-11", knob: "h-[18px] w-[18px]", on: "translate-x-[23px]", off: "translate-x-[3px]", mid: "translate-x-[13px]" };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${dim.track} ${
        checked ? "bg-green-600" : mixed ? "bg-green-400/60" : "bg-gray-300 dark:bg-gray-600"
      } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block rounded-full bg-white shadow transition-transform ${dim.knob} ${checked ? dim.on : mixed ? dim.mid : dim.off}`}
      />
    </button>
  );
}

const BRAND: Record<ChannelId, { bg: string; fg: string; glyph: React.ReactNode }> = {
  inapp: {
    bg: "bg-gray-700 dark:bg-gray-500",
    fg: "text-white",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  webpush: {
    bg: "bg-indigo-600",
    fg: "text-white",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
    ),
  },
  email: {
    bg: "bg-amber-500",
    fg: "text-white",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  telegram: {
    bg: "bg-[#229ED9]",
    fg: "text-white",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    ),
  },
  whatsapp: {
    bg: "bg-[#25D366]",
    fg: "text-white",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        <path d="M9 10c.5 2 2 3.500 4 4l1.500-1.200-1.800-1-.9.700c-.7-.3-1.400-1-1.700-1.700l.7-.9-1-1.800L9 10Z" />
      </svg>
    ),
  },
  max: {
    bg: "bg-gradient-to-br from-[#33B1FF] to-[#7B3FF2]",
    fg: "text-white",
    glyph: <span className="font-black leading-none tracking-tight" style={{ fontSize: "0.31em" }}>MAX</span>,
  },
  vk: {
    bg: "bg-[#0077FF]",
    fg: "text-white",
    glyph: <span className="font-black leading-none" style={{ fontSize: "0.36em" }}>VK</span>,
  },
  webhook: {
    bg: "bg-slate-600",
    fg: "text-white",
    glyph: (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
      </svg>
    ),
  },
};

export function ChannelIcon({ channel, size = 36 }: { channel: ChannelId; size?: number }) {
  const b = BRAND[channel];
  // fontSize = icon size, so the text glyphs (MAX, VK) scale with it via em.
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${b.bg} ${b.fg}`}
    >
      {b.glyph}
    </span>
  );
}
