"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";

/* ── fadeIn animation ── */
const fadeInStyle = `
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.animate-fadeIn { animation: fadeIn 0.3s ease-out; }
`;

/* ── Avatar color palette (no blue, no gold) ── */
const AVATAR_COLORS = [
  "bg-green-600",
  "bg-teal-600",
  "bg-emerald-600",
  "bg-cyan-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-violet-600",
  "bg-indigo-600",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h);
}

function getAvatarColor(name: string) {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* ── Interfaces ── */
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

/* ── Constants ── */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👎", "😮"];
// Instrument shortcode emojis — rendered as inline images
const INSTRUMENT_EMOJIS = [
  // Crypto
  "bitcoin", "ethereum", "solana", "xrp", "bnb", "dogecoin", "toncoin", "pepe",
  // RU stocks
  "sberbank", "gazprom", "lukoil", "yandex", "rosneft", "tinkoff",
  // US stocks
  "apple", "tesla", "nvidia", "microsoft", "amazon", "google", "meta", "netflix",
  // Commodities & metals
  "oil", "gas", "gold", "silver", "wheat", "coffee",
  // Indices
  "sp500", "nasdaq100", "moex-index",
  // Currencies
  "usd-rub", "eur-usd",
];

const EMOJI_CATEGORIES = [
  { name: "Часто", emojis: ["👍", "❤️", "😂", "🔥", "👎", "😊", "🎉", "💯", "🙏", "😭", "🤣", "😍", "🥰", "😘", "😎", "🤔"] },
  { name: "Тикеры", emojis: INSTRUMENT_EMOJIS.map(s => `:${s}:`), isCustom: true },
  { name: "Лица", emojis: ["😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥"] },
  { name: "Жесты", emojis: ["👋", "🤚", "🖐️", "✋", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🤝", "🙏"] },
  { name: "Символы", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "⭐", "🌟", "✨", "⚡", "🔥", "💥", "🎉", "🎊", "💯", "✅", "❌", "⚠️", "🚀"] },
] as const;

/* ── SVG Icons ── */
function IconBell({ active }: { active?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IconPaperclip() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function IconSmile() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}

function IconHeart({ filled }: { filled?: boolean }) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
    </svg>
  );
}

function IconReply() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

/* ── Component ── */
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
  const [showAdminMenu, setShowAdminMenu] = useState(false);
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

  /* ── Data fetching & socket ── */
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

  /* ── Mention logic ── */
  const uniqueUsers = useCallback(() => {
    const map = new Map<string, string>();
    messages.forEach((m) => map.set(m.user.id, m.user.displayName));
    return Array.from(map.entries()).map(([id, displayName]) => ({ id, displayName }));
  }, [messages]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);

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

  /* ── Send message ── */
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !session?.user?.id) return;

    const textToSend = input;
    const replyToSend = replyTo;
    setInput("");
    setReplyTo(null);
    setShowEmojiPicker(false);

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
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      }
    } catch {}
  }

  /* ── Reactions ── */
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

  /* ── Notifications ── */
  function toggleNotification() {
    const updated = { ...notifications, [roomId]: !notifEnabled };
    setNotifications(updated);
    localStorage.setItem("fomo-chat-notif", JSON.stringify(updated));
  }

  /* ── Admin actions ── */
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

  /* ── Emoji insert ── */
  function insertEmoji(emoji: string) {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  }

  /* ── Compute like count for a message (heart reactions) ── */
  function getLikeCount(msg: Message): number {
    const reactions = msg.reactions || {};
    return (reactions["❤️"] || []).length;
  }

  function hasMyLike(msg: Message): boolean {
    const reactions = msg.reactions || {};
    return (reactions["❤️"] || []).includes(session?.user?.id || "");
  }

  /* ── Reply count (messages that reply to this one) ── */
  function getReplyCount(msgId: string): number {
    return messages.filter((m) => m.replyToId === msgId).length;
  }

  /* ── Participant count ── */
  const participantCount = uniqueUsers().length;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: fadeInStyle }} />

      <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900">
        {/* ── HEADER ── */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800/30 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            {/* Left side: name + participants */}
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">
                {roomName}
              </h3>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-gray-400">
                  <IconPeople />
                </span>
                <span className="text-xs text-gray-400">
                  {participantCount} участник{participantCount === 1 ? "" : participantCount < 5 ? "а" : "ов"}
                </span>
              </div>
            </div>

            {/* Right side: bell, search, dots menu */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleNotification}
                className={`p-2 rounded-lg transition ${
                  notifEnabled
                    ? "text-green-600 bg-green-50 dark:bg-green-900/30"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
                title={notifEnabled ? "Уведомления включены" : "Уведомления выключены"}
              >
                <IconBell active={notifEnabled} />
              </button>

              <button
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                title="Поиск"
              >
                <IconSearch />
              </button>

              {/* Three-dot menu (admin controls inside) */}
              <div className="relative">
                <button
                  onClick={() => setShowAdminMenu(!showAdminMenu)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  title="Меню"
                >
                  <IconDots />
                </button>

                {showAdminMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAdminMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 py-1 min-w-[180px]">
                      {isAdmin && (
                        <>
                          {isArchived ? (
                            <button
                              onClick={() => { setShowAdminMenu(false); adminAction("unarchive"); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                            >
                              Разархивировать
                            </button>
                          ) : (
                            <button
                              onClick={() => { setShowAdminMenu(false); adminAction("archive"); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                            >
                              В архив
                            </button>
                          )}
                          <button
                            onClick={() => { setShowAdminMenu(false); adminAction(isClosed ? "open" : "close"); }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                          >
                            {isClosed ? "Открыть чат" : "Закрыть чат"}
                          </button>
                          <button
                            onClick={() => { setShowAdminMenu(false); adminAction("delete"); }}
                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          >
                            Удалить чат
                          </button>
                        </>
                      )}
                      {!isAdmin && (
                        <div className="px-4 py-2 text-sm text-gray-400">Нет действий</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── MESSAGES ── */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 px-4 py-4 min-h-0">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
              Нет сообщений. Начните общение!
            </div>
          )}

          <div className="flex flex-col gap-5">
            {messages.map((msg) => {
              const isHovered = hoveredMsg === msg.id;
              const reactions = msg.reactions || {};
              const likeCount = getLikeCount(msg);
              const myLike = hasMyLike(msg);
              const replyCount = getReplyCount(msg.id);
              const avatarColor = getAvatarColor(msg.user.displayName);

              return (
                <div
                  key={msg.id}
                  className="animate-fadeIn group relative rounded-lg transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-2 px-2 py-1"
                  onMouseEnter={() => setHoveredMsg(msg.id)}
                  onMouseLeave={() => { setHoveredMsg(null); if (showReactionPicker === msg.id) setShowReactionPicker(null); }}
                >
                  <div className="flex gap-3">
                    {/* Avatar */}
                    {msg.user.avatarUrl ? (
                      <img src={msg.user.avatarUrl} alt="" className="w-10 h-10 rounded-full shrink-0" />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${avatarColor}`}>
                        {getInitials(msg.user.displayName)}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                          {msg.user.displayName}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(msg.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {/* Reply preview */}
                      {msg.replyTo && (
                        <div className="mt-1 mb-1 pl-3 border-l-2 border-green-400 bg-green-50/50 dark:bg-green-900/20 rounded-r py-1 pr-2 max-w-fit">
                          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                            {msg.replyTo.user.displayName}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1.5 truncate">
                            {msg.replyTo.text.slice(0, 80)}
                          </span>
                        </div>
                      )}

                      {/* Message text — flat style, no bubble */}
                      <p
                        className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words mt-0.5 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: msg.text
                            .replace(
                              /@(\S+)/g,
                              '<span class="font-semibold text-green-600 dark:text-green-400">@$1</span>'
                            )
                            .replace(
                              /:([a-z0-9-]+):/g,
                              '<img src="/icons/instruments/$1.svg" alt="$1" class="inline-block w-5 h-5 rounded-full align-text-bottom" />'
                            ),
                        }}
                      />

                      {/* Like + Reply row */}
                      <div className="flex items-center gap-4 mt-1.5">
                        {/* Heart / Like */}
                        <button
                          onClick={() => toggleReaction(msg.id, "❤️")}
                          className={`flex items-center gap-1 text-xs transition ${
                            myLike
                              ? "text-red-500"
                              : "text-gray-400 hover:text-red-400"
                          }`}
                        >
                          <IconHeart filled={myLike} />
                          {likeCount > 0 && <span>{likeCount}</span>}
                        </button>

                        {/* Comment / replies */}
                        <button
                          onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                        >
                          <IconComment />
                          {replyCount > 0 && (
                            <span>{replyCount} ответ{replyCount === 1 ? "" : replyCount < 5 ? "а" : "ов"}</span>
                          )}
                        </button>
                      </div>

                      {/* Emoji reactions (non-heart) */}
                      {Object.keys(reactions).filter((e) => e !== "❤️").length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {Object.entries(reactions)
                            .filter(([emoji]) => emoji !== "❤️")
                            .map(([emoji, userIds]) => {
                              const myReaction = userIds.includes(session?.user?.id || "");
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg.id, emoji)}
                                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs transition border ${
                                    myReaction
                                      ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700"
                                      : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
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

                    {/* Hover actions toolbar */}
                    {isHovered && (
                      <div className="absolute top-0 right-2 flex items-center gap-0.5 bg-white dark:bg-gray-800 shadow-md rounded-lg px-1 py-0.5 border border-gray-200 dark:border-gray-700 z-10">
                        <button
                          onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 transition"
                          title="Ответить"
                        >
                          <IconReply />
                        </button>
                        <button
                          onClick={() => {
                            setInput((prev) => prev + `@${msg.user.displayName} `);
                            inputRef.current?.focus();
                          }}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 transition text-xs font-bold"
                          title="Упомянуть"
                        >
                          @
                        </button>
                        <button
                          onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 transition"
                          title="Реакция"
                        >
                          <IconSmile />
                        </button>
                      </div>
                    )}

                    {/* Quick reaction picker */}
                    {showReactionPicker === msg.id && (
                      <div className="absolute top-8 right-2 flex items-center gap-0.5 bg-white dark:bg-gray-800 shadow-lg rounded-lg px-1.5 py-1 border border-gray-200 dark:border-gray-700 z-20">
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
                </div>
              );
            })}
          </div>

          <div ref={bottomRef} />
        </div>

        {/* ── Reply preview bar ── */}
        {replyTo && (
          <div className="bg-green-50 dark:bg-green-900/20 border-t border-gray-100 dark:border-gray-800/30 px-4 py-2 flex items-center gap-2 shrink-0">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-green-600 dark:text-green-400 font-semibold">
                Ответ для {replyTo.user.displayName}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{replyTo.text}</div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Mention suggestions ── */}
        {mentionSearch !== null && mentionUsers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800/30 px-4 py-1.5 shrink-0">
            <div className="flex flex-wrap gap-1">
              {mentionUsers.slice(0, 8).map((u) => (
                <button
                  key={u.id}
                  onClick={() => selectMention(u.displayName)}
                  className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition text-gray-700 dark:text-gray-300"
                >
                  @{u.displayName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── INPUT AREA ── */}
        {isClosed || isArchived ? (
          <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800/30 px-4 py-3 text-center text-sm text-gray-500">
            {isArchived ? "Чат в архиве" : "Чат закрыт"}
          </div>
        ) : (
          <form
            onSubmit={sendMessage}
            className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800/30 px-4 py-3 flex items-center gap-2 shrink-0 relative"
          >
            {/* Paperclip / attach */}
            <button
              type="button"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              title="Прикрепить файл"
            >
              <IconPaperclip />
            </button>

            {/* Text input wrapper */}
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Написать сообщение..."
                className="w-full pl-3 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />

              {/* Emoji button inside input */}
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                <IconSmile />
              </button>
            </div>

            {/* Emoji picker popup */}
            {showEmojiPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                <div className="absolute bottom-16 left-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 w-72">
                  <div className="flex border-b border-gray-100 dark:border-gray-800/30">
                    {EMOJI_CATEGORIES.map((cat, i) => (
                      <button
                        key={cat.name}
                        type="button"
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
                    {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji) => {
                      const isCustom = typeof emoji === "string" && emoji.startsWith(":") && emoji.endsWith(":");
                      const slug = isCustom ? emoji.slice(1, -1) : "";
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-lg transition flex items-center justify-center"
                          title={isCustom ? slug : undefined}
                        >
                          {isCustom ? (
                            <img src={`/icons/instruments/${slug}.svg`} alt={slug} className="w-6 h-6 rounded-full" />
                          ) : emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Send button */}
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 shrink-0"
            >
              <IconSend />
            </button>
          </form>
        )}
      </div>
    </>
  );
}
