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
import { pickCommentToShow } from "@/lib/app-unread";
import { sendOrQueue } from "@/lib/outbox/send";
import { useOutboxAll, useOutboxItems, useOutboxSent } from "@/lib/outbox/useOutbox";
import { OUTBOX_SENT_EVENT, outboxUid, removeItem, retryItem, type OutboxItem, type OutboxSentDetail } from "@/lib/outbox/outbox";
import { isOnline } from "@/lib/offline/online";
import { showToast } from "@/lib/offline/toast";

interface Comment {
  id: string;
  text: string;
  fileUrl?: string | null;
  reactions?: Record<string, string[]> | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
  replyTo?: { id: string; text: string; user: { displayName: string } } | null;
  /** an unsent comment of the offline outbox (appended to the list while it waits) */
  pending?: "queued" | "failed";
  pendingId?: string;
}

function pendingToComment(it: OutboxItem, me: Comment["user"]): Comment {
  const p = (it.preview || {}) as { text?: string; fileUrl?: string; replyToUser?: string; replyToText?: string; replyToId?: string };
  return {
    id: "pending:" + it.clientId,
    text: p.text || "",
    fileUrl: p.fileUrl || null,
    reactions: null,
    createdAt: new Date(it.createdAt).toISOString(),
    user: me,
    replyTo: p.replyToId ? { id: p.replyToId, text: p.replyToText || "", user: { displayName: p.replyToUser || "" } } : null,
    pending: it.status === "failed" ? "failed" : it.status === "sent" ? undefined : "queued",
    pendingId: it.clientId,
  };
}

/** Pending 👍/👎 of the outbox laid over the server's reactions: the count and my highlight move at once, offline too. */
function withPendingReactions(comments: Comment[], items: OutboxItem[], myId: string): Comment[] {
  const mine = items.filter((i) => i.kind === "comment_reaction" && (i.status === "queued" || i.status === "retry" || i.status === "sending" || i.status === "auth"));
  if (!mine.length || !myId) return comments;
  return comments.map((c) => {
    const mineHere = mine.filter((i) => (i.preview as { commentId?: string } | null)?.commentId === c.id);
    if (!mineHere.length) return c;
    const reactions: Record<string, string[]> = { ...(c.reactions || {}) };
    for (const it of mineHere) {
      const p = it.preview as { emoji: string; state: boolean };
      const ids = (reactions[p.emoji] || []).filter((x) => x !== myId);
      if (p.state) ids.push(myId);
      if (ids.length) reactions[p.emoji] = ids;
      else delete reactions[p.emoji];
    }
    return { ...c, reactions };
  });
}

interface Props {
  ideaId: string;
}

