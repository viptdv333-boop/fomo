"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { getPastedFile, readClipboardImage } from "@/lib/clipboard-files";

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
        readClipboardImage().then((f) => f && onFile(f));
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
