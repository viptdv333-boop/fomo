"use client";

import { useMemo, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { useT } from "@/lib/i18n/client";
import AttachMenu from "@/components/shared/AttachMenu";
import AppIcon from "../AppIcon";
import AppSheet from "./AppSheet";
import AppMessageSheet, { type MsgAction } from "./AppMessageSheet";
import { DraftChip, Messages, QuoteChip, ThreadBar, type ViewMsg } from "./AppThreadParts";

/** A болталка message as /api/chat/messages returns it. */
export interface RoomMsg {
  id: string;
  text: string;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  isEdited?: boolean;
  isDeleted?: boolean;
  isPinned?: boolean;
  createdAt: string;
  reactions: Record<string, string[]> | null;
  replyToId: string | null;
  replyTo: { id: string; text: string; user: { displayName: string } } | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

export interface EmojiCategory {
  key: string;
  label: string;
  emojis: readonly string[];
}

/** Everything ChatRoom (the site's chat logic, unchanged) hands over so the app UI can draw the thread with its own look. */
export interface RoomThreadApi {
  roomName: string;
  isClosed?: boolean;
  isArchived?: boolean;
  participants: string;
  notifEnabled: boolean;
  onToggleBell: () => void;
  isAdmin: boolean;
  isRoomArchived: boolean;
  onAdminAction: (action: "archive" | "unarchive" | "open" | "close" | "delete") => void;
  messages: RoomMsg[];
  myId: string | undefined;
  quickReactions: readonly string[];
  onReact: (messageId: string, emoji: string) => void;
  onReply: (m: RoomMsg) => void;
  onMention: (name: string) => void;
  onStartEdit: (m: RoomMsg) => void;
  onDelete: (messageId: string) => void;
  editingId: string | null;
  editText: string;
  onEditText: (v: string) => void;
  onSubmitEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  replyTo: RoomMsg | null;
  onClearReply: () => void;
  pending: { url: string; name: string; fileType: string } | null;
  onClearPending: () => void;
  uploading: boolean;
  onFile: (f: File) => void;
  mentionUsers: { id: string; displayName: string }[];
  onPickMention: (name: string) => void;
  inputRef: RefObject<HTMLDivElement | null>;
  onInput: () => void;
  onPaste: (e: ClipboardEvent<HTMLDivElement>) => void;
  onFocusInput: () => void;
  onSend: (e: FormEvent) => void;
  emoji: EmojiCategory[];
  onInsertEmoji: (emoji: string) => void;
  onBack: () => void;
  /** a profile opens the personal conversation with its author */
  onOpenAuthor?: (userId: string) => void;
}

function toView(m: RoomMsg, myId: string | undefined, quoteSuffix: string): ViewMsg {
  const mine = m.user.id === myId;
  return {
    id: m.id,
    createdAt: m.createdAt,
    mine,
    who: mine ? null : m.user.displayName,
    text: m.text,
    deleted: !!m.isDeleted,
    edited: !!m.isEdited,
    reply: m.replyTo ? `${m.replyTo.user.displayName}: ${m.replyTo.text.slice(0, 80)}${m.replyTo.text.length > 80 ? quoteSuffix : ""}` : null,
    file: m.fileUrl ? { url: m.fileUrl, name: m.fileName, type: m.fileType } : null,
    reactions: m.reactions,
  };
}

/** The app UI's thread of a болталка room / private group: the prototype's `on.thread` screen over ChatRoom's real state. */
export default function AppRoomThread({ api }: { api: RoomThreadApi }) {
  const { t } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);

  const view = useMemo(() => api.messages.map((m) => toView(m, api.myId, "…")), [api.messages, api.myId]);
  const pinned = useMemo(() => {
    for (let i = api.messages.length - 1; i >= 0; i--) {
      const m = api.messages[i];
      if (m.isPinned && !m.isDeleted && m.text) return m;
    }
    return null;
  }, [api.messages]);
  const sel = selected ? api.messages.find((m) => m.id === selected) || null : null;
  const closed = api.isClosed || api.isArchived;

  const actionsFor = (m: RoomMsg): MsgAction[] => {
    const list: MsgAction[] = [
      { key: "reply", label: t("msg.reply"), icon: <AppIcon name="chevL" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); api.onReply(m); } },
      { key: "mention", label: t("chat2.mention"), icon: <b style={{ fontSize: 16 }}>@</b>, onSelect: () => { setSelected(null); api.onMention(m.user.displayName); } },
    ];
    if (m.user.id === api.myId) {
      list.push(
        { key: "edit", label: t("common.edit"), icon: <AppIcon name="pen" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); api.onStartEdit(m); } },
        { key: "delete", label: t("common.delete"), icon: <AppIcon name="x" size={18} stroke={1.8} />, danger: true, onSelect: () => { setSelected(null); api.onDelete(m.id); } },
      );
    }
    return list;
  };

  const adminRows = api.isAdmin
    ? [
        { key: "arch", label: api.isRoomArchived ? t("idea.unarchive") : t("chat2.toArchive"), onClick: () => { setMenu(false); api.onAdminAction(api.isRoomArchived ? "unarchive" : "archive"); } },
        { key: "close", label: api.isClosed ? t("chat2.openChat") : t("chat2.closeChat"), onClick: () => { setMenu(false); api.onAdminAction(api.isClosed ? "open" : "close"); } },
        { key: "del", label: t("chat2.deleteChat"), color: "var(--app-red)", onClick: () => { setMenu(false); api.onAdminAction("delete"); } },
      ]
    : [];

  return (
    <div className="ac ac-thread">
      <ThreadBar
        title={api.roomName}
        sub={api.participants}
        onBack={api.onBack}
        right={
          <>
            {api.isAdmin && (
              <button type="button" className="ac-tbtn" aria-label={t("appui.chat.menu")} onClick={() => setMenu(true)}>
                <AppIcon name="dots" size={22} stroke={1.8} />
              </button>
            )}
            <button type="button" className="ac-tbtn" data-on={api.notifEnabled ? "1" : undefined} aria-pressed={api.notifEnabled} aria-label={api.notifEnabled ? t("chat2.notifOn") : t("chat2.notifOff")} onClick={api.onToggleBell}>
              <AppIcon name="bell" size={22} stroke={1.8} />
            </button>
          </>
        }
      />
      {pinned && (
        <button type="button" className="ac-pinned" aria-label={t("appui.chat.pinnedMsg")} onClick={() => setSelected(pinned.id)}>
          <span>{"\u{1F4CC}"}</span>
          <span>{pinned.text}</span>
        </button>
      )}
      <Messages
        msgs={view}
        myId={api.myId}
        selectedId={selected}
        onTap={(m) => setSelected(m.id)}
        onReact={api.onReact}
        editingId={api.editingId}
        editing={{ value: api.editText, onChange: api.onEditText, onSubmit: () => api.editingId && api.onSubmitEdit(api.editingId), onCancel: api.onCancelEdit }}
        empty={t("chat.notFound")}
      />

      {closed ? (
        <div className="ac-closed">{api.isArchived ? t("chat2.roomArchived") : t("chat2.roomClosed")}</div>
      ) : (
        <form className="ac-composer" onSubmit={api.onSend}>
          {api.pending && (
            <DraftChip onRemove={api.onClearPending} label={t("chat2.removeAttachment")}>
              {api.pending.fileType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={api.pending.url} alt="" />
              ) : (
                "\u{1F4CE} "
              )}
              {t("appui.chat.draft", { name: api.pending.name })}
            </DraftChip>
          )}
          {api.replyTo && <QuoteChip who={`${t("chat2.replyFor")} ${api.replyTo.user.displayName}`} text={api.replyTo.text} onRemove={api.onClearReply} label={t("common.cancel")} />}
          {api.mentionUsers.length > 0 && (
            <div className="ac-mentions">
              {api.mentionUsers.slice(0, 8).map((u) => (
                <button key={u.id} type="button" onClick={() => api.onPickMention(u.displayName)}>
                  @{u.displayName}
                </button>
              ))}
            </div>
          )}
          <div className="ac-crow">
            <AttachMenu appSheet onFile={api.onFile} uploading={api.uploading} title={t("msg.attachFile")} className="ac-clip">
              <AppIcon name="clip" size={22} stroke={1.8} />
            </AttachMenu>
            <div className="ac-inwrap" data-emoji="1">
              <div
                ref={api.inputRef as RefObject<HTMLDivElement>}
                className="ac-input"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label={t("appui.chat.message")}
                data-placeholder={t("appui.chat.message")}
                onInput={api.onInput}
                onFocus={api.onFocusInput}
                onPaste={api.onPaste}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    api.onSend(e as unknown as FormEvent);
                  }
                }}
              />
              <button type="button" className="ac-emobtn" aria-label={t("appui.chat.emoji")} onClick={() => setEmojiOpen(true)}>
                <AppIcon name="smile" size={20} stroke={1.8} />
              </button>
            </div>
            <button type="submit" className="ac-send" aria-label={t("report.send")}>
              <AppIcon name="send" size={18} stroke={1.8} />
            </button>
          </div>
        </form>
      )}

      {sel && !sel.isDeleted && (
        <AppMessageSheet
          key={sel.id}
          author={sel.user.displayName}
          preview={sel.text.slice(0, 80)}
          reactions={api.quickReactions}
          mine={Object.entries(sel.reactions || {}).filter(([, ids]) => ids.includes(api.myId || "")).map(([e]) => e)}
          actions={actionsFor(sel)}
          onReact={(e) => { setSelected(null); api.onReact(sel.id, e); }}
          onClose={() => setSelected(null)}
        />
      )}
      {menu && <AppSheet title={t("appui.chat.menu")} onClose={() => setMenu(false)} doneLabel={t("appui.chat.done")} sections={[{ key: "admin", rows: adminRows }]} />}
      {emojiOpen && (
        <AppSheet
          title={t("appui.chat.emoji")}
          onClose={() => setEmojiOpen(false)}
          doneLabel={t("appui.chat.done")}
          height="full"
          segs={api.emoji.map((c, i) => ({ key: c.key, label: c.label, on: i === emojiCat, onClick: () => setEmojiCat(i) }))}
        >
          <div className="ac-emogrid">
            {api.emoji[emojiCat].emojis.map((e) => {
              const custom = e.startsWith(":") && e.endsWith(":");
              return (
                <button key={e} type="button" onClick={() => { api.onInsertEmoji(e); setEmojiOpen(false); }}>
                  {custom ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/icons/instruments/${e.slice(1, -1)}.svg`} alt={e.slice(1, -1)} />
                  ) : (
                    e
                  )}
                </button>
              );
            })}
          </div>
        </AppSheet>
      )}
    </div>
  );
}
