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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white text-2xl leading-none hover:bg-white/25"
            style={{ top: "max(1rem, env(safe-area-inset-top))" }}
            aria-label={t("common.close")}
            title={t("common.close")}
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
        </div>,
        document.body
      )}
    </>
  );
}
