"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
  replyTo?: { id: string; text: string; user: { displayName: string } } | null;
}

interface Props {
  ideaId: string;
}

export default function IdeaComments({ ideaId }: Props) {
  const { t } = useT();
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/ideas/${ideaId}/comments`);
    if (res.ok) setComments(await res.json());
    setLoading(false);
  }, [ideaId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);
    await fetch(`/api/ideas/${ideaId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.trim(), replyToId: replyTo?.id }),
    });
    setInput("");
    setReplyTo(null);
    setSending(false);
    loadComments();
  }

  async function handleDelete(commentId: string) {
    await fetch(`/api/ideas/${ideaId}/comments?commentId=${commentId}`, { method: "DELETE" });
    loadComments();
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          💬 {t("idea.comments")}
        </h4>
        <span className="text-xs text-gray-400">{comments.length}</span>
      </div>

      {/* Comments */}
      {loading ? (
        <div className="text-xs text-gray-400 py-2">...</div>
      ) : comments.length > 0 ? (
        <div className="space-y-2 mb-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 group">
              {c.user.avatarUrl ? (
                <img src={c.user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 text-[10px] font-bold shrink-0 mt-0.5">
                  {c.user.displayName?.[0] || "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold dark:text-gray-200">{c.user.displayName}</span>
                  <span className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {c.replyTo && (
                  <div className="text-[10px] text-gray-400 border-l-2 border-green-400 pl-1.5 my-0.5 truncate">
                    {c.replyTo.user.displayName}: {c.replyTo.text.slice(0, 50)}
                  </div>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">{c.text}</p>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                  {session?.user && (
                    <button onClick={() => { setReplyTo(c); inputRef.current?.focus(); }}
                      className="text-[10px] text-gray-400 hover:text-green-600">{t("idea.reply")}</button>
                  )}
                  {(session?.user?.id === c.user.id || (session?.user as any)?.role === "ADMIN") && (
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
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-1">
              ↩ {replyTo.user.displayName}
              <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-red-500 ml-1">✕</button>
            </div>
          )}
          <div className="flex gap-2">
            <input ref={inputRef} type="text" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
              placeholder={t("idea.writeComment")}
              className="flex-1 px-3 py-1.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
            <button onClick={handleSend} disabled={sending || !input.trim()}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">→</button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t("nav.login")}</p>
      )}
    </div>
  );
}
