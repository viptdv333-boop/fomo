"use client";

import { useEffect, useState } from "react";

interface Props {
  src: string;
  alt?: string;
  className?: string;
}

/// Click a thumbnail to see it full-size in a modal instead of relying on
/// browser page-zoom. Doesn't fight the copy-protection already applied to
/// idea text (this only ever renders <img>, no selectable text).
export default function ImageLightbox({ src, alt, className }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ""}
        className={`${className || ""} cursor-zoom-in`}
        onClick={() => setOpen(true)}
      />

      {open && (
        <div
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
            aria-label="Закрыть"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt || ""}
            className="max-w-full max-h-full object-contain select-none"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      )}
    </>
  );
}
