"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { useT } from "@/lib/i18n/client";
import { consumeSharedFile } from "@/lib/clipboard-files";
import { DM_EMOJI } from "@/lib/app-chat";
import AttachMenu from "@/components/shared/AttachMenu";
import ComposerInput, { type ComposerHandle } from "@/components/shared/ComposerInput";
import AppIcon from "../AppIcon";
import AppSheet from "./AppSheet";
import AppMessageSheet, { type MsgAction } from "./AppMessageSheet";
import { DraftChip, Messages, QuoteChip, ThreadBar, type ViewMsg } from "./AppThreadParts";
import type { Conversation } from "./useAppChatData";

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
}: {
  convId: string;
  conv: Conversation | null;
  online: boolean;
  onBack: () => void;
  /** the conversation list should refresh (a message went out / was read) */
  onChanged: () => void;
}) {
  const { t } = useT();
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [messages, setMessages] = useState<DmMsg[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<DmMsg | null>(null);
  const [pending, setPending] = useState<{ url: string; name: string; fileType: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [error, setError] = useState("");
  const composer = useRef<ComposerHandle>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/messages/conversations/${convId}/messages`, { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
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
      const r = await fetch(`/api/messages/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          replyToId: replyTo?.id,
          ...(pending && { fileUrl: pending.url, fileName: pending.name, fileType: pending.fileType || "document" }),
        }),
      });
      if (r.ok) {
        setText("");
        setPending(null);
        setReplyTo(null);
        await load();
        onChanged();
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

  const view = useMemo(() => messages.map((m) => toView(m, myId)), [messages, myId]);
  const pinned = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].isPinned && !messages[i].isDeleted && messages[i].text) return messages[i];
    return null;
  }, [messages]);
  const sel = selected ? messages.find((m) => m.id === selected) || null : null;

  const other = conv?.otherUser || null;
  const name = other?.displayName || (conv ? t("msg.deletedUser") : "…");
  const dnd = other?.dmEnabled === false;
  const sub = !other ? "" : dnd ? t("msg.doNotDisturb") : online ? t("msg.online") : t("msg.offline");

  const actionsFor = (m: DmMsg): MsgAction[] => {
    const list: MsgAction[] = [
      { key: "reply", label: t("msg.reply"), icon: <AppIcon name="chevL" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); setReplyTo(m); composer.current?.focus(); } },
      { key: "pin", label: m.isPinned ? t("msg.unpin") : t("msg.pin"), icon: <AppIcon name="list" size={18} stroke={1.8} />, onSelect: () => { setSelected(null); void patch(m.id, { action: "pin" }); } },
    ];
    if (m.senderId === myId) list.push({ key: "delete", label: t("common.delete"), icon: <AppIcon name="x" size={18} stroke={1.8} />, danger: true, onSelect: () => { setSelected(null); void patch(m.id, { action: "delete" }); } });
    return list;
  };

  return (
    <div className="ac ac-thread">
      <ThreadBar
        title={other ? <Link href={`/profile/${other.id}`}>{name}</Link> : name}
        sub={sub}
        subOn={!dnd && online}
        onBack={onBack}
        // the design keeps a bell spot on the right of every thread; a personal dialog has no per-dialog switch on the site, the spot stays empty so the title keeps its place
        right={<span className="ac-tbtn" aria-hidden="true" />}
      />
      {pinned && (
        <button type="button" className="ac-pinned" aria-label={t("appui.chat.pinnedMsg")} onClick={() => setSelected(pinned.id)}>
          <span>{"\u{1F4CC}"}</span>
          <span>{pinned.text}</span>
        </button>
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
        {replyTo && <QuoteChip who={`${t("chat2.replyFor")} ${replyTo.sender.displayName}`} text={replyTo.text} onRemove={() => setReplyTo(null)} label={t("common.cancel")} />}
        <div className="ac-crow">
          <AttachMenu appSheet onFile={uploadAttachment} uploading={uploading} title={t("msg.attachFile")} className="ac-clip">
            <AppIcon name="clip" size={22} stroke={1.8} />
          </AttachMenu>
          <div className="ac-inwrap" data-emoji="1">
            <ComposerInput ref={composer} value={text} onChange={setText} onSubmit={() => void send()} onFile={uploadAttachment} placeholder={t("appui.chat.message")} className="ac-input" />
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
