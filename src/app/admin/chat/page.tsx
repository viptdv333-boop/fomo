"use client";

import { useEffect, useState, useCallback } from "react";
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

/* ── Sortable Room Row ── */
function SortableRoom({ room, onEdit, onToggle, onDelete, onViewMessages }: {
  room: ChatRoom;
  onEdit: () => void;
  onToggle: (field: "isArchived" | "isClosed") => void;
  onDelete: () => void;
  onViewMessages: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: room.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, position: "relative" as const };

  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-2 px-4 py-3 border-b border-gray-50 dark:border-gray-800/30 last:border-b-0 ${isDragging ? "bg-green-50 dark:bg-green-900/20 shadow-lg rounded-lg" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}>
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 select-none text-lg">⠿</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{room.name}</span>
          {room.isGeneral && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">Общий</span>}
          {room.isArchived && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">Архив</span>}
          {room.isClosed && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-500 rounded">Закрыт</span>}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{room._count.messages} сообщ.</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onViewMessages} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">Сообщения</button>
        <button onClick={onEdit} className="text-xs text-gray-500 hover:text-green-600">Ред.</button>
        <button onClick={() => onToggle("isArchived")} className="text-xs text-gray-500 hover:text-amber-600">{room.isArchived ? "Вернуть" : "Архив"}</button>
        <button onClick={() => onToggle("isClosed")} className="text-xs text-gray-500 hover:text-orange-600">{room.isClosed ? "Открыть" : "Закрыть"}</button>
        {!room.isGeneral && <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">Удалить</button>}
      </div>
    </div>
  );
}

/* ── Sortable Category Group ── */
function SortableCategoryHeader({ id, label, count }: { id: string; label: string; count: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, position: "relative" as const };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 mb-2 ${isDragging ? "opacity-70" : ""}`}>
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 select-none">⠿</span>
      <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label} ({count})</h3>
    </div>
  );
}

export default function AdminChatPage() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived" | "closed">("all");

  // Create/edit form
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formNewCategory, setFormNewCategory] = useState("");
  const [formSort, setFormSort] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Messages viewer
  const [viewRoomId, setViewRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgPage, setMsgPage] = useState(1);
  const [msgPages, setMsgPages] = useState(1);

  // Category ordering
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);

  const categories = Array.from(new Set(rooms.map((r) => r.categoryLabel).filter(Boolean))) as string[];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/admin/chat");
    if (res.ok) setRooms(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // Build category order
  useEffect(() => {
    const map: Record<string, number> = {};
    rooms.forEach((r) => {
      const cat = r.categoryLabel || "Общие";
      if (!(cat in map) || r.sortOrder < map[cat]) map[cat] = r.sortOrder;
    });
    const sorted = Object.entries(map).sort((a, b) => a[1] - b[1]).map(([k]) => k);
    setCategoryOrder(sorted);
  }, [rooms]);

  async function loadMessages(roomId: string, page = 1) {
    const res = await fetch(`/api/admin/chat/messages?roomId=${roomId}&page=${page}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages); setMsgTotal(data.total); setMsgPage(data.page); setMsgPages(data.pages);
    }
  }

  async function handleCreate() {
    if (!formName.trim()) return;
    const cat = formNewCategory.trim() || (formCategory === "__new__" ? "" : formCategory) || null;
    await fetch("/api/admin/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, categoryLabel: cat, sortOrder: formSort }),
    });
    setFormName(""); setFormCategory(""); setFormNewCategory(""); setFormSort(0);
    loadRooms();
  }

  async function handleUpdate() {
    if (!editingId || !formName.trim()) return;
    const cat = formNewCategory.trim() || (formCategory === "__new__" ? "" : formCategory) || null;
    await fetch("/api/admin/chat", {
      method: "PUT", headers: { "Content-Type": "application/json" },
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
      method: "PUT", headers: { "Content-Type": "application/json" },
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
    setEditingId(room.id); setFormName(room.name); setFormCategory(room.categoryLabel || ""); setFormNewCategory(""); setFormSort(room.sortOrder);
  }
  function cancelEdit() {
    setEditingId(null); setFormName(""); setFormCategory(""); setFormNewCategory(""); setFormSort(0);
  }

  // DnD: reorder rooms within a category
  async function handleRoomDragEnd(event: DragEndEvent, catRooms: ChatRoom[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = catRooms.findIndex((r) => r.id === active.id);
    const newIdx = catRooms.findIndex((r) => r.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(catRooms, oldIdx, newIdx);
    // Update all sortOrders
    const updates = reordered.map((r, i) =>
      fetch("/api/admin/chat", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, sortOrder: i }),
      })
    );
    await Promise.all(updates);
    loadRooms();
  }

  // DnD: reorder categories
  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = categoryOrder.indexOf(active.id as string);
    const newIdx = categoryOrder.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(categoryOrder, oldIdx, newIdx);
    setCategoryOrder(reordered);

    // Reassign sortOrders: each category gets a block of 100
    const updates: Promise<Response>[] = [];
    reordered.forEach((catLabel, catIndex) => {
      const catRooms = rooms.filter((r) => (r.categoryLabel || "Общие") === catLabel)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      catRooms.forEach((r, roomIdx) => {
        const newSort = catIndex * 100 + roomIdx;
        if (r.sortOrder !== newSort) {
          updates.push(fetch("/api/admin/chat", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id, sortOrder: newSort }),
          }));
        }
      });
    });
    await Promise.all(updates);
    loadRooms();
  }

  // Filter & search
  const filteredRooms = rooms.filter((r) => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === "active" && (r.isArchived || r.isClosed)) return false;
    if (filterStatus === "archived" && !r.isArchived) return false;
    if (filterStatus === "closed" && !r.isClosed) return false;
    return true;
  });

  // Group by category
  const grouped = new Map<string, ChatRoom[]>();
  filteredRooms.forEach((r) => {
    const key = r.categoryLabel || (r.isGeneral ? "Общие" : "Без категории");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  });
  grouped.forEach((g) => g.sort((a, b) => a.sortOrder - b.sortOrder));

  // Sort groups by categoryOrder
  const sortedGroupEntries = [...grouped.entries()].sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a[0]);
    const bIdx = categoryOrder.indexOf(b[0]);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  const inputCls = "px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Управление болталкой</h1>

      {/* Search & filter */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 mb-4 flex items-center gap-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск комнат..."
          className={`w-64 ${inputCls}`} />
        <div className="flex gap-1">
          {(["all", "active", "archived", "closed"] as const).map((f) => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${filterStatus === f
                ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
              {f === "all" ? "Все" : f === "active" ? "Активные" : f === "archived" ? "Архив" : "Закрытые"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filteredRooms.length} из {rooms.length}</span>
      </div>

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
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">+ Новая категория</option>
            </select>
          </div>
          {formCategory === "__new__" && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Новая категория</label>
              <input value={formNewCategory} onChange={(e) => setFormNewCategory(e.target.value)}
                placeholder="Название..." className={`block mt-1 w-48 ${inputCls}`} />
            </div>
          )}
          {editingId ? (
            <div className="flex gap-2">
              <button onClick={handleUpdate} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">Сохранить</button>
              <button onClick={cancelEdit} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm rounded-lg dark:text-gray-300">Отмена</button>
            </div>
          ) : (
            <button onClick={handleCreate} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">Создать</button>
          )}
        </div>
      </div>

      {/* Rooms by category — drag-n-drop */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Загрузка...</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {sortedGroupEntries.map(([label, groupRooms]) => (
                <div key={label}>
                  <SortableCategoryHeader id={label} label={label} count={groupRooms.length} />
                  <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
                    <DndContext sensors={sensors} collisionDetection={closestCenter}
                      onDragEnd={(e) => handleRoomDragEnd(e, groupRooms)}>
                      <SortableContext items={groupRooms.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                        {groupRooms.map((room) => (
                          <SortableRoom key={room.id} room={room}
                            onEdit={() => startEdit(room)}
                            onToggle={(field) => handleToggle(room.id, field, room[field])}
                            onDelete={() => handleDelete(room.id)}
                            onViewMessages={() => { setViewRoomId(room.id); loadMessages(room.id); }}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
