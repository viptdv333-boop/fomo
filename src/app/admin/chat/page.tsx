"use client";

import { useEffect, useState } from "react";

interface ChatRoom {
  id: string;
  name: string;
  categoryLabel: string | null;
  sortOrder: number;
  isGeneral: boolean;
  isArchived: boolean;
  isClosed: boolean;
  instrumentId: string | null;
  instrument: { id: string; name: string; ticker: string | null } | null;
  _count: { messages: number };
}

interface Message {
  id: string;
  text: string;
  createdAt: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

const CATEGORY_OPTIONS = [
  "", "Сырьё", "Металлы", "Индексы", "Валюты", "Крипта", "РФ Акции", "США Акции", "Другое",
];

export default function AdminChatPage() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit form
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSort, setFormSort] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Messages viewer
  const [viewRoomId, setViewRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgPage, setMsgPage] = useState(1);
  const [msgPages, setMsgPages] = useState(1);

  async function loadRooms() {
    const res = await fetch("/api/admin/chat");
    if (res.ok) setRooms(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadRooms(); }, []);

  async function loadMessages(roomId: string, page = 1) {
    const res = await fetch(`/api/admin/chat/messages?roomId=${roomId}&page=${page}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      setMsgTotal(data.total);
      setMsgPage(data.page);
      setMsgPages(data.pages);
    }
  }

  async function handleCreate() {
    if (!formName.trim()) return;
    const res = await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, categoryLabel: formCategory || null, sortOrder: formSort }),
    });
    if (res.ok) {
      setFormName(""); setFormCategory(""); setFormSort(0);
      loadRooms();
    }
  }

  async function handleUpdate() {
    if (!editingId || !formName.trim()) return;
    await fetch("/api/admin/chat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, name: formName, categoryLabel: formCategory || null, sortOrder: formSort }),
    });
    setEditingId(null); setFormName(""); setFormCategory(""); setFormSort(0);
    loadRooms();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить комнату и все сообщения?")) return;
    await fetch(`/api/admin/chat?id=${id}`, { method: "DELETE" });
    loadRooms();
  }

  async function handleToggle(id: string, field: "isArchived" | "isClosed", value: boolean) {
    await fetch("/api/admin/chat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: !value }),
    });
    loadRooms();
  }

  async function handleDeleteMessage(msgId: string) {
    if (!confirm("Удалить сообщение?")) return;
    await fetch(`/api/admin/chat/messages?id=${msgId}`, { method: "DELETE" });
    if (viewRoomId) loadMessages(viewRoomId, msgPage);
    loadRooms();
  }

  function startEdit(room: ChatRoom) {
    setEditingId(room.id);
    setFormName(room.name);
    setFormCategory(room.categoryLabel || "");
    setFormSort(room.sortOrder);
  }

  function cancelEdit() {
    setEditingId(null); setFormName(""); setFormCategory(""); setFormSort(0);
  }

  // Group rooms by categoryLabel
  const grouped = new Map<string, ChatRoom[]>();
  rooms.forEach(r => {
    const key = r.categoryLabel || (r.isGeneral ? "Общие" : r.instrumentId ? "Инструменты" : "Без категории");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Управление болталкой</h1>

      {/* Create/Edit form */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          {editingId ? "Редактировать комнату" : "Создать комнату"}
        </h2>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Название</label>
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Название темы..."
              className="block mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 w-64"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Категория</label>
            <select
              value={formCategory}
              onChange={e => setFormCategory(e.target.value)}
              className="block mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100"
            >
              {CATEGORY_OPTIONS.map(c => (
                <option key={c} value={c}>{c || "— Без категории —"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Сортировка</label>
            <input
              type="number"
              value={formSort}
              onChange={e => setFormSort(Number(e.target.value))}
              className="block mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 w-20"
            />
          </div>
          {editingId ? (
            <div className="flex gap-2">
              <button onClick={handleUpdate} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">Сохранить</button>
              <button onClick={cancelEdit} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300">Отмена</button>
            </div>
          ) : (
            <button onClick={handleCreate} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">Создать</button>
          )}
        </div>
      </div>

      {/* Rooms table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([label, groupRooms]) => (
            <div key={label}>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{label}</h3>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
                {groupRooms.map(room => (
                  <div key={room.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800/30 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{room.name}</span>
                        {room.isGeneral && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">Общий</span>}
                        {room.isArchived && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">Архив</span>}
                        {room.isClosed && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-500 rounded">Закрыт</span>}
                        {room.instrument && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-500 rounded">#{room.instrument.ticker}</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {room._count.messages} сообщений
                        {room.categoryLabel && <span className="ml-2">• {room.categoryLabel}</span>}
                      </div>
                    </div>

                    <button
                      onClick={() => { setViewRoomId(room.id); loadMessages(room.id); }}
                      className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      Сообщения
                    </button>
                    <button onClick={() => startEdit(room)} className="text-xs text-gray-500 hover:text-green-600">
                      Редактировать
                    </button>
                    <button
                      onClick={() => handleToggle(room.id, "isArchived", room.isArchived)}
                      className="text-xs text-gray-500 hover:text-amber-600"
                    >
                      {room.isArchived ? "Восстановить" : "Архивировать"}
                    </button>
                    {!room.isGeneral && (
                      <button onClick={() => handleDelete(room.id)} className="text-xs text-red-500 hover:text-red-700">
                        Удалить
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages modal */}
      {viewRoomId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setViewRoomId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold dark:text-gray-100">
                Сообщения ({msgTotal})
              </h3>
              <button onClick={() => setViewRoomId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 ? (
                <div className="text-gray-400 text-center py-8">Нет сообщений</div>
              ) : messages.map(msg => (
                <div key={msg.id} className="flex items-start gap-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{msg.user.displayName}</span>
                      <span className="text-[10px] text-gray-400">{new Date(msg.createdAt).toLocaleString("ru")}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 break-words">{msg.text}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 shrink-0 transition"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
            {msgPages > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  disabled={msgPage <= 1}
                  onClick={() => { if (viewRoomId) loadMessages(viewRoomId, msgPage - 1); }}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-30 dark:border-gray-700 dark:text-gray-300"
                >
                  ← Назад
                </button>
                <span className="text-xs text-gray-400">{msgPage} / {msgPages}</span>
                <button
                  disabled={msgPage >= msgPages}
                  onClick={() => { if (viewRoomId) loadMessages(viewRoomId, msgPage + 1); }}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-30 dark:border-gray-700 dark:text-gray-300"
                >
                  Далее →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
