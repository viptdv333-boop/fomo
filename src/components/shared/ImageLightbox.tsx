"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";

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
  const { t } = useT();

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

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          {/* the cross sits ON the picture (its top-right corner), not at the edge of the screen */}
          <div className="relative inline-flex max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || ""}
              className="max-h-[calc(100vh-2rem)] max-w-full object-contain select-none cursor-default"
              onContextMenu={(e) => e.preventDefault()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
