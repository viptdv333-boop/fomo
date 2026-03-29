"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";

interface Message {
  id: string;
  text: string;
  userId: string;
  createdAt: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  replyTo?: { id: string; text: string; user: { displayName: string } } | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

interface Props {
  conversationId: string;
  otherUserName: string;
  otherUserAvatar: string | null;
}

export default function DMChat({ conversationId, otherUserName, otherUserAvatar }: Props) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/messages/conversations/${conversationId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
    }
  }, [conversationId]);

  useEffect(() => {
    isFirstLoad.current = true;
    loadMessages();
    // Mark as read
    fetch(`/api/messages/conversations/${conversationId}`, { method: "PATCH" }).catch(() => {});
  }, [conversationId, loadMessages]);

  // Socket.IO for real-time
  useEffect(() => {
    if (!session?.user?.id) return;
    const socket = getSocket(session.user.id);

    socket.emit("join_conversation", conversationId);

    const handleNewDm = (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on("new_dm", handleNewDm);
    return () => {
      socket.off("new_dm", handleNewDm);
      socket.emit("leave_conversation", conversationId);
    };
  }, [session?.user?.id, conversationId]);

  // Scroll to bottom
  useEffect(() => {
    if (messages.length > 0) {
      if (isFirstLoad.current) {
        messagesEndRef.current?.scrollIntoView();
        isFirstLoad.current = false;
      } else {
        const container = containerRef.current;
        if (container) {
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
          if (isNearBottom) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input, replyToId: replyTo?.id }),
    });
    if (res.ok) {
      setInput("");
      setReplyTo(null);
      await loadMessages();
    }
    setSending(false);
  }

  const myId = session?.user?.id;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-xs overflow-hidden">
          {otherUserAvatar ? (
            <img src={otherUserAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            otherUserName[0]?.toUpperCase()
          )}
        </div>
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{otherUserName}</span>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Начните диалог</div>
        ) : messages.map((msg) => {
          const isMine = msg.userId === myId;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                isMine
                  ? "bg-green-600 text-white rounded-br-md"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md"
              }`}>
                {!isMine && (
                  <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-0.5">{msg.user.displayName}</div>
                )}
                {msg.replyTo && (
                  <div className={`text-xs mb-1 pl-2 border-l-2 ${isMine ? "border-white/50 text-white/70" : "border-green-400 text-gray-500"}`}>
                    {msg.replyTo.user.displayName}: {msg.replyTo.text.slice(0, 60)}
                  </div>
                )}
                {msg.fileUrl && msg.fileType === "image" && (
                  <img src={msg.fileUrl} alt="" className="max-w-full rounded-lg mb-1" />
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                <div className={`text-[10px] mt-1 ${isMine ? "text-white/60" : "text-gray-400"} text-right`}>
                  {new Date(msg.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <div className="flex-1 text-xs text-gray-500 truncate">
            Ответ для <strong>{replyTo.user.displayName}</strong>: {replyTo.text.slice(0, 60)}
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2 shrink-0">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Написать сообщение..."
          className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500" />
        <button type="submit" disabled={sending || !input.trim()}
          className="w-10 h-10 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-full flex items-center justify-center transition shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
  );
}
