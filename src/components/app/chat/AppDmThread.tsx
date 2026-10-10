"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { useT } from "@/lib/i18n/client";
import { consumeSharedFile } from "@/lib/clipboard-files";
import { DM_EMOJI, DM_PIN_MAX, pinnedLine, quoteDraft } from "@/lib/app-chat";
import AttachMenu from "@/components/shared/AttachMenu";
import ComposerInput, { type ComposerHandle } from "@/components/shared/ComposerInput";
import AppIcon from "../AppIcon";
import AppSheet from "./AppSheet";
import AppMessageSheet, { type MsgAction } from "./AppMessageSheet";
import LookControls from "./LookControls";
import { useChatLook, useDmMarks } from "./useChatPrefs";
import { DraftChip, Messages, QuoteChip, ThreadBar, useUnreadAnchor, type ViewMsg } from "./AppThreadParts";
import type { Conversation } from "./useAppChatData";
import { sendOrQueue } from "@/lib/outbox/send";
import { useOutboxItems, useOutboxSent } from "@/lib/outbox/useOutbox";
import { pendingToView } from "@/lib/outbox/view";
import { isOnline } from "@/lib/offline/online";
import { showToast } from "@/lib/offline/toast";

interface DmMsg {
  id: string;
  text: string;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  createdAt: string;
  senderId: string;
  replyToId: string | null;
  isPinned: boolean;
  isDeleted: boolean;
  reactions: Record<string, string[]> | null;
  sender: { id: string; displayName: string; avatarUrl: string | null };
  replyTo: { id: string; text: string; sender: { displayName: string } } | null;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👎", "😮"] as const;
const POLL_MS = 10_000;

function toView(m: DmMsg, myId: string | undefined): ViewMsg {
  return {
    pinned: m.isPinned,
    ticks: m.senderId === myId,
    id: m.id,
    createdAt: m.createdAt,
    mine: m.senderId === myId,
    who: null,
    text: m.isDeleted ? "" : m.text,
    deleted: m.isDeleted,
    edited: false,
    reply: m.replyTo ? `${m.replyTo.sender.displayName}: ${m.replyTo.text.slice(0, 80)}${m.replyTo.text.length > 80 ? "…" : ""}` : null,
    file: m.fileUrl ? { url: m.fileUrl, name: m.fileName, type: m.fileType } : null,
    reactions: m.reactions,
  };
}

/**
 * A personal conversation in the app UI. Same endpoints and socket events as the site's «Личные» page (load / poll every 10 s / new_dm,
 * send with reply and attachment, delete, pin, react, read marks via fomo:unread-changed), drawn as the prototype's `on.thread` screen.
 */
export default function AppDmThread({
  convId,
  conv,
  online,
  onBack,
  onChanged,
  flash,
}: {
  convId: string;
  conv: Conversation | null;
  online: boolean;
  onBack: () => void;
  /** the conversation list should refresh (a message went out / was read) */
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  const { t } = useT();
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [messages, setMessages] = useState<DmMsg[]>([]);
  // where the reader stopped before opening (the first answer of the server; the later polls come after it marked the thread read)
  const [readAt, setReadAt] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<DmMsg | null>(null);
  const [pending, setPending] = useState<{ url: string; name: string; fileType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const marks = useDmMarks();
  const outboxTarget = `dm:${convId}`;
  const look = useChatLook();
  const loadContacts = useCallback(async () => {
    try {
      const r = await fetch("/api/contacts", { cache: "no-store" });
      if (r.ok) {
        const list = (await r.json()) as { user: { id: string } }[];
        setContactIds(new Set(Array.isArray(list) ? list.map((c) => c.user.id) : []));
      }
    } catch {
      /* the sheet then offers «В контакты» */
    }
  }, []);
  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);
  const composer = useRef<ComposerHandle>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/messages/conversations/${convId}/messages`, { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      setReadAt((prev) => (prev === undefined ? data.lastReadAt ?? null : prev));
      if (Array.isArray(data.messages)) setMessages(data.messages);
      // the server marks the conversation read when it is fetched: refresh the badges
      window.dispatchEvent(new Event("fomo:unread-changed"));
    } catch {
      /* the next poll retries */
    }
  }, [convId]);

  useEffect(() => {
    setMessages([]);
    setReplyTo(null);
    setPending(null);
    void load();
    const iv = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [convId, load]);

  useEffect(() => {
    if (!myId) return;
    const socket = getSocket(myId);
    socket.emit("join_conversation", convId);
    // any new message of the user's conversations arrives here: the thread simply reloads (the server filters by participant)
    const onNew = () => void load();
    socket.on("new_dm", onNew);
    return () => {
      socket.emit("leave_conversation", convId);
      socket.off("new_dm", onNew);
    };
  }, [convId, myId, load]);

  const uploadAttachment = useCallback(
    async (file: File) => {
      if (uploading) return;
      if (!isOnline()) {
        showToast(t("offline.attachHint"));
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        alert(t("chat2.fileTooLarge"));
        return;
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "messages");
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        if (!r.ok) throw new Error("upload");
        const { url, name, fileType } = await r.json();
        setPending({ url, name: name || file.name, fileType: fileType || "document" });
        composer.current?.focus();
      } catch {
        alert(t("chat2.fileUploadError"));
      }
      setUploading(false);
    },
    [uploading, t],
  );

  /* a file shared into the app ("Share → FOMO") is attached to the conversation that gets opened */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shared") !== "1") return;
    void consumeSharedFile().then((f) => f && uploadAttachment(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if ((!text.trim() && !pending) || sending || uploading) return;
    setSending(true);
    setError("");
    try {
      // offline outbox: sent now, or kept (IndexedDB) and sent when the network is back, once
      const file = pending ? { fileUrl: pending.url, fileName: pending.name, fileType: pending.fileType || "document" } : null;
      const r = await sendOrQueue({
        kind: "dm_message",
        target: outboxTarget,
        url: `/api/messages/conversations/${convId}/messages`,
        body: { text, replyToId: replyTo?.id, ...(file || {}) },
        preview: { text: text.trim(), ...(file || {}), reply: replyTo ? `${replyTo.sender.displayName}: ${replyTo.text.slice(0, 80)}` : undefined },
      });
      if (r.state === "sent") {
        setText("");
        setPending(null);
        setReplyTo(null);
        await load();
        onChanged();
      } else if (r.state === "queued") {
        setText("");
        setPending(null);
        setReplyTo(null);
        if (!isOnline()) showToast(t("offline.queuedToast"));
      } else setError(t("appui.chat.sendFailed"));
    } catch {
      setError(t("appui.chat.sendFailed"));
    }
    setSending(false);
  }

  async function patch(messageId: string, body: Record<string, unknown>) {
    await fetch(`/api/messages/conversations/${convId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    await load();
  }

  const serverIds = useMemo(() => new Set(messages.map((m) => m.id)), [messages]);
  const queued = useOutboxItems(outboxTarget, serverIds);
  useOutboxSent(outboxTarget, () => void load());
  const view = useMemo(() => [...messages.map((m) => toView(m, myId)), ...queued.map(pendingToView)], [messages, myId, queued]);
  const unreadFromId = useUnreadAnchor(view, readAt);
  const pinned = useMemo(() => pinnedLine(messages, t("chat2.file")), [messages, t]);
  const sel = selected ? messages.find((m) => m.id === selected) || null : null;

  const other = conv?.otherUser || null;
  const name = other?.displayName || (conv ? t("msg.deletedUser") : "…");
  const dnd = other?.dmEnabled === false;
  const sub = !other ? "" : dnd ? t("msg.doNotDisturb") : online ? t("msg.online") : t("msg.offline");

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(t("appui.chat.copied"));
    } catch {
      flash(t("appui.chat.copyFailed"));
    }
  };
  const actionsFor = (m: DmMsg): MsgAction[] => {
    const list: MsgAction[] = [
      { key: "reply", label: t("msg.reply"), icon: <AppIcon name="reply" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); setReplyTo(m); composer.current?.focus(); } },
      { key: "copy", label: t("msg.copy"), icon: <AppIcon name="copy" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); void copy(m.text); } },
      { key: "quote", label: t("msg.quote"), icon: <AppIcon name="quote" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); setText(quoteDraft(m.sender.displayName, m.text)); composer.current?.focus(); } },
      { key: "pin", label: m.isPinned ? t("msg.unpin") : t("msg.pin"), icon: <AppIcon name="pin" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); void patch(m.id, { action: "pin" }); } },
    ];
    if (m.senderId === myId) list.push({ key: "delete", label: t("common.delete"), icon: <AppIcon name="trash" size={18} stroke={1.8} />, danger: true, onSelect: () => { setSelected(null); void patch(m.id, { action: "delete" }); } });
    return list;
  };

  const isContact = !!other && contactIds.has(other.id);
  const pinnedHere = marks.pinned.includes(convId);
  const settingsRows = other
    ? [
        { key: "fav", label: marks.favorites.includes(other.id) ? t("msg.removeFav") : t("msg.addFav"), icon: <AppIcon name="star" size={18} stroke={1.8} />, value: marks.favorites.includes(other.id) ? "★" : undefined, onClick: () => marks.toggleFavorite(other.id) },
        { key: "pin", label: `${pinnedHere ? t("msg.unpin") : t("msg.pin")}${!pinnedHere && marks.pinned.length >= DM_PIN_MAX ? ` (${t("msg.max5")})` : ""}`, icon: <AppIcon name="pin" size={18} stroke={1.8} />, check: pinnedHere, onClick: () => { if (!marks.togglePinned(convId)) flash(t("msg.max5")); } },
        { key: "mute", label: marks.muted.includes(convId) ? t("msg.enableNotif") : t("msg.disableNotif"), icon: <AppIcon name={marks.muted.includes(convId) ? "bell" : "bellOff"} size={18} stroke={1.8} />, onClick: () => marks.toggleMuted(convId) },
        {
          key: "contact",
          label: isContact ? t("appui.chat.removeContact") : t("msg.addContact"),
          icon: <AppIcon name={isContact ? "userMinus" : "userPlus"} size={18} stroke={1.8} />,
          color: isContact ? "var(--app-red)" : undefined,
          onClick: async () => {
            await (isContact
              ? fetch(`/api/contacts?contactId=${encodeURIComponent(other.id)}`, { method: "DELETE" })
              : fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: other.id }) })
            ).catch(() => {});
            await loadContacts();
          },
        },
        { key: "profile", label: t("appui.chat.openProfile"), icon: <AppIcon name="user" size={18} stroke={1.8} />, chev: true, onClick: () => window.location.assign(`/profile/${other.id}`) },
      ]
    : [];

  return (
    <div className="ac ac-thread">
      <ThreadBar
        title={other ? <Link href={`/profile/${other.id}`}>{name}</Link> : name}
        sub={sub}
        subOn={!dnd && online}
        onBack={onBack}
        // the design keeps a bell spot on the right of every thread; a personal dialog has no per-dialog switch on the site, the spot stays empty so the title keeps its place
        right={
          <button type="button" className="ac-tbtn" aria-label={t("appui.chat.menu")} onClick={() => setSettings(true)}>
            <AppIcon name="dots" size={22} stroke={1.8} />
          </button>
        }
      />
      {pinned && (
        <div className="ac-pinned" role="note" aria-label={t("appui.chat.pinnedMsg")}>
          <span>{"\u{1F4CC}"}</span>
          <span>
            {t("msg.pinned")} {pinned}
          </span>
        </div>
      )}
      <Messages
        msgs={view}
        myId={myId}
        selectedId={selected}
        onTap={(m) => setSelected(m.id)}
        onReact={(id, emoji) => void patch(id, { action: "react", emoji })}
        editingId={null}
        editing={{ value: "", onChange: () => {}, onSubmit: () => {}, onCancel: () => {} }}
        empty={t("chat2.startDialog")}
        look={look}
        unreadFromId={unreadFromId}
        newLabel={t("chat2.newMessages")}
      />
      <form className="ac-composer" onSubmit={send}>
        {error && <div className="ac-draft" role="alert"><span>{error}</span></div>}
        {pending && (
          <DraftChip onRemove={() => setPending(null)} label={t("chat2.removeAttachment")}>
            {pending.fileType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pending.url} alt="" />
            ) : (
              "\u{1F4CE} "
            )}
            {t("appui.chat.draft", { name: pending.name })}
          </DraftChip>
        )}
        {replyTo && <QuoteChip who={`${t("chat2.replyFor")} ${replyTo.sender.displayName}`} text={replyTo.text.slice(0, 80) || `\u{1F4CE} ${t("chat2.file")}`} onRemove={() => setReplyTo(null)} label={t("common.cancel")} />}
        <div className="ac-crow">
          <AttachMenu appSheet onFile={uploadAttachment} uploading={uploading} title={t("msg.attachFile")} className="ac-clip">
            <AppIcon name="clip" size={22} stroke={1.8} />
          </AttachMenu>
          <div className="ac-inwrap" data-emoji="1">
            <ComposerInput ref={composer} value={text} onChange={setText} onSubmit={() => void send()} onFile={uploadAttachment} placeholder={replyTo ? t("msg.replyTo") : t("appui.chat.message")} className="ac-input" />
            <button type="button" className="ac-emobtn" aria-label={t("appui.chat.emoji")} onClick={() => setEmojiOpen(true)}>
              <AppIcon name="smile" size={20} stroke={1.8} />
            </button>
          </div>
          <button type="submit" className="ac-send" aria-label={t("report.send")} disabled={sending}>
            <AppIcon name="send" size={18} stroke={1.8} />
          </button>
        </div>
      </form>

      {sel && !sel.isDeleted && (
        <AppMessageSheet
          key={sel.id}
          author={sel.sender.displayName}
          preview={sel.text.slice(0, 80)}
          reactions={QUICK_REACTIONS}
          mine={Object.entries(sel.reactions || {}).filter(([, ids]) => ids.includes(myId || "")).map(([e]) => e)}
          actions={actionsFor(sel)}
          onReact={(e) => { setSelected(null); void patch(sel.id, { action: "react", emoji: e }); }}
          onClose={() => setSelected(null)}
        />
      )}
      {settings && (
        <AppSheet title={name} onClose={() => setSettings(false)} doneLabel={t("appui.chat.done")} height="full" sections={[{ key: "dlg", rows: settingsRows }]}>
          <LookControls look={look} />
          <div className="ac-sec">
            <div className="ac-secbox">
              <button type="button" className="ac-sr" onClick={() => look.setNotif(!look.notif)}>
                <div className="ac-sr-ico">
                  <AppIcon name="bell" size={18} stroke={1.8} />
                </div>
                <div className="ac-sr-body">
                  <div className="ac-sr-txt">
                    <div className="ac-sr-label">{t("msg.notifications")}</div>
                  </div>
                  <div className="ac-tg" data-on={look.notif ? "1" : undefined} role="switch" aria-checked={look.notif}>
                    <div />
                  </div>
                </div>
              </button>
            </div>
          </div>
        </AppSheet>
      )}
      {emojiOpen && (
        <AppSheet
          title={t("appui.chat.emoji")}
          onClose={() => setEmojiOpen(false)}
          doneLabel={t("appui.chat.done")}
          height="full"
          segs={DM_EMOJI.map((c, i) => ({ key: c.key, label: t(c.labelKey), on: i === emojiCat, onClick: () => setEmojiCat(i) }))}
        >
          <div className="ac-emogrid">
            {DM_EMOJI[emojiCat].emojis.map((e) => (
              <button key={e} type="button" onClick={() => { setText((v) => v + e); setEmojiOpen(false); composer.current?.focus(); }}>
                {e}
              </button>
            ))}
          </div>
        </AppSheet>
      )}
    </div>
  );
}
