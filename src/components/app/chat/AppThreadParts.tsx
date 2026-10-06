"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { clockLabel, messageHtml, withDaySeparators } from "@/lib/app-chat";
import AppIcon from "../AppIcon";

/** A message of either kind (болталка room or personal conversation) in the shape the bubbles draw. */
export interface ViewMsg {
  id: string;
  createdAt: string;
  mine: boolean;
  /** name printed above the text (the design prints it for the others in a room; not in a dialog) */
  who: string | null;
  text: string;
  deleted: boolean;
  edited: boolean;
  /** «Name: quoted text…» */
  reply: string | null;
  file: { url: string; name: string | null; type: string | null } | null;
  reactions: Record<string, string[]> | null;
}

/** Header of a thread: «‹ Назад», title (emoji + name) with a line under it, the bell (and extra buttons) on the right. */
export function ThreadBar({ title, sub, subOn, onBack, right }: { title: ReactNode; sub?: string; subOn?: boolean; onBack: () => void; right?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="ac-tbar">
      <button type="button" className="ac-tback" onClick={onBack} aria-label={t("common.back")}>
        <AppIcon name="chevL" size={22} stroke={1.8} />
        <span>{t("common.back")}</span>
      </button>
      <div className="ac-tcenter">
        <div className="ac-tname">{title}</div>
        {sub ? (
          <div className="ac-tsub" data-tone={subOn ? "on" : undefined}>
            {sub}
          </div>
        ) : null}
      </div>
      <div className="ac-tright">{right}</div>
    </div>
  );
}

export function Bubble({
  m,
  myId,
  selected,
  onTap,
  onReact,
  editing,
}: {
  m: ViewMsg;
  myId: string | undefined;
  selected: boolean;
  onTap: () => void;
  onReact: (emoji: string) => void;
  editing?: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void } | null;
}) {
  const { t } = useT();
  const reacts = m.deleted ? [] : Object.entries(m.reactions || {}).filter(([, ids]) => ids.length > 0);
  const interactive = (el: EventTarget | null) => el instanceof Element && !!el.closest("a,button,video,input,textarea,[data-noopen]");
  return (
    <div className="ac-mrow" data-mine={m.mine ? "1" : undefined}>
      <div
        className="ac-bubble"
        data-sel={selected ? "1" : undefined}
        onClick={(e) => {
          if (m.deleted || editing || interactive(e.target)) return;
          if (typeof window !== "undefined" && window.getSelection()?.toString()) return; // selecting text, not tapping
          onTap();
        }}
      >
        {m.who && <div className="ac-who">{m.who}</div>}
        {m.reply && <div className="ac-reply">{m.reply}</div>}
        {m.deleted ? (
          <div className="ac-text ac-deleted">{t("msg.deleted")}</div>
        ) : editing ? (
          <div className="ac-edit">
            <input
              autoFocus
              value={editing.value}
              onChange={(e) => editing.onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editing.onSubmit();
                }
                if (e.key === "Escape") editing.onCancel();
              }}
            />
            <button type="button" onClick={editing.onSubmit}>
              {t("common.save")}
            </button>
            <button type="button" onClick={editing.onCancel}>
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <>
            {m.file && <FileBlock file={m.file} fallback={t("chat2.file")} />}
            {m.text && <div className="ac-text" dangerouslySetInnerHTML={{ __html: messageHtml(m.text) }} />}
          </>
        )}
        <div className="ac-meta">
          {reacts.map(([emoji, ids]) => (
            <button key={emoji} type="button" className="ac-react" data-mine={myId && ids.includes(myId) ? "1" : undefined} onClick={() => onReact(emoji)}>
              {emoji} {ids.length}
            </button>
          ))}
          {m.edited && !m.deleted && <span>{t("appui.chat.edited")}</span>}
          <span>{clockLabel(m.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function FileBlock({ file, fallback }: { file: NonNullable<ViewMsg["file"]>; fallback: string }) {
  if (file.type === "image")
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" data-noopen>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ac-media" src={file.url} alt={file.name || "image"} />
      </a>
    );
  if (file.type === "video") return <video className="ac-media" src={file.url} controls data-noopen />;
  return (
    <a className="ac-file" href={file.url} target="_blank" rel="noopener noreferrer">
      {"\u{1F4CE}"} {file.name || fallback}
    </a>
  );
}

/**
 * The scrolling message column: day separators (the design's «Сегодня» pill) between days, bubbles, and the stick-to-the-bottom behaviour:
 * the first load lands on the newest message, later arrivals scroll only when the reader is already near the bottom or sent the message.
 */
export function Messages({
  msgs,
  myId,
  selectedId,
  onTap,
  onReact,
  editingId,
  editing,
  empty,
  top,
}: {
  msgs: ViewMsg[];
  myId: string | undefined;
  selectedId: string | null;
  onTap: (m: ViewMsg) => void;
  onReact: (id: string, emoji: string) => void;
  editingId: string | null;
  editing: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void };
  empty: string;
  top?: ReactNode;
}) {
  const { locale } = useT();
  const box = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);
  const items = withDaySeparators(msgs, locale);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !msgs.length) return;
    const last = msgs[msgs.length - 1];
    const first = lastId.current === null;
    if (last.id === lastId.current) return;
    lastId.current = last.id;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (first || near || last.mine) el.scrollTo({ top: el.scrollHeight, behavior: first ? "auto" : "smooth" });
  }, [msgs]);

  // images and the soft keyboard change the height after the first paint: keep the bottom in view on the first load
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let stick = true;
    const onScroll = () => {
      stick = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const ro = new ResizeObserver(() => {
      if (stick) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="ac-msgs" ref={box}>
      {top}
      {msgs.length === 0 && <div className="ac-empty">{empty}</div>}
      {items.map((it) =>
        it.kind === "day" ? (
          <div key={it.key} className="ac-day">
            {it.label}
          </div>
        ) : (
          <Bubble
            key={it.key}
            m={it.msg}
            myId={myId}
            selected={selectedId === it.msg.id}
            onTap={() => onTap(it.msg)}
            onReact={(e) => onReact(it.msg.id, e)}
            editing={editingId === it.msg.id ? editing : null}
          />
        ),
      )}
    </div>
  );
}

/** A tappable composer chip (draft attachment, quoted message): icon / thumbnail, one line of text, a remove cross. */
export function DraftChip({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  return (
    <div className="ac-draft">
      <span>{children}</span>
      <button type="button" onClick={onRemove} aria-label={label}>
        <AppIcon name="x" size={14} stroke={2} />
      </button>
    </div>
  );
}

export function QuoteChip({ who, text, onRemove, label }: { who: string; text: string; onRemove: () => void; label: string }) {
  return (
    <div className="ac-quote">
      <div>
        <b>{who}</b>
        <span>{text}</span>
      </div>
      <button type="button" onClick={onRemove} aria-label={label}>
        <AppIcon name="x" size={14} stroke={2} />
      </button>
    </div>
  );
}