export default function IdeaComments({ ideaId }: Props) {
  const { t, locale } = useT();
  const { data: session, status: sessionStatus } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  // offline outbox: my unsent comments / reactions of this idea, drawn over the server's list (src/lib/outbox)
  const commentsTarget = `comments:${ideaId}`;
  const serverIds = useMemo(() => new Set(comments.map((c) => c.id)), [comments]);
  const queuedComments = useOutboxItems(commentsTarget, serverIds);
  const outboxAll = useOutboxAll();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string } | null>(null);
  const inputRef = useRef<ComposerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unread notifications of THIS idea (read before they are marked read): where to jump to. null = not known yet, "none" = nothing / guest.
  const uid = session?.user?.id;
  const sessionLoading = sessionStatus === "loading";
  const [unread, setUnread] = useState<{ ids: string[]; since: string | null; likes: { idea: number; comment: number } } | "none" | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const jumped = useRef(false);

  useEffect(() => {
    jumped.current = false;
    setUnread(null);
    if (sessionLoading) return; // the session is still loading
    if (!uid) {
      setUnread("none");
      return;
    }
    let alive = true;
    fetch(`/api/notifications/unread-by-idea?ideaId=${encodeURIComponent(ideaId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setUnread(j && Array.isArray(j.ids) ? { ids: j.ids, since: j.since ?? null, likes: { idea: Number(j.likes?.idea) || 0, comment: Number(j.likes?.comment) || 0 } } : "none"))
      .catch(() => alive && setUnread("none"));
    return () => {
      alive = false;
    };
  }, [ideaId, uid, sessionLoading]);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/ideas/${ideaId}/comments`);
    if (res.ok) setComments(await res.json());
    setLoading(false);
  }, [ideaId]);

  useEffect(() => { loadComments(); }, [loadComments]);
  useOutboxSent(commentsTarget, loadComments);
  // a queued 👍 / 👎 reached the server: show the real counts
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<OutboxSentDetail>).detail?.kind === "comment_reaction") loadComments();
    };
    window.addEventListener(OUTBOX_SENT_EVENT, h);
    return () => window.removeEventListener(OUTBOX_SENT_EVENT, h);
  }, [loadComments]);

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
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "messages");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      setPendingFile({ url: data.url, name: data.name });
    } else {
      alert(t("feed2.uploadFailed"));
    }
    setUploading(false);
  }

  async function handleSend() {
    if ((!input.trim() && !pendingFile) || sending) return;
    setSending(true);
    // offline outbox: sent now, or kept (IndexedDB) and sent when the network is back, once
    const r = await sendOrQueue({
      kind: "idea_comment",
      target: commentsTarget,
      url: `/api/ideas/${ideaId}/comments`,
      body: { text: input.trim(), replyToId: replyTo?.id, fileUrl: pendingFile?.url },
      preview: { text: input.trim(), fileUrl: pendingFile?.url, replyToId: replyTo?.id, replyToUser: replyTo?.user.displayName, replyToText: replyTo?.text.slice(0, 50) },
    });
    if (r.state === "sent" || r.state === "queued") {
      setInput("");
      setReplyTo(null);
      setPendingFile(null);
      if (r.state === "queued" && !isOnline()) showToast(t("offline.queuedToast"));
    }
    setSending(false);
    loadComments();
  }

  async function handleDelete(commentId: string) {
    await fetch(`/api/ideas/${ideaId}/comments?commentId=${commentId}`, { method: "DELETE" });
    loadComments();
  }

  async function toggleReaction(commentId: string, emoji: "👍" | "👎") {
    if (!session?.user || commentId.startsWith("pending:")) return;
    // the DESIRED state is sent (not a toggle): a replay of the request after a lost reply changes nothing
    const have = (shownComments.find((c) => c.id === commentId)?.reactions?.[emoji] || []).includes(session.user.id);
    const key = `react:${commentId}:${emoji}`;
    const r = await sendOrQueue({
      kind: "comment_reaction",
      target: key,
      coalesceKey: key,
      url: "/api/ideas/comments/reactions",
      body: { commentId, emoji, state: !have },
      preview: { commentId, emoji, state: !have, label: emoji },
    });
    if (r.state === "sent" && r.data?.reactions !== undefined) {
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, reactions: r.data.reactions } : c)));
    } else if (r.state === "queued" && !isOnline()) {
      showToast(t("offline.queuedToast"));
    }
  }

  // Opening the idea = having seen it: jump to the comment the user came for (?comment=<id> of the notification link, else the first unread
  // one) with a short highlight, then mark the idea's notifications read (the red counts of the cards and the dock clear).
  useEffect(() => {
    if (loading || unread === null || jumped.current) return;
    jumped.current = true;
    let wanted: string | null = null;
    try {
      wanted = new URLSearchParams(window.location.search).get("comment");
    } catch {
      /* no window */
    }
    const info = unread === "none" ? null : unread;
    const target = pickCommentToShow(comments, { wanted, ids: info?.ids, since: info?.since, myId: uid });
    // came for likes: say why (the like notification is read right below, so this is the only place it is explained)
    if (info && (info.likes.idea > 0 || info.likes.comment > 0)) {
      showToast([info.likes.idea > 0 ? t("appui.ideaLiked", { n: info.likes.idea }) : "", info.likes.comment > 0 ? t("appui.commentLiked", { n: info.likes.comment }) : ""].filter(Boolean).join(" · "));
    }
    if (target) {
      // instant (a smooth scroll is cancelled by the layout shifts of the idea above while it is still drawing), repeated once when it settled
      const go = () => document.getElementById(`comment-${target}`)?.scrollIntoView({ block: "center" });
      setTimeout(() => {
        go();
        setFlashId(target);
        setTimeout(() => setFlashId(null), 2600);
      }, 150);
      setTimeout(go, 700);
    }
    if (uid) {
      fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ideaId }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.marked > 0 && window.dispatchEvent(new Event("fomo:unread-changed")))
        .catch(() => {});
    }
  }, [loading, unread, comments, uid, ideaId, t]);

  // Cards link here with #comments; the page renders the comments after a
  // fetch, so the browser's own anchor scroll has nothing to land on yet.
  useEffect(() => {
    if (!loading && typeof window !== "undefined" && window.location.hash === "#comments") {
      document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading]);

  const me = { id: uid || "", displayName: (session?.user as { displayName?: string } | undefined)?.displayName || session?.user?.name || "", avatarUrl: null as string | null };
  const shownComments = useMemo(
    () => withPendingReactions([...comments, ...(uid ? queuedComments.map((it) => pendingToComment(it, me)) : [])], outboxAll.filter((i) => i.uid === outboxUid()), uid || ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments, queuedComments, outboxAll, uid]
  );

  return (
    <div className="mt-4" id="comments">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          💬 {t("idea.comments")}
        </h4>
        <span className="text-xs text-gray-400">{shownComments.length}</span>
      </div>

      {/* Comments */}
      {loading ? (
        <div className="text-xs text-gray-400 py-2">...</div>
      ) : shownComments.length > 0 ? (
        <div className="space-y-2 mb-3">
          {shownComments.map((c) => (
            <div
              key={c.id}
              id={`comment-${c.id}`}
              className={`flex gap-2 group scroll-mt-24 rounded-lg transition-colors duration-700 ${flashId === c.id ? "bg-green-100 dark:bg-green-900/40 ring-2 ring-green-500/50 -mx-1 px-1" : ""}`}
            >
              <Link href={`/profile/${c.user.id}`} className="shrink-0">
                {c.user.avatarUrl ? (
                  <img src={c.user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover mt-0.5" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 text-[10px] font-bold mt-0.5">
                    {c.user.displayName?.[0] || "?"}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Link href={`/profile/${c.user.id}`} className="text-xs font-semibold dark:text-gray-200 hover:text-green-600 dark:hover:text-green-400">
                    {c.user.displayName}
                  </Link>
                  <span className="text-[10px] text-gray-400">{formatMessageTime(c.createdAt, locale)}</span>
                  {c.pending === "queued" && <span data-pending="queued" className="text-[10px] text-gray-400" title={t("offline.pendingMark")}>{"\u{1F551}"}</span>}
                  {c.pending === "failed" && c.pendingId && (
                    <span data-pending="failed" className="text-[10px] text-red-600">
                      {"\u26A0\uFE0F"} {t("offline.failedMark")}{" "}
                      <button type="button" className="underline font-semibold" onClick={() => void retryItem(c.pendingId!)}>{t("offline.retry")}</button>{" "}
                      <button type="button" className="underline font-semibold" onClick={() => void removeItem(c.pendingId!)}>{t("offline.remove")}</button>
                    </span>
                  )}
                </div>
                {c.replyTo && (
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 border-l-2 border-green-400 pl-1.5 my-0.5 truncate">
                    ↩ <span className="font-semibold">{c.replyTo.user.displayName}</span>: {c.replyTo.text.slice(0, 50)}
                  </div>
                )}
                {c.text && <p className="text-sm text-gray-700 dark:text-gray-300"><Linkify text={c.text} /></p>}
                {c.fileUrl && (
                  <a href={c.fileUrl} target="_blank" rel="noopener noreferrer">
                    <img src={c.fileUrl} alt="" className="mt-1 max-w-[200px] max-h-[200px] rounded-lg object-cover" />
                  </a>
                )}
                {/* Always visible (not hover-only) — hover reveals nothing on
                    touch devices, which made replying effectively undiscoverable
                    on mobile. */}
                <div className="flex items-center gap-2 mt-0.5">
                  {(() => {
                    const reactions = c.reactions || {};
                    const likeIds = reactions["👍"] || [];
                    const dislikeIds = reactions["👎"] || [];
                    const myLike = likeIds.includes(session?.user?.id || "");
                    const myDislike = dislikeIds.includes(session?.user?.id || "");
                    return (
                      <>
                        <button
                          onClick={() => toggleReaction(c.id, "👍")}
                          disabled={!session?.user}
                          className={`flex items-center gap-0.5 text-[10px] font-medium transition ${myLike ? "text-green-600" : "text-gray-400 hover:text-green-500"}`}
                        >
                          👍 {likeIds.length > 0 && likeIds.length}
                        </button>
                        <button
                          onClick={() => toggleReaction(c.id, "👎")}
                          disabled={!session?.user}
                          className={`flex items-center gap-0.5 text-[10px] font-medium transition ${myDislike ? "text-blue-500" : "text-gray-400 hover:text-blue-400"}`}
                        >
                          👎 {dislikeIds.length > 0 && dislikeIds.length}
                        </button>
                      </>
                    );
                  })()}
                  {session?.user && !c.pending && (
                    <button onClick={() => { setReplyTo(c); setInput(`@${c.user.displayName}, `); inputRef.current?.focus(); }}
                      className="text-[10px] text-gray-400 hover:text-green-600 font-medium">↩ {t("idea.reply")}</button>
                  )}
                  {!c.pending && (session?.user?.id === c.user.id || (session?.user as any)?.role === "ADMIN") && (
                    <button onClick={() => handleDelete(c.id)}
                      className="text-[10px] text-gray-400 hover:text-red-500">{t("common.delete")}</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Input */}
      {session?.user ? (
        <div>
          {replyTo && (
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1">
              ↩ {t("idea.reply")}: <span className="font-semibold">{replyTo.user.displayName}</span>
              <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-red-500 ml-auto">✕</button>
            </div>
          )}
          {pendingFile && (
            <div className="flex items-center gap-2 mb-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1">
              <img src={pendingFile.url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{pendingFile.name}</span>
              <button onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-red-500 text-xs shrink-0">✕</button>
            </div>
          )}
          <div className="flex gap-2">
            <AttachMenu
              onFile={uploadFile}
              uploading={uploading}
              docs={false}
              title={t("feed2.attachPhoto")}
              className="px-2.5 py-1.5 border dark:border-gray-700 rounded-lg text-gray-500 hover:text-green-600 dark:text-gray-400 disabled:opacity-50"
            >
              📎
            </AttachMenu>
            <ComposerInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              onFile={uploadFile}
              imagesOnly
              placeholder={t("idea.writeComment")}
              className="flex-1 px-3 py-1.5 border dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-gray-100"
            />
            <button onClick={handleSend} disabled={sending || (!input.trim() && !pendingFile)}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">→</button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t("nav.login")}</p>
      )}
    </div>
  );
}
