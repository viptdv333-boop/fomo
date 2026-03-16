"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/layout/AuthGuard";

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
  const [showContacts, setShowContacts] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    msg: Message;
    x: number;
    y: number;
  } | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [dmUsers, setDmUsers] = useState<{ id: string; displayName: string; fomoId: string | null; avatarUrl: string | null }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadConversations();
    loadContacts();
  }, []);

  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId);
      // Poll for new messages every 3s
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => loadMessages(activeConvId), 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      await loadMessages(activeConvId);
      await loadConversations();
    }
    setSending(false);
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

  const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👎"];

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r dark:border-gray-700 flex flex-col">
        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700">
          <button
            onClick={() => setTab("chats")}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === "chats"
                ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Чаты
          </button>
          <button
            onClick={() => setTab("contacts")}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === "contacts"
                ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Контакты
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 py-2 border-b dark:border-gray-700">
          <button
            onClick={() => setShowNewChat(true)}
            className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            + Начать новый чат
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {tab === "chats" && (
            <>
              {conversations.length === 0 ? (
                <div className="p-4 text-gray-400 dark:text-gray-500 text-sm text-center">
                  Нет диалогов
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConvId(conv.id)}
                    className={`w-full text-left px-4 py-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
                      activeConvId === conv.id ? "bg-blue-50 dark:bg-blue-900/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm overflow-hidden shrink-0">
                        {conv.otherUser?.avatarUrl ? (
                          <img src={conv.otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          conv.otherUser?.displayName?.[0] || "?"
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-center">
                          <span className={`text-sm font-medium truncate ${conv.unread ? "text-black dark:text-white" : "text-gray-700 dark:text-gray-300"}`}>
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
                            {conv.lastMessage.text}
                          </p>
                        )}
                      </div>
                      {conv.unread && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></div>
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
                  onClick={() => { loadDmUsers(); setShowAddContact(true); }}
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
                contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm overflow-hidden shrink-0">
                      {c.user.avatarUrl ? (
                        <img src={c.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        c.user.displayName[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/profile/${c.user.id}`} className="text-sm font-medium truncate hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400">
                        {c.nickname || c.user.displayName}
                      </Link>
                    </div>
                    <div className="flex gap-1">
                      {c.user.dmEnabled && (
                        <button
                          onClick={() => startConversation(c.user.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-1"
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

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {activeConvId && activeConv ? (
          <>
            {/* Header */}
            <div className="px-6 py-3 border-b dark:border-gray-700 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm overflow-hidden">
                {activeConv.otherUser?.avatarUrl ? (
                  <img src={activeConv.otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  activeConv.otherUser?.displayName?.[0] || "?"
                )}
              </div>
              <Link href={`/profile/${activeConv.otherUser?.id}`} className="font-medium hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400">
                {activeConv.otherUser?.displayName || "Удалённый пользователь"}
              </Link>
              {/* Add to contacts button */}
              {activeConv.otherUser && !contacts.find((c) => c.user.id === activeConv.otherUser!.id) && (
                <button
                  onClick={() => addContact(activeConv.otherUser!.id)}
                  className="ml-auto text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  + В контакты
                </button>
              )}
            </div>

            {/* Pinned messages */}
            {messages.filter((m) => m.isPinned).length > 0 && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b dark:border-gray-700 text-xs text-amber-700 dark:text-amber-400">
                📌 Закреплено: {messages.filter((m) => m.isPinned).map((m) => m.text.slice(0, 40)).join(", ")}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" onClick={() => setContextMenu(null)}>
              {messages.map((msg) => {
                const isMe = msg.senderId === myId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"} group`}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    <div className="max-w-xs">
                      {/* Reply preview */}
                      {msg.replyTo && !msg.isDeleted && (
                        <div
                          className={`text-[11px] px-3 py-1 mb-0.5 rounded-t-lg border-l-2 border-blue-400 ${
                            isMe
                              ? "bg-blue-700/50 text-blue-100"
                              : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          <span className="font-medium">{msg.replyTo.sender.displayName}</span>
                          <p className="truncate">{msg.replyTo.text.slice(0, 60)}</p>
                        </div>
                      )}
                      <div
                        className={`px-4 py-2 rounded-2xl text-sm relative ${
                          msg.isDeleted
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 italic"
                            : isMe
                            ? "bg-blue-600 text-white rounded-br-md"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-md"
                        } ${msg.isPinned ? "ring-1 ring-amber-400" : ""}`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        <div className={`flex items-center gap-1 mt-1`}>
                          {msg.isPinned && <span className="text-[10px]">📌</span>}
                          <span
                            className={`text-[10px] ${
                              isMe ? "text-blue-200" : "text-gray-400 dark:text-gray-500"
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
                        <div className={`flex gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => (
                            <button
                              key={emoji}
                              onClick={() => reactToMessage(msg.id, emoji)}
                              className={`text-xs px-1.5 py-0.5 rounded-full border transition ${
                                (users as string[]).includes(myId || "")
                                  ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
                                  : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                              }`}
                            >
                              {emoji} {(users as string[]).length}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Quick reactions on hover */}
                      {!msg.isDeleted && (
                        <div className={`hidden group-hover:flex gap-0.5 mt-1 ${isMe ? "justify-end" : ""}`}>
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
                  onClick={() => {
                    setReplyTo(contextMenu.msg);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  ↩ Ответить
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenu.msg.text);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  📋 Копировать
                </button>
                <button
                  onClick={() => {
                    setNewText(`> ${contextMenu.msg.sender.displayName}: ${contextMenu.msg.text}\n\n`);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  💬 Цитировать
                </button>
                <button
                  onClick={() => {
                    pinMessage(contextMenu.msg.id);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
                >
                  {contextMenu.msg.isPinned ? "📌 Открепить" : "📌 Закрепить"}
                </button>
                {contextMenu.msg.senderId === myId && !contextMenu.msg.isDeleted && (
                  <button
                    onClick={() => {
                      deleteMessage(contextMenu.msg.id);
                      setContextMenu(null);
                    }}
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
                <div className="flex-1 border-l-2 border-blue-500 pl-3">
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {replyTo.sender.displayName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {replyTo.text.slice(0, 80)}
                  </div>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input */}
            <form onSubmit={sendMessage} className="border-t dark:border-gray-700 px-4 py-3 flex gap-2">
              <input
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder={replyTo ? "Ответить..." : "Написать сообщение..."}
                className="flex-1 px-4 py-2 border rounded-full text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={sending || !newText.trim()}
                className="bg-blue-600 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewChat(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-96 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-gray-100">Новый чат</h3>
              <button onClick={() => setShowNewChat(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">
                ✕
              </button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Поиск пользователей..."
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 mb-3"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-1">
              {searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Никого не найдено</p>
              )}
              {searchQuery.length < 2 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Введите имя для поиска</p>
              )}
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => startNewChat(user.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm shrink-0 overflow-hidden">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      user.displayName[0]
                    )}
                  </div>
                  <span className="text-sm font-medium dark:text-gray-100">{user.displayName}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddContact(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-[440px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-gray-100">Добавить контакт</h3>
              <button onClick={() => setShowAddContact(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {dmUsers.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Нет доступных пользователей</p>
              )}
              {dmUsers.map((user) => (
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
                        @{user.fomoId}
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
    </div>
  );
}
