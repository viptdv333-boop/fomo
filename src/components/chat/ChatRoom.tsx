"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";

interface ReplyTo {
  id: string;
  text: string;
  user: { displayName: string };
}

interface Message {
  id: string;
  text: string;
  createdAt: string;
  reactions: Record<string, string[]> | null;
  replyToId: string | null;
  replyTo: ReplyTo | null;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface ChatRoomProps {
  roomId: string;
  roomName: string;
  isClosed?: boolean;
  isArchived?: boolean;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👎", "😮"];
const EMOJI_CATEGORIES = [
  { name: "Часто", emojis: ["👍", "❤️", "😂", "🔥", "👎", "😊", "🎉", "💯", "🙏", "😭", "🤣", "😍", "🥰", "😘", "😎", "🤔"] },
  { name: "Лица", emojis: ["😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥"] },
  { name: "Жесты", emojis: ["👋", "🤚", "🖐️", "✋", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🤝", "🙏"] },
  { name: "Символы", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "⭐", "🌟", "✨", "⚡", "🔥", "💥", "🎉", "🎊", "💯", "✅", "❌", "⚠️", "🚀"] },
];

export default function ChatRoom({ roomId, roomName, isClosed, isArchived }: ChatRoomProps) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [notifications, setNotifications] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem("fomo-chat-notif") || "{}");
        return saved;
      } catch { return {}; }
    }
    return {};
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const notifEnabled = notifications[roomId] === true;

  useEffect(() => {
    fetch(`/api/chat/messages?roomId=${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      });
    setReplyTo(null);
  }, [roomId]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const socket = getSocket(session.user.id);
    socket.emit("join_room", roomId);

    socket.on("new_message", (msg: Message) => {
      // Dedup: skip if message already exists (sent via API)
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
    });

    return () => {
      socket.emit("leave_room", roomId);
      socket.off("new_message");
    };
  }, [roomId, session?.user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get unique users for @mention
  const uniqueUsers = useCallback(() => {
    const map = new Map<string, string>();
    messages.forEach((m) => map.set(m.user.id, m.user.displayName));
    return Array.from(map.entries()).map(([id, displayName]) => ({ id, displayName }));
  }, [messages]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);

    // Check for @mention
    const lastAt = val.lastIndexOf("@");
    if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === " ")) {
      const query = val.slice(lastAt + 1).toLowerCase();
      const users = uniqueUsers().filter(
        (u) => u.id !== session?.user?.id && u.displayName.toLowerCase().includes(query)
      );
      setMentionSearch(query);
      setMentionUsers(users);
    } else {
      setMentionSearch(null);
      setMentionUsers([]);
    }
  }

  function selectMention(userName: string) {
    const lastAt = input.lastIndexOf("@");
    const newInput = input.slice(0, lastAt) + `@${userName} `;
    setInput(newInput);
    setMentionSearch(null);
    setMentionUsers([]);
    inputRef.current?.focus();
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !session?.user?.id) return;

    const textToSend = input;
    const replyToSend = replyTo;
    setInput("");
    setReplyTo(null);
    setShowEmojiPicker(false);

    // Send via API only (no socket.emit to avoid duplicates)
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          text: textToSend,
          replyToId: replyToSend?.id || undefined,
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        // Add only if not already present (socket might deliver it too)
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      }
    } catch {}
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      const res = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
      if (res.ok) {
        const { reactions } = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
        );
      }
    } catch {}
    setShowReactionPicker(null);
  }

  function toggleNotification() {
    const updated = { ...notifications, [roomId]: !notifEnabled };
    setNotifications(updated);
    localStorage.setItem("fomo-chat-notif", JSON.stringify(updated));
  }

  async function adminAction(action: string) {
    if (!confirm(`${action} этот чат?`)) return;
    try {
      await fetch("/api/chat/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action }),
      });
      window.location.reload();
    } catch {}
  }

  function insertEmoji(emoji: string) {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-t-xl border-b dark:border-gray-700 px-4 py-2.5 flex items-center gap-2 shrink-0">
        <h3 className="font-semibold dark:text-gray-100 flex-1">{roomName}</h3>

        {/* Notification toggle */}
        <button
          onClick={toggleNotification}
          className={`p-1.5 rounded-lg transition text-sm ${
            notifEnabled
              ? "text-green-600 bg-green-50 dark:bg-green-900/30"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
          title={notifEnabled ? "Уведомления включены" : "Уведомления выключены"}
        >
          {notifEnabled ? "🔔" : "🔕"}
        </button>

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex items-center gap-1">
            {isArchived ? (
              <button
                onClick={() => adminAction("unarchive")}
                className="p-1.5 rounded-lg text-sm text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition"
                title="Разархивировать"
              >
                📤
              </button>
            ) : (
              <button
                onClick={() => adminAction("archive")}
                className="p-1.5 rounded-lg text-sm text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition"
                title="В архив"
              >
                📦
              </button>
            )}
            <button
              onClick={() => adminAction(isClosed ? "open" : "close")}
              className="p-1.5 rounded-lg text-sm text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition"
              title={isClosed ? "Открыть чат" : "Закрыть чат"}
            >
              {isClosed ? "🔓" : "🔒"}
            </button>
            <button
              onClick={() => adminAction("delete")}
              className="p-1.5 rounded-lg text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              title="Удалить чат"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 px-4 py-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">
            Нет сообщений. Начните общение!
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.user.id === session?.user?.id;
          const isHovered = hoveredMsg === msg.id;
          const reactions = msg.reactions || {};

          return (
            <div
              key={msg.id}
              className={`group flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}
              onMouseEnter={() => setHoveredMsg(msg.id)}
              onMouseLeave={() => { setHoveredMsg(null); if (showReactionPicker === msg.id) setShowReactionPicker(null); }}
            >
              {/* Avatar */}
              {msg.user.avatarUrl ? (
                <img src={msg.user.avatarUrl} alt="" className="w-8 h-8 rounded-full shrink-0 mt-0.5" />
              ) : (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                  isMe
                    ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                    : "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                }`}>
                  {msg.user.displayName[0]}
                </div>
              )}

              {/* Content */}
              <div className={`max-w-[70%] ${isMe ? "text-right" : ""}`}>
                <div className={`flex items-baseline gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                  <span className="font-medium text-xs dark:text-gray-100">{msg.user.displayName}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {new Date(msg.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Reply preview */}
                {msg.replyTo && (
                  <div className={`text-[11px] mb-0.5 px-2 py-1 rounded border-l-2 border-green-400 bg-green-50/50 dark:bg-green-900/20 ${isMe ? "ml-auto" : ""} max-w-fit`}>
                    <span className="font-medium text-green-600 dark:text-green-400">{msg.replyTo.user.displayName}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-1 truncate">{msg.replyTo.text.slice(0, 60)}</span>
                  </div>
                )}

                {/* Message bubble */}
                <div className="relative inline-block">
                  <p
                    className={`text-sm inline-block px-3 py-1.5 rounded-2xl whitespace-pre-wrap break-words ${
                      isMe
                        ? "bg-green-600 text-white rounded-br-md"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-bl-md"
                    }`}
                    dangerouslySetInnerHTML={{
                      __html: msg.text.replace(
                        /@(\S+)/g,
                        '<span class="font-semibold text-green-500 dark:text-green-300">@$1</span>'
                      ),
                    }}
                  />

                  {/* Hover actions */}
                  {isHovered && (
                    <div className={`absolute -top-7 ${isMe ? "right-0" : "left-0"} flex items-center gap-0.5 bg-white dark:bg-gray-800 shadow-lg rounded-lg px-1 py-0.5 border dark:border-gray-700 z-10`}>
                      <button
                        onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs"
                        title="Ответить"
                      >
                        ↩️
                      </button>
                      <button
                        onClick={() => {
                          setInput((prev) => prev + `@${msg.user.displayName} `);
                          inputRef.current?.focus();
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs"
                        title="Упомянуть"
                      >
                        @
                      </button>
                      <button
                        onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs"
                        title="Реакция"
                      >
                        😀
                      </button>
                    </div>
                  )}

                  {/* Quick reaction picker */}
                  {showReactionPicker === msg.id && (
                    <div className={`absolute -top-14 ${isMe ? "right-0" : "left-0"} flex items-center gap-0.5 bg-white dark:bg-gray-800 shadow-lg rounded-lg px-1.5 py-1 border dark:border-gray-700 z-20`}>
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm hover:scale-125 transition-transform"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reactions display */}
                {Object.keys(reactions).length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                    {Object.entries(reactions).map(([emoji, userIds]) => {
                      const myReaction = userIds.includes(session?.user?.id || "");
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition ${
                            myReaction
                              ? "bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700"
                              : "bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="text-[10px] text-gray-600 dark:text-gray-400">{userIds.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview bar */}
      {replyTo && (
        <div className="bg-green-50 dark:bg-green-900/20 border-t dark:border-gray-700 px-4 py-2 flex items-center gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-green-600 dark:text-green-400 font-medium">
              Ответ для {replyTo.user.displayName}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{replyTo.text}</div>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Mention suggestions */}
      {mentionSearch !== null && mentionUsers.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border-t dark:border-gray-700 px-4 py-1 shrink-0">
          <div className="flex flex-wrap gap-1">
            {mentionUsers.slice(0, 8).map((u) => (
              <button
                key={u.id}
                onClick={() => selectMention(u.displayName)}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition text-gray-700 dark:text-gray-300"
              >
                @{u.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      {isClosed || isArchived ? (
        <div className="bg-gray-100 dark:bg-gray-800 rounded-b-xl border-t dark:border-gray-700 px-4 py-3 text-center text-sm text-gray-500">
          {isArchived ? "📦 Чат в архиве" : "🔒 Чат закрыт"}
        </div>
      ) : (
        <form
          onSubmit={sendMessage}
          className="bg-white dark:bg-gray-900 rounded-b-xl border-t dark:border-gray-700 px-4 py-2.5 flex items-center gap-2 shrink-0 relative"
        >
          {/* Emoji button */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition text-lg"
          >
            😊
          </button>

          {/* Emoji picker popup */}
          {showEmojiPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
              <div className="absolute bottom-14 left-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-xl z-50 w-72">
                <div className="flex border-b dark:border-gray-700">
                  {EMOJI_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.name}
                      onClick={() => setEmojiCategory(i)}
                      className={`flex-1 py-2 text-xs transition ${
                        emojiCategory === i
                          ? "text-green-600 border-b-2 border-green-600"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-8 gap-0.5 p-2 max-h-48 overflow-y-auto">
                  {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-lg"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Написать сообщение... (@ для упоминания)"
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            →
          </button>
        </form>
      )}
    </div>
  );
}
