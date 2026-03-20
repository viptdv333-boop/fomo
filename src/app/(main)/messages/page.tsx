"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/layout/AuthGuard";
import { getSocket } from "@/lib/socket";

interface OtherUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface LastMessage {
  id: string;
  text: string;
  createdAt: string;
  senderId: string;
}

interface Conversation {
  id: string;
  updatedAt: string;
  otherUser: OtherUser | null;
  lastMessage: LastMessage | null;
  unread: boolean;
}

interface Message {
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

interface Contact {
  id: string;
  nickname: string | null;
  user: { id: string; displayName: string; avatarUrl: string | null; dmEnabled: boolean };
}

const CHAT_BACKGROUNDS = [
  { id: "default", label: "Стандартный", class: "" },
  { id: "green", label: "Голубой", class: "bg-gradient-to-b from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/20" },
  { id: "purple", label: "Фиолетовый", class: "bg-gradient-to-b from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20" },
  { id: "green", label: "Зелёный", class: "bg-gradient-to-b from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/20" },
  { id: "dark", label: "Тёмный", class: "bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-950" },
  { id: "warm", label: "Тёплый", class: "bg-gradient-to-b from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20" },
];

const EMOJI_CATEGORIES = [
  { name: "Часто", emojis: ["👍", "❤️", "😂", "🔥", "👎", "😊", "🎉", "💯", "🙏", "😭", "🤣", "😍", "🥰", "😘", "😎", "🤔"] },
  { name: "Лица", emojis: ["😀", "😃", "😄", "😁", "😅", "😆", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥"] },
  { name: "Жесты", emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏"] },
  { name: "Символы", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "⭐", "🌟", "✨", "⚡", "🔥", "💥", "🎉", "🎊", "💯", "✅", "❌", "⚠️", "🚀"] },
];

export default function MessagesPageWrapper() {
  return (
    <AuthGuard>
      <Suspense fallback={<div className="text-gray-500 py-12 text-center">Загрузка...</div>}>
        <MessagesPage />
      </Suspense>
    </AuthGuard>
  );
}

function MessagesPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(
    searchParams.get("conversation")
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [newText, setNewText] = useState("");
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [dmUsers, setDmUsers] = useState<{ id: string; displayName: string; fomoId: string | null; avatarUrl: string | null }[]>([]);
  const [contactFilter, setContactFilter] = useState("");

  // Emoji picker
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Chat settings
  const [chatBg, setChatBg] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("fomo-chat-bg") || "default";
    return "default";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [chatNotifications, setChatNotifications] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("fomo-chat-notif") !== "off";
    return true;
  });
  const [chatFontSize, setChatFontSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fomo-chat-font-v2");
      return saved ? Number(saved) : 1;
    }
    return 1;
  });

  // Contact/user context menu (right-click)
  const [userContextMenu, setUserContextMenu] = useState<{ userId: string; userName: string; convId?: string; x: number; y: number } | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("fomo-favorites") || "[]"); } catch { return []; }
    }
    return [];
  });
  const [pinnedChats, setPinnedChats] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("fomo-pinned-chats") || "[]"); } catch { return []; }
    }
    return [];
  });
  const [mutedChats, setMutedChats] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("fomo-muted-chats") || "[]"); } catch { return []; }
    }
    return [];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // No extra scroll hacks needed — layout handles overflow

  useEffect(() => {
    loadConversations();
    loadContacts();
  }, []);

  // Socket.IO for real-time DMs
  useEffect(() => {
    if (!session?.user?.id) return;
    const socket = getSocket(session.user.id);

    const handleNewDm = (msg: Message) => {
      // Only add if this is the active conversation
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Also refresh conversation list to update last message preview
      loadConversations();
    };

    socket.on("new_dm", handleNewDm);
    return () => { socket.off("new_dm", handleNewDm); };
  }, [session?.user?.id]);

  // Join/leave conversation socket rooms
  useEffect(() => {
    if (!session?.user?.id || !activeConvId) return;
    const socket = getSocket(session.user.id);
    socket.emit("join_conversation", activeConvId);
    return () => { socket.emit("leave_conversation", activeConvId); };
  }, [activeConvId, session?.user?.id]);

  useEffect(() => {
    if (activeConvId) {
      lastMsgIdRef.current = null;
      loadMessages(activeConvId);
      // Fallback polling at 10s (socket handles real-time)
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => loadMessages(activeConvId), 10000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeConvId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastId = messages[messages.length - 1]?.id;
    const prevId = lastMsgIdRef.current;
    // Only scroll if new messages appeared
    if (lastId !== prevId) {
      const isFirstLoad = prevId === null;
      lastMsgIdRef.current = lastId;
      const container = chatContainerRef.current;
      if (isFirstLoad) {
        // First load: always scroll to bottom instantly
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior }), 50);
      } else if (container) {
        // Subsequent: only if near bottom
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
  }, [messages]);

  async function loadConversations() {
    const res = await fetch("/api/messages/conversations");
    if (res.ok) setConversations(await res.json());
  }

  async function loadContacts() {
    const res = await fetch("/api/contacts");
    if (res.ok) setContacts(await res.json());
  }

  async function loadMessages(convId: string) {
    const res = await fetch(`/api/messages/conversations/${convId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim() || !activeConvId || sending) return;
    setSending(true);
    const res = await fetch(`/api/messages/conversations/${activeConvId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newText, replyToId: replyTo?.id }),
    });
    if (res.ok) {
      setNewText("");
      setReplyTo(null);
      setShowEmoji(false);
      await loadMessages(activeConvId);
      await loadConversations();
    }
    setSending(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConvId) return;
    if (file.size > 15 * 1024 * 1024) {
      alert("Файл слишком большой. Максимум 15 МБ.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "messages");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url, fileType } = await uploadRes.json();

      const res = await fetch(`/api/messages/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "",
          fileUrl: url,
          fileName: file.name,
          fileType: fileType || "document",
        }),
      });
      if (res.ok) {
        await loadMessages(activeConvId);
        await loadConversations();
      }
    } catch {
      alert("Ошибка загрузки файла");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function selectBg(bgId: string) {
    setChatBg(bgId);
    localStorage.setItem("fomo-chat-bg", bgId);
  }

  function toggleNotifications() {
    const next = !chatNotifications;
    setChatNotifications(next);
    localStorage.setItem("fomo-chat-notif", next ? "on" : "off");
  }

  function changeFontSize(size: number) {
    setChatFontSize(size);
    localStorage.setItem("fomo-chat-font-v2", String(size));
  }

  function toggleFavorite(userId: string) {
    const next = favorites.includes(userId)
      ? favorites.filter((id) => id !== userId)
      : [...favorites, userId];
    setFavorites(next);
    localStorage.setItem("fomo-favorites", JSON.stringify(next));
    setUserContextMenu(null);
  }

  function togglePinChat(convId: string) {
    const isPinned = pinnedChats.includes(convId);
    const next = isPinned
      ? pinnedChats.filter((id) => id !== convId)
      : pinnedChats.length >= 5
      ? pinnedChats
      : [...pinnedChats, convId];
    setPinnedChats(next);
    localStorage.setItem("fomo-pinned-chats", JSON.stringify(next));
  }

  function toggleMuteChat(convId: string) {
    const next = mutedChats.includes(convId)
      ? mutedChats.filter((id) => id !== convId)
      : [...mutedChats, convId];
    setMutedChats(next);
    localStorage.setItem("fomo-muted-chats", JSON.stringify(next));
  }

  function handleUserContextMenu(e: React.MouseEvent, userId: string, userName: string, convId?: string) {
    e.preventDefault();
    setUserContextMenu({ userId, userName, convId, x: e.clientX, y: e.clientY });
  }

  async function startConversation(userId: string) {
    const res = await fetch("/api/messages/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveConvId(data.id);
      await loadConversations();
      setTab("chats");
    }
  }

  async function addContact(userId: string) {
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: userId }),
    });
    await loadContacts();
  }

  async function removeContact(contactUserId: string) {
    await fetch(`/api/contacts?contactId=${contactUserId}`, { method: "DELETE" });
    await loadContacts();
  }

  async function deleteMessage(msgId: string) {
    if (!activeConvId) return;
    await fetch(`/api/messages/conversations/${activeConvId}/messages/${msgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    });
    await loadMessages(activeConvId);
  }

  async function pinMessage(msgId: string) {
    if (!activeConvId) return;
    await fetch(`/api/messages/conversations/${activeConvId}/messages/${msgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pin" }),
    });
    await loadMessages(activeConvId);
  }

  async function reactToMessage(msgId: string, emoji: string) {
    if (!activeConvId) return;
    await fetch(`/api/messages/conversations/${activeConvId}/messages/${msgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "react", emoji }),
    });
    await loadMessages(activeConvId);
  }

  function handleContextMenu(e: React.MouseEvent, msg: Message) {
    e.preventDefault();
    setContextMenu({ msg, x: e.clientX, y: e.clientY });
  }

  // All users for new chat dialog
  const [allChatUsers, setAllChatUsers] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);

  async function loadAllChatUsers() {
    const res = await fetch("/api/users/dm-enabled");
    if (res.ok) {
      const data = await res.json();
      setAllChatUsers(data.filter((u: any) => u.id !== session?.user?.id));
    }
  }

  async function searchUsers(query: string) {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      setSearchResults(data.filter((u: any) => u.id !== session?.user?.id));
    }
  }

  async function startNewChat(userId: string) {
    await startConversation(userId);
    setShowNewChat(false);
    setSearchQuery("");
    setSearchResults([]);
    setAllChatUsers([]);
  }

  async function loadDmUsers() {
    const res = await fetch("/api/users/dm-enabled");
    if (res.ok) {
      const data = await res.json();
      const contactIds = contacts.map(c => c.user.id);
      setDmUsers(data.filter((u: any) => u.id !== session?.user?.id && !contactIds.includes(u.id)));
    }
  }

  async function addContactFromList(userId: string) {
    await addContact(userId);
    setDmUsers(prev => prev.filter(u => u.id !== userId));
  }

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const myId = session?.user?.id;
  const bgClass = CHAT_BACKGROUNDS.find(b => b.id === chatBg)?.class || "";

  const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👎"];

  const filteredDmUsers = contactFilter
    ? dmUsers.filter(u =>
        u.displayName.toLowerCase().includes(contactFilter.toLowerCase()) ||
        (u.fomoId && u.fomoId.toLowerCase().includes(contactFilter.toLowerCase()))
      )
    : dmUsers;

  function renderFileAttachment(msg: Message) {
    if (!msg.fileUrl) return null;
    if (msg.fileType === "image") {
      return (
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1">
          <img src={msg.fileUrl} alt={msg.fileName || "image"} className="max-w-[240px] max-h-[200px] rounded-lg object-cover" />
        </a>
      );
    }
    if (msg.fileType === "video") {
      return (
        <video src={msg.fileUrl} controls className="max-w-[280px] max-h-[200px] rounded-lg mt-1" />
      );
    }
    // Document
    return (
      <a
        href={msg.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 mt-1 px-3 py-2 bg-white/20 dark:bg-black/20 rounded-lg hover:bg-white/30 dark:hover:bg-black/30 transition"
      >
        <span className="text-lg">📎</span>
        <span className="text-xs truncate max-w-[180px]">{msg.fileName || "Файл"}</span>
      </a>
    );
  }

  return (
    <div className="flex bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden flex-1 min-h-0">
      {/* Sidebar — full width on mobile, fixed width on desktop */}
      <div className={`${activeConvId ? "hidden md:flex" : "flex"} w-full md:w-80 border-r dark:border-gray-700 flex-col`}>
        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700">
          <button
            onClick={() => setTab("chats")}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === "chats"
                ? "text-green-600 border-b-2 border-green-600 dark:text-green-400 dark:border-green-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Чаты
          </button>
          <button
            onClick={() => setTab("contacts")}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === "contacts"
                ? "text-green-600 border-b-2 border-green-600 dark:text-green-400 dark:border-green-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Контакты
          </button>
        </div>

        {/* New Chat Button — only in Chats tab */}
        {tab === "chats" && (
          <div className="px-3 py-2 border-b dark:border-gray-700">
            <button
              onClick={() => { setShowNewChat(true); loadAllChatUsers(); }}
              className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
            >
              + Начать новый чат
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {tab === "chats" && (
            <>
              {conversations.length === 0 ? (
                <div className="p-4 text-gray-400 dark:text-gray-500 text-sm text-center">
                  Нет диалогов
                </div>
              ) : (
                [...conversations]
                  .sort((a, b) => {
                    const aPin = pinnedChats.includes(a.id);
                    const bPin = pinnedChats.includes(b.id);
                    if (aPin && !bPin) return -1;
                    if (!aPin && bPin) return 1;
                    const aFav = favorites.includes(a.otherUser?.id || "");
                    const bFav = favorites.includes(b.otherUser?.id || "");
                    if (aFav && !bFav) return -1;
                    if (!aFav && bFav) return 1;
                    return 0;
                  })
                  .map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConvId(conv.id)}
                    onContextMenu={(e) => conv.otherUser && handleUserContextMenu(e, conv.otherUser.id, conv.otherUser.displayName, conv.id)}
                    className={`w-full text-left px-4 py-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
                      activeConvId === conv.id ? "bg-green-50 dark:bg-green-900/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm overflow-hidden shrink-0">
                        {conv.otherUser?.avatarUrl ? (
                          <img src={conv.otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          conv.otherUser?.displayName?.[0] || "?"
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-center">
                          <span className={`text-sm font-medium truncate ${conv.unread ? "text-black dark:text-white" : "text-gray-700 dark:text-gray-300"}`}>
                            {pinnedChats.includes(conv.id) && <span className="text-gray-400 mr-1 text-[10px]">📌</span>}
                            {mutedChats.includes(conv.id) && <span className="text-gray-400 mr-1 text-[10px]">🔕</span>}
                            {favorites.includes(conv.otherUser?.id || "") && <span className="text-amber-400 mr-1">★</span>}
                            {conv.otherUser?.displayName || "Удалённый пользователь"}
                          </span>
                          {conv.lastMessage && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 shrink-0">
                              {new Date(conv.lastMessage.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {conv.lastMessage && (
                          <p className={`text-xs truncate ${conv.unread ? "text-gray-800 dark:text-gray-100 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                            {conv.lastMessage.senderId === myId ? "Вы: " : ""}
                            {conv.lastMessage.text || "📎 Файл"}
                          </p>
                        )}
                      </div>
                      {conv.unread && (
                        <div className="w-2.5 h-2.5 rounded-full bg-green-600 shrink-0"></div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </>
          )}

          {tab === "contacts" && (
            <>
              <div className="px-3 py-2 border-b dark:border-gray-700">
                <button
                  onClick={() => { setContactFilter(""); loadDmUsers(); setShowAddContact(true); }}
                  className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                >
                  + Добавить контакт
                </button>
              </div>
              {contacts.length === 0 ? (
                <div className="p-4 text-gray-400 dark:text-gray-500 text-sm text-center">
                  Нет контактов
                </div>
              ) : (
                [...contacts]
                  .sort((a, b) => {
                    const aFav = favorites.includes(a.user.id);
                    const bFav = favorites.includes(b.user.id);
                    if (aFav && !bFav) return -1;
                    if (!aFav && bFav) return 1;
                    if (aFav && bFav) return (a.user.displayName || "").localeCompare(b.user.displayName || "", "ru");
                    return 0;
                  })
                  .map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onContextMenu={(e) => handleUserContextMenu(e, c.user.id, c.user.displayName)}
                  >
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm overflow-hidden shrink-0">
                      {c.user.avatarUrl ? (
                        <img src={c.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        c.user.displayName[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate hover:text-green-600 dark:text-gray-100 dark:hover:text-green-400 cursor-pointer" onClick={() => startConversation(c.user.id)}>
                        {favorites.includes(c.user.id) && <span className="text-amber-400 mr-1">★</span>}
                        {c.nickname || c.user.displayName}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {c.user.dmEnabled && (
                        <button
                          onClick={() => startConversation(c.user.id)}
                          className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 px-2 py-1"
                        >
                          Написать
                        </button>
                      )}
                      <button
                        onClick={() => removeContact(c.user.id)}
                        className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat area — full width on mobile when chat selected */}
      <div className={`${activeConvId ? "flex" : "hidden md:flex"} flex-1 flex-col`}>
        {activeConvId && activeConv ? (
          <>
            {/* Header */}
            <div className="px-3 sm:px-6 py-3 border-b dark:border-gray-700 flex items-center gap-3">
              {/* Mobile back button */}
              <button
                onClick={() => setActiveConvId(null)}
                className="md:hidden p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm overflow-hidden">
                {activeConv.otherUser?.avatarUrl ? (
                  <img src={activeConv.otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  activeConv.otherUser?.displayName?.[0] || "?"
                )}
              </div>
              <Link href={`/profile/${activeConv.otherUser?.id}`} className="font-medium hover:text-green-600 dark:text-gray-100 dark:hover:text-green-400">
                {activeConv.otherUser?.displayName || "Удалённый пользователь"}
              </Link>

              {/* Add to contacts */}
              {activeConv.otherUser && !contacts.find((c) => c.user.id === activeConv.otherUser!.id) && (
                <button
                  onClick={() => addContact(activeConv.otherUser!.id)}
                  className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                >
                  + В контакты
                </button>
              )}

              {/* Settings gear */}
              <div className="ml-auto relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  title="Настройки чата"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                {showSettings && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 shadow-lg border dark:border-gray-700 rounded-xl p-4 z-50 w-64" onClick={(e) => e.stopPropagation()}>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Настройки чата</div>

                    {/* Background */}
                    <div className="mb-4">
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">Фон чата</div>
                      <div className="grid grid-cols-3 gap-2">
                        {CHAT_BACKGROUNDS.map(bg => (
                          <button
                            key={bg.id}
                            onClick={() => selectBg(bg.id)}
                            className={`h-10 rounded-lg border-2 transition ${
                              bg.class || "bg-white dark:bg-gray-900"
                            } ${chatBg === bg.id ? "border-green-500" : "border-gray-200 dark:border-gray-700"}`}
                            title={bg.label}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Notifications */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-gray-600 dark:text-gray-300">Уведомления</span>
                      <button
                        onClick={toggleNotifications}
                        className={`w-10 h-5 rounded-full transition-colors ${chatNotifications ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"} relative`}
                      >
                        <span className={`block w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${chatNotifications ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>

                    {/* Font size slider */}
                    <div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">Размер шрифта: {chatFontSize}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">0</span>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={1}
                          value={chatFontSize}
                          onChange={(e) => changeFontSize(Number(e.target.value))}
                          className="flex-1 accent-green-600"
                        />
                        <span className="text-xs text-gray-400">10</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pinned messages */}
            {messages.filter((m) => m.isPinned).length > 0 && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b dark:border-gray-700 text-xs text-amber-700 dark:text-amber-400">
                📌 Закреплено: {messages.filter((m) => m.isPinned).map((m) => m.text.slice(0, 40) || "📎 Файл").join(", ")}
              </div>
            )}

            {/* Messages */}
            <div
              ref={chatContainerRef}
              style={{ fontSize: `${12 + chatFontSize * 2}px` }}
              className={`flex-1 overflow-y-auto p-4 space-y-3 ${bgClass}`}
              onClick={() => { setContextMenu(null); setShowSettings(false); setUserContextMenu(null); }}
            >
              {messages.map((msg) => {
                const isMe = msg.senderId === myId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"} group`}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    <div className="max-w-[75vw] sm:max-w-xs">
                      {/* Reply preview */}
                      {msg.replyTo && !msg.isDeleted && (
                        <div
                          className={`text-[11px] px-3 py-1 mb-0.5 rounded-t-lg border-l-2 ${
                            isMe
                              ? "border-red-300 bg-red-700/50 text-red-100"
                              : "border-green-300 bg-green-700/50 text-green-100"
                          }`}
                        >
                          <span className="font-medium">{msg.replyTo.sender.displayName}</span>
                          <p className="truncate">{msg.replyTo.text.slice(0, 60)}</p>
                        </div>
                      )}
                      <div
                        style={{ padding: `${6 + chatFontSize * 1.5}px ${12 + chatFontSize * 2}px` }}
                        className={`rounded-2xl relative ${
                          msg.isDeleted
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 italic"
                            : isMe
                            ? "bg-red-600 text-white rounded-br-md"
                            : "bg-green-600 text-white rounded-bl-md"
                        } ${msg.isPinned ? "ring-1 ring-amber-400" : ""}`}
                      >
                        {!msg.isDeleted && renderFileAttachment(msg)}
                        {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                        {msg.isDeleted && <p className="whitespace-pre-wrap break-words">Сообщение удалено</p>}
                        <div className="flex items-center gap-1 mt-1">
                          {msg.isPinned && <span className="text-[10px]">📌</span>}
                          <span
                            className={`text-[10px] ${
                              isMe ? "text-red-200" : "text-green-200"
                            }`}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString("ru", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className={`flex gap-1 mt-1 flex-wrap ${isMe ? "justify-end" : ""}`}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => (
                            <button
                              key={emoji}
                              onClick={() => reactToMessage(msg.id, emoji)}
                              className={`text-xs px-1.5 py-0.5 rounded-full border transition ${
                                (users as string[]).includes(myId || "")
                                  ? "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700"
                                  : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                              }`}
                            >
                              {emoji} {(users as string[]).length}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Quick reactions on hover — absolute so no layout shift */}
                      {!msg.isDeleted && (
                        <div className={`flex gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${isMe ? "justify-end" : ""}`}>
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => reactToMessage(msg.id, emoji)}
                              className="text-xs hover:scale-125 transition-transform"
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
              <div ref={messagesEndRef} />
            </div>

            {/* Context Menu */}
            {contextMenu && (
              <div
                className="fixed bg-white dark:bg-gray-800 shadow-lg border dark:border-gray-700 rounded-lg py-1 z-50 min-w-[160px]"
                style={{ top: contextMenu.y, left: contextMenu.x }}
              >
                <button
                  onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  ↩ Ответить
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(contextMenu.msg.text); setContextMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  📋 Копировать
                </button>
                <button
                  onClick={() => { setNewText(`> ${contextMenu.msg.sender.displayName}: ${contextMenu.msg.text}\n\n`); setContextMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  💬 Цитировать
                </button>
                <button
                  onClick={() => { pinMessage(contextMenu.msg.id); setContextMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  {contextMenu.msg.isPinned ? "📌 Открепить" : "📌 Закрепить"}
                </button>
                {contextMenu.msg.senderId === myId && !contextMenu.msg.isDeleted && (
                  <button
                    onClick={() => { deleteMessage(contextMenu.msg.id); setContextMenu(null); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    🗑 Удалить
                  </button>
                )}
              </div>
            )}

            {/* Reply preview */}
            {replyTo && (
              <div className="px-4 py-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
                <div className="flex-1 border-l-2 border-green-500 pl-3">
                  <div className="text-xs font-medium text-green-600 dark:text-green-400">
                    {replyTo.sender.displayName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {replyTo.text.slice(0, 80) || "📎 Файл"}
                  </div>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  ✕
                </button>
              </div>
            )}

            {/* Emoji Picker */}
            {showEmoji && (
              <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
                <div className="flex gap-2 mb-2">
                  {EMOJI_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.name}
                      onClick={() => setEmojiCategory(i)}
                      className={`text-xs px-3 py-1 rounded-full transition ${
                        emojiCategory === i
                          ? "bg-green-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-1 max-h-[120px] overflow-y-auto">
                  {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      onClick={() => setNewText(prev => prev + emoji)}
                      className="text-xl hover:scale-125 transition-transform p-1 text-center"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={sendMessage} className="border-t dark:border-gray-700 px-4 py-3 flex gap-2 items-center">
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg shrink-0 disabled:opacity-50"
                title="Прикрепить файл"
              >
                {uploading ? (
                  <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin" />
                ) : (
                  "📎"
                )}
              </button>

              {/* Emoji toggle */}
              <button
                type="button"
                onClick={() => setShowEmoji(!showEmoji)}
                className={`text-lg shrink-0 transition ${showEmoji ? "text-green-600" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
                title="Эмодзи"
              >
                😊
              </button>

              <input
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder={replyTo ? "Ответить..." : "Написать сообщение..."}
                className="flex-1 px-4 py-2 border rounded-full text-sm focus:ring-2 focus:ring-green-500 focus:outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={sending || (!newText.trim() && !uploading)}
                className="bg-green-600 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                →
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
            Выберите диалог или начните новый
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowNewChat(false); setAllChatUsers([]); }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 w-[90vw] sm:w-96 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-gray-100">Новый чат</h3>
              <button onClick={() => { setShowNewChat(false); setAllChatUsers([]); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск пользователей..."
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 mb-3"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-1">
              {(() => {
                const filtered = allChatUsers.filter((u) =>
                  searchQuery.length === 0 || u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (allChatUsers.length === 0) {
                  return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Загрузка...</p>;
                }
                if (filtered.length === 0) {
                  return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Никого не найдено</p>;
                }
                return filtered.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => startNewChat(user.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm shrink-0 overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        user.displayName[0]
                      )}
                    </div>
                    <span className="text-sm font-medium dark:text-gray-100">{user.displayName}</span>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal with Search */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddContact(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 w-[90vw] sm:w-[440px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-gray-100">Добавить контакт</h3>
              <button onClick={() => setShowAddContact(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              placeholder="Поиск по имени или ID..."
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:outline-none dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 mb-3"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredDmUsers.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  {contactFilter ? "Никого не найдено" : "Нет доступных пользователей"}
                </p>
              )}
              {filteredDmUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm shrink-0 overflow-hidden">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      user.displayName[0]
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium dark:text-gray-100 truncate">
                      {user.displayName}
                    </div>
                    {user.fomoId && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        #{user.fomoId}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => addContactFromList(user.id)}
                    className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition shrink-0"
                  >
                    Добавить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User context menu (right-click on contact/chat) */}
      {userContextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setUserContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setUserContextMenu(null); }}
        >
          <div
            className="absolute bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700 py-1 w-48"
            style={{ left: userContextMenu.x, top: userContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 truncate border-b dark:border-gray-700">
              {userContextMenu.userName}
            </div>
            <button
              onClick={() => toggleFavorite(userContextMenu.userId)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 flex items-center gap-2"
            >
              {favorites.includes(userContextMenu.userId) ? (
                <><span className="text-amber-400">★</span> Убрать из избранного</>
              ) : (
                <><span className="text-gray-300">☆</span> В избранное</>
              )}
            </button>
            {userContextMenu.convId && (
              <>
                <button
                  onClick={() => { togglePinChat(userContextMenu.convId!); setUserContextMenu(null); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 flex items-center gap-2"
                >
                  {pinnedChats.includes(userContextMenu.convId) ? (
                    <>📌 Открепить</>
                  ) : (
                    <>📌 Закрепить{pinnedChats.length >= 5 ? " (макс. 5)" : ""}</>
                  )}
                </button>
                <button
                  onClick={() => { toggleMuteChat(userContextMenu.convId!); setUserContextMenu(null); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 flex items-center gap-2"
                >
                  {mutedChats.includes(userContextMenu.convId) ? (
                    <>🔔 Включить уведомления</>
                  ) : (
                    <>🔕 Отключить уведомления</>
                  )}
                </button>
              </>
            )}
            <button
              onClick={() => { removeContact(userContextMenu.userId); setUserContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-red-500 dark:text-red-400 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Удалить
            </button>
            <button
              onClick={() => { /* TODO: block user */ setUserContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
              Заблокировать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
