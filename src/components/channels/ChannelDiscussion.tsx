"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { getPastedFile } from "@/lib/clipboard-files";
import AttachMenu from "@/components/shared/AttachMenu";
import ComposerInput, { type ComposerHandle } from "@/components/shared/ComposerInput";


import { formatMessageTime } from "@/lib/format-message-time";
import Linkify from "@/components/shared/Linkify";
import { sendOrQueue } from "@/lib/outbox/send";
import { useOutboxItems, useOutboxSent } from "@/lib/outbox/useOutbox";
import { removeItem, retryItem, type OutboxItem } from "@/lib/outbox/outbox";
import { isOnline } from "@/lib/offline/online";
import { showToast } from "@/lib/offline/toast";

interface Message {
  id: string;
  text: string;
  isPinned: boolean;
  isDeleted: boolean;
  createdAt: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
  replyTo?: { id: string; text: string; user: { displayName: string } } | null;
  /** an unsent message of the offline outbox (appended to the list while it waits) */
  pending?: "queued" | "failed";
  pendingId?: string;
}

function pendingToMessage(it: OutboxItem, me: Message["user"]): Message {
  const p = (it.preview || {}) as { text?: string; fileUrl?: string; fileName?: string; fileType?: string };
  return {
    id: "pending:" + it.clientId,
    text: p.text || "",
    isPinned: false,
    isDeleted: false,
    createdAt: new Date(it.createdAt).toISOString(),
    fileUrl: p.fileUrl || null,
    fileName: p.fileName || null,
    fileType: p.fileType || null,
    user: me,
    pending: it.status === "failed" ? "failed" : it.status === "sent" ? undefined : "queued",
    pendingId: it.clientId,
  };
}

interface PendingFile {
  url: string;
  name: string;
  fileType: string;
}

interface Props {
  tariffId: string;
}

