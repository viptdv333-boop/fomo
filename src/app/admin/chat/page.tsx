"use client";

import { useEffect, useState, useCallback } from "react";

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

export default function AdminChatPage() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit form
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formNewCategory, setFormNewCategory] = useState("");
  const [formSort, setFormSort] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Category management
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);

  // Messages viewer
  const [viewRoomId, setViewRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgPage, setMsgPage] = useState(1);
  const [msgPages, setMsgPages] = useState(1);

  // Extract unique categories from rooms
  const categories = Array.from(new Set(rooms.map((r) => r.categoryLabel).filter(Boolean))) as string[];

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/admin/chat");
    if (res.ok) setRooms(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

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
    const cat = formNewCategory.trim() || formCategory || null;
    const res = await fetch("/api/admin/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, categoryLabel: cat, sortOrder: formSort }),
    });
    if (res.ok) {
      setFormName(""); setFormCategory(""); setFormNewCategory(""); setFormSort(0);
      loadRooms();
    }
  }

  async function handleUpdate() {
    if (!editingId || !formName.trim()) return;
    const cat = formNewCategory.trim() || formCategory || null;
    await fetch("/api/admin/chat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, name: formName, categoryLabel: cat, sortOrder: formSort }),
    });
    setEditingId(null); setFormName(""); setFormCategory(""); setFormNewCategory(""); setFormSort(0);
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

  // Move room up/down within its category group
  async function moveRoom(roomId: string, direction: "up" | "down") {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const sameCategory = rooms
      .filter((r) => r.categoryLabel === room.categoryLabel)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sameCategory.findIndex((r) => r.id === roomId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameCategory.length) return;

    const other = sameCategory[swapIdx];
    // Swap sortOrders
    await Promise.all([
      fetch("/api/admin/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: room.id, sortOrder: other.sortOrder }),
      }),
      fetch("/api/admin/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: other.id, sortOrder: room.sortOrder }),
      }),
    ]);
    loadRooms();
  }

  function startEdit(room: ChatRoom) {
    setEditingId(room.id);
    setFormName(room.name);
    setFormCategory(room.categoryLabel || "");
    setFormNewCategory("");
    setFormSort(room.sortOrder);
  }

  function cancelEdit() {
    setEditingId(null); setFormName(""); setFormCategory(""); setFormNewCategory(""); setFormSort(0);
  }

  // Group rooms by categoryLabel
  const grouped = new Map<string, ChatRoom[]>();
  rooms.forEach((r) => {
    const key = r.categoryLabel || (r.isGeneral ? "Общие" : "Без категории");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  });
  // Sort rooms within each group
  grouped.forEach((g) => g.sort((a, b) => a.sortOrder - b.sortOrder));

  const inputCls = "px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100";

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
            <input value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Название комнаты..." className={`block mt-1 w-64 ${inputCls}`} />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Категория</label>
            <select value={formCategory} onChange={(e) => { setFormCategory(e.target.value); setFormNewCategory(""); }}
              className={`block mt-1 ${inputCls}`}>
              <option value="">— Без категории —</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__new__">+ Новая категория</option>
            </select>
          </div>
          {(formCategory === "__new__") && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Новая категория</label>
              <input value={formNewCategory} onChange={(e) => setFormNewCategory(e.target.value)}
                placeholder="Название..." className={`block mt-1 w-48 ${inputCls}`} />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Порядок</label>
            <input type="number" value={formSort} onChange={(e) => setFormSort(Number(e.target.value))}
              className={`block mt-1 w-20 ${inputCls}`} />
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

      {/* Rooms by category */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([label, groupRooms]) => (
            <div key={label}>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{label} ({groupRooms.length})</h3>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
                {groupRooms.map((room, idx) => (
                  <div key={room.id} className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 dark:border-gray-800/30 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    {/* Sort arrows */}
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveRoom(room.id, "up")} disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs leading-none">▲</button>
                      <button onClick={() => moveRoom(room.id, "down")} disabled={idx === groupRooms.length - 1}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs leading-none">▼</button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{room.name}</span>
                        {room.isGeneral && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">Общий</span>}
                        {room.isArchived && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">Архив</span>}
                        {room.isClosed && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-500 rounded">Закрыт</span>}
                        {room.instrument && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-500 rounded">#{room.instrument.ticker}</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {room._count.messages} сообщ. • порядок: {room.sortOrder}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setViewRoomId(room.id); loadMessages(room.id); }}
                        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">Сообщения</button>
                      <button onClick={() => startEdit(room)} className="text-xs text-gray-500 hover:text-green-600">Ред.</button>
                      <button onClick={() => handleToggle(room.id, "isArchived", room.isArchived)}
                        className="text-xs text-gray-500 hover:text-amber-600">
                        {room.isArchived ? "Вернуть" : "Архив"}
                      </button>
                      <button onClick={() => handleToggle(room.id, "isClosed", room.isClosed)}
                        className="text-xs text-gray-500 hover:text-orange-600">
                        {room.isClosed ? "Открыть" : "Закрыть"}
                      </button>
                      {!room.isGeneral && (
                        <button onClick={() => handleDelete(room.id)} className="text-xs text-red-500 hover:text-red-700">Удалить</button>
                      )}
                    </div>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold dark:text-gray-100">Сообщения ({msgTotal})</h3>
              <button onClick={() => setViewRoomId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 ? (
                <div className="text-gray-400 text-center py-8">Нет сообщений</div>
              ) : messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{msg.user.displayName}</span>
                      <span className="text-[10px] text-gray-400">{new Date(msg.createdAt).toLocaleString("ru")}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 break-words">{msg.text}</p>
                  </div>
                  <button onClick={() => handleDeleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 shrink-0 transition">Удалить</button>
                </div>
              ))}
            </div>
            {msgPages > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <button disabled={msgPage <= 1} onClick={() => { if (viewRoomId) loadMessages(viewRoomId, msgPage - 1); }}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-30 dark:border-gray-700 dark:text-gray-300">← Назад</button>
                <span className="text-xs text-gray-400">{msgPage} / {msgPages}</span>
                <button disabled={msgPage >= msgPages} onClick={() => { if (viewRoomId) loadMessages(viewRoomId, msgPage + 1); }}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-30 dark:border-gray-700 dark:text-gray-300">Далее →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
