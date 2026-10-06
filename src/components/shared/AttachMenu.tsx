"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { readClipboardImageDetailed } from "@/lib/clipboard-files";
import AppIcon from "@/components/app/AppIcon";
import AppSheet from "@/components/app/chat/AppSheet";

const MEDIA = "image/*,video/*";
const DOCS =
  ".pdf,.doc,.docx,.txt,.xls,.xlsx,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

interface Props {
  onFile: (file: File) => void;
  uploading?: boolean;
  disabled?: boolean;
  /** Offer documents (pdf, docx, txt…) next to photos and video. */
  docs?: boolean;
  title?: string;
  className?: string;
  /** App UI: always the design's «Вложение» sheet (gallery, camera, files, clipboard), also with a mouse. */
  appSheet?: boolean;
  children: ReactNode;
}

function stamped(blob: Blob): File {
  const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return new File([blob], `screenshot-${stamp}.${ext}`, { type: blob.type || "image/png", lastModified: Date.now() });
}

/**
 * Paperclip button. On a computer it opens the normal file picker. On a phone it opens a bottom sheet with
 * separate entries — gallery, camera, files, clipboard — because one <input accept="image/*,.pdf"> makes Android
 * offer only "Camera / Files" and no gallery.
 */
export default function AttachMenu({ onFile, uploading, disabled, docs = true, title, className, appSheet, children }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [note, setNote] = useState("");
  const all = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setOpen(false);
    if (f) onFile(f);
  };

  const fromClipboard = async () => {
    setNote("");
    const { file, why } = await readClipboardImageDetailed();
    if (file) {
      setOpen(false);
      onFile(file);
    } else setNote(`${t("attach.clipboardEmpty")}: ${why}`);
  };

  const canClipboard = true; // always offered: when the browser refuses, the real reason is shown under the list
  const itemCls = "flex items-center gap-3 w-full px-4 py-3.5 text-left text-[15px] text-gray-800 dark:text-gray-100 active:bg-gray-100 dark:active:bg-gray-800 cursor-pointer";
  const icon = (d: string) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-green-600" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );

  return (
    <>
      <input ref={all} type="file" className="hidden" accept={docs ? `${MEDIA},${DOCS}` : MEDIA} onChange={picked} />
      <input ref={gallery} type="file" className="hidden" accept={MEDIA} onChange={picked} />
      <input ref={camera} type="file" className="hidden" accept="image/*" capture="environment" onChange={picked} />
      <input ref={files} type="file" className="hidden" accept={DOCS} onChange={picked} />
      <button
        type="button"
        onClick={() => {
          setNote("");
          if (coarse || appSheet) setOpen(true);
          else all.current?.click();
        }}
        disabled={disabled || uploading}
        title={title}
        className={className}
      >
        {uploading ? <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin" /> : children}
      </button>
      {open && appSheet && (
        <AppSheet
          title={t("appui.chat.attach")}
          onClose={() => setOpen(false)}
          doneLabel={t("appui.chat.done")}
          intro={note ? <span style={{ color: "#d97706" }}>{note}</span> : undefined}
          sections={[
            {
              key: "attach",
              footer: t("appui.chat.attachNote"),
              rows: [
                { key: "gallery", label: t("attach.gallery"), icon: <AppIcon name="image" size={18} stroke={1.8} />, onClick: () => gallery.current?.click() },
                { key: "camera", label: t("attach.camera"), icon: <AppIcon name="camera" size={18} stroke={1.8} />, onClick: () => camera.current?.click() },
                ...(docs ? [{ key: "files", label: t("attach.files"), icon: <AppIcon name="file" size={18} stroke={1.8} />, onClick: () => files.current?.click() }] : []),
                { key: "clip", label: t("attach.clipboard"), icon: <AppIcon name="clipb" size={18} stroke={1.8} />, onClick: fromClipboard },
              ],
            },
          ]}
        />
      )}
      {open &&
        !appSheet &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white dark:bg-gray-900 shadow-2xl pb-[env(safe-area-inset-bottom)]">
              <div className="flex justify-center pt-2 pb-1">
                <span className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <button type="button" className={itemCls} onClick={() => gallery.current?.click()}>
                {icon("M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9.5h.01")}
                {t("attach.gallery")}
              </button>
              <button type="button" className={itemCls} onClick={() => camera.current?.click()}>
                {icon("M4 8h3l1.5-2h7L17 8h3v11H4zM12 16a3 3 0 100-6 3 3 0 000 6z")}
                {t("attach.camera")}
              </button>
              {docs && (
                <button type="button" className={itemCls} onClick={() => files.current?.click()}>
                  {icon("M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5")}
                  {t("attach.files")}
                </button>
              )}
              {canClipboard && (
                <button type="button" className={itemCls} onClick={fromClipboard}>
                  {icon("M9 4h6v3H9zM7 5H5v16h14V5h-2")}
                  {t("attach.clipboard")}
                </button>
              )}
              {note && <p className="px-4 pb-2 text-xs text-amber-600">{note}</p>}
              <button type="button" className={`${itemCls} justify-center text-gray-500 border-t border-gray-100 dark:border-gray-800`} onClick={() => setOpen(false)}>
                {t("attach.cancel")}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