export default function ChannelDiscussion({ tariffId }: Props) {
  const { t, locale } = useT();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [isAuthor, setIsAuthor] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const outboxTarget = roomId ? `room:${roomId}` : null;
  const serverIds = useMemo(() => new Set(messages.map((m) => m.id)), [messages]);
  const queued = useOutboxItems(outboxTarget, serverIds);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const messagesBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ComposerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);

  // Check access and get roomId
  useEffect(() => {
    if (!tariffId) return;
    fetch(`/api/channels/${tariffId}/chat`)
      .then((r) => {
        if (r.status === 403) { setAccessDenied(true); setLoading(false); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data) {
          setRoomId(data.roomId);
          setIsAuthor(data.isAuthor);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tariffId]);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!roomId) return;
    const res = await fetch(`/api/chat/messages?roomId=${roomId}&limit=50`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || data || []);
    }
  }, [roomId]);

  useEffect(() => {
    if (roomId) {
      loadMessages();
      const interval = setInterval(loadMessages, 10000);
      return () => clearInterval(interval);
    }
  }, [roomId, loadMessages]);

  // a queued message was delivered: show the server's list now
  useOutboxSent(outboxTarget, loadMessages);

  useEffect(() => {
    // scrollIntoView bubbles up through every scrollable ancestor, including
    // the page itself — on a long channel page (especially on mobile, with
    // no fixed-height chat panel) that meant opening the page jumped straight
    // to this embedded discussion box. Scroll only this box's own scrollbar.
    const box = messagesBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  }

  async function uploadFile(file: File) {
    if (uploading) return;
    if (!isOnline()) {
      showToast(t("offline.attachHint"));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "messages");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || t("channel2.uploadFailed"));
        return;
      }
      setPendingFile({ url: data.url, name: data.name, fileType: data.fileType });
    } finally {
      setUploading(false);
    }
  }

  async function handleSend() {
    if ((!input.trim() && !pendingFile) || !roomId || sending) return;
    setSending(true);
    // offline outbox: sent now, or kept (IndexedDB) and sent when the network is back, once
    const r = await sendOrQueue({
      kind: "room_message",
      target: `room:${roomId}`,
      url: "/api/chat/messages",
      body: {
        roomId,
        text: input.trim(),
        replyToId: replyTo?.id,
        fileUrl: pendingFile?.url,
        fileName: pendingFile?.name,
        fileType: pendingFile?.fileType,
      },
      preview: { text: input.trim(), fileUrl: pendingFile?.url, fileName: pendingFile?.name, fileType: pendingFile?.fileType },
    });
    if (r.state === "sent" || r.state === "queued") {
      setInput("");
      setReplyTo(null);
      setPendingFile(null);
      if (r.state === "queued" && !isOnline()) showToast(t("offline.queuedToast"));
    } else {
      alert(t("channel2.sendFailed"));
    }
    setSending(false);
    loadMessages();
  }

  async function handleModerate(action: string, messageId?: string, targetUserId?: string) {
    await fetch(`/api/channels/${tariffId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, messageId, userId: targetUserId, duration: 30 }),
    });
    loadMessages();
  }

  if (loading) return <div className="text-gray-400 text-center py-8">...</div>;

  if (accessDenied) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 text-center">
        <div className="text-gray-400 mb-2">🔒 {t("channels.availableBySubscription")}</div>
        <p className="text-sm text-gray-500">{t("channels.buySubscription")}</p>
      </div>
    );
  }

  if (!roomId) return null;

  const pinnedMessages = messages.filter((m) => m.isPinned && !m.isDeleted);
  const me = { id: userId || "", displayName: (session?.user as { displayName?: string } | undefined)?.displayName || session?.user?.name || "", avatarUrl: null as string | null };
  const visible = [...messages.filter((m) => !m.isDeleted), ...(userId ? queued.map((it) => pendingToMessage(it, me)) : [])];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <h3 className="font-semibold text-sm dark:text-gray-100">
          💬 {t("idea.comments")}
          <span className="text-xs text-gray-400 font-normal ml-2">{messages.filter((m) => !m.isDeleted).length}</span>
        </h3>
        {isAuthor && <span className="text-[10px] text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">{t("top.owner").replace("👑 ", "")}</span>}
      </div>

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/10 border-b border-yellow-100 dark:border-yellow-900/20">
          {pinnedMessages.map((m) => (
            <div key={m.id} className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
              📌 <span className="font-medium">{m.user.displayName}:</span> {m.text.slice(0, 100)}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={messagesBoxRef} className="max-h-[400px] overflow-y-auto p-4 space-y-3">
        {visible.length === 0 ? (
          <div className="text-gray-400 text-center py-8 text-sm">{t("channel2.startDiscussion")}</div>
        ) : (
          visible.map((msg) => (
            <div key={msg.id} className="flex gap-2.5 group">
              <Link href={`/profile/${msg.user.id}`} className="shrink-0">
                {msg.user.avatarUrl ? (
                  <img src={msg.user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 text-xs font-bold">
                    {msg.user.displayName?.[0] || "?"}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/profile/${msg.user.id}`} className="text-xs font-semibold dark:text-gray-100 hover:text-green-600 dark:hover:text-green-400">
                    {msg.user.displayName}
                  </Link>
                  <span className="text-[10px] text-gray-400">{formatMessageTime(msg.createdAt, locale)}</span>
                  {msg.pending === "queued" && <span data-pending="queued" className="text-[10px] text-gray-400" title={t("offline.pendingMark")}>{"\u{1F551}"}</span>}
                  {msg.pending === "failed" && msg.pendingId && (
                    <span data-pending="failed" className="text-[10px] text-red-600">
                      {"\u26A0\uFE0F"} {t("offline.failedMark")}{" "}
                      <button type="button" className="underline font-semibold" onClick={() => void retryItem(msg.pendingId!)}>{t("offline.retry")}</button>{" "}
                      <button type="button" className="underline font-semibold" onClick={() => void removeItem(msg.pendingId!)}>{t("offline.remove")}</button>
                    </span>
                  )}
                  {msg.isPinned && <span className="text-[10px] text-yellow-500">📌</span>}
                </div>
                {msg.replyTo && (
                  <div className="text-[10px] text-gray-400 border-l-2 border-green-400 pl-2 my-0.5">
                    {msg.replyTo.user.displayName}: {msg.replyTo.text.slice(0, 60)}
                  </div>
                )}
                {msg.text && <p className="text-sm text-gray-700 dark:text-gray-300 break-words"><Linkify text={msg.text} /></p>}
                {msg.fileUrl && msg.fileType === "video" && (
                  <video src={msg.fileUrl} controls className="mt-1 max-w-full sm:max-w-[320px] max-h-[240px] rounded-lg" />
                )}
                {msg.fileUrl && msg.fileType === "image" && (
                  <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={msg.fileUrl} alt={msg.fileName || ""} className="max-w-full sm:max-w-[280px] max-h-[220px] rounded-lg object-cover" />
                  </a>
                )}
                {msg.fileUrl && msg.fileType !== "video" && msg.fileType !== "image" && (
                  <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1 text-xs text-green-600 hover:underline">
                    📄 {msg.fileName || t("channel2.file")}
                  </a>
                )}
                {/* Actions */}
                <div className={`flex gap-2 mt-0.5 opacity-0 group-hover:opacity-100 transition ${msg.pending ? "hidden" : ""}`}>
                  <button onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                    className="text-[10px] text-gray-400 hover:text-green-600">{t("msg.reply")}</button>
                  {isAuthor && (
                    <>
                      <button onClick={() => handleModerate("pin", msg.id)}
                        className="text-[10px] text-gray-400 hover:text-yellow-600">{msg.isPinned ? t("msg.unpin") : t("msg.pin")}</button>
                      <button onClick={() => handleModerate("delete", msg.id)}
                        className="text-[10px] text-gray-400 hover:text-red-500">{t("msg.delete")}</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="px-4 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-xs">
          <span className="text-gray-400">↩ {replyTo.user.displayName}:</span>
          <span className="text-gray-500 truncate">{replyTo.text.slice(0, 50)}</span>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-red-500 ml-auto">✕</button>
        </div>
      )}

      {/* Pending attachment */}
      {pendingFile && (
        <div className="px-4 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-xs">
          {pendingFile.fileType === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingFile.url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
          ) : (
            <span className="shrink-0">{pendingFile.fileType === "video" ? "🎬" : "📄"}</span>
          )}
          <span className="text-gray-500 truncate flex-1">{pendingFile.name}</span>
          <button onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-red-500 shrink-0">✕</button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
        <AttachMenu
          onFile={uploadFile}
          uploading={uploading}
          title={t("channel2.attachTitle")}
          className="px-3 py-2 border dark:border-gray-700 rounded-lg text-gray-500 hover:text-green-600 dark:text-gray-400 disabled:opacity-50 transition"
        >
          📎
        </AttachMenu>
        <ComposerInput
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          onFile={uploadFile}
          placeholder={t("chat.writeMessage")}
          className="flex-1 px-3 py-2 border dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-gray-100"
        />
        <button onClick={handleSend} disabled={sending || uploading || (!input.trim() && !pendingFile)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">
          →
        </button>
      </div>
    </div>
  );
}
