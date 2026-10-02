"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { getPastedFile, maybeOfferClipboardImage, readClipboardImage } from "@/lib/clipboard-files";

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSubmit?: () => void;
  /** A screenshot / photo pasted into the field (Ctrl+V, long-press → Paste, keyboard clipboard). */
  onFile: (file: File) => void;
  placeholder?: string;
  /** Only images count as pasted files (comments under ideas). */
  imagesOnly?: boolean;
  /** Border, radius, padding, colours — the base already handles growth (max 2 lines) and the placeholder. */
  className?: string;
}

export interface ComposerHandle {
  focus(): void;
}

/** Short message above the bottom edge, for cases where the browser silently gives us nothing. */
function toast(text: string) {
  if (typeof document === "undefined") return;
  const d = document.createElement("div");
  d.textContent = text;
  d.setAttribute("role", "status");
  d.style.cssText =
    "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);max-width:90vw;z-index:200;padding:10px 14px;border-radius:12px;background:#111827;color:#fff;font-size:13px;line-height:1.3;box-shadow:0 4px 16px rgba(0,0,0,.35)";
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}

function textOf(el: HTMLElement): string {
  let text = "";
  el.childNodes.forEach((node, i) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent || "";
    else if (node instanceof HTMLBRElement) text += "\n";
    else if (node instanceof HTMLElement) {
      if (i > 0 && (node.tagName === "DIV" || node.tagName === "P")) text += "\n";
      text += node.textContent || "";
    }
  });
  return text;
}

/**
 * Plain-text message field that accepts a pasted image. A real <input> cannot receive an image from the Android
 * keyboard clipboard or the long-press "Paste" menu; a contentEditable can, so every composer uses this one.
 * It grows to two lines and then scrolls, so the field keeps its shape.
 */
const ComposerInput = forwardRef<ComposerHandle, Props>(function ComposerInput({ value, onChange, onSubmit, onFile, placeholder, imagesOnly, className = "" }, ref) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => el.current?.focus() }));

  // external changes (cleared after sending, emoji appended, "@name, " inserted) → DOM
  useEffect(() => {
    const node = el.current;
    if (!node || textOf(node) === value) return;
    node.textContent = value;
    if (value && document.activeElement === node) {
      const r = document.createRange();
      r.selectNodeContents(node);
      r.collapse(false);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
  }, [value]);

  const handleInput = () => {
    const node = el.current;
    if (!node) return;
    // an image dropped into the field natively becomes a draft attachment instead of staying in the text
    node.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      img.remove();
      if (/^(data|blob):/.test(src)) {
        fetch(src)
          .then((r) => r.blob())
          .then((blob) => {
            if (blob.type.startsWith("image/")) onFile(new File([blob], `screenshot-${Date.now()}.${blob.type === "image/jpeg" ? "jpg" : "png"}`, { type: blob.type }));
          })
          .catch(() => {});
      }
    });
    onChange(textOf(node));
  };

  return (
    <div
      ref={el}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      enterKeyHint="send"
      data-placeholder={placeholder}
      onInput={handleInput}
      onFocus={() => maybeOfferClipboardImage(onFile)}
      onPaste={(e) => {
        e.preventDefault();
        const file = getPastedFile(e, imagesOnly ? "image" : "any");
        if (file) {
          onFile(file);
          return;
        }
        const text = e.clipboardData.getData("text/plain");
        if (text) {
          document.execCommand("insertText", false, text);
          handleInput();
          return;
        }
        // image-only clipboard that the paste event does not expose: ask the clipboard directly (the paste is a user gesture)
        readClipboardImage().then((f) => {
          if (f) onFile(f);
          else toast("Браузер не передал картинку из буфера. Нажмите скрепку → «Вставить из буфера обмена» или «Галерея»");
        });
      }}
      onBeforeInput={(e) => {
        // some mobile browsers deliver a pasted / keyboard-inserted image as an input event with files, not a paste event
        const dt = (e.nativeEvent as InputEvent).dataTransfer;
        const f = dt?.files?.[0];
        if (f && (!imagesOnly || f.type.startsWith("image/"))) {
          e.preventDefault();
          onFile(f);
        }
      }}
      onDrop={(e) => {
        const f = e.dataTransfer.files?.[0];
        if (f && (!imagesOnly || f.type.startsWith("image/"))) {
          e.preventDefault();
          onFile(f);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      }}
      className={`min-w-0 text-sm leading-5 whitespace-pre-wrap break-words overflow-y-auto max-h-[62px] focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-500 ${className}`}
    />
  );
});

export default ComposerInput;
