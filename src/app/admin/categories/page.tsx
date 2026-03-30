"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isHidden: boolean;
  _count: { instruments: number; assets: number };
}

interface SortableRowProps {
  cat: Category;
  onToggleHidden: (id: string, isHidden: boolean) => void;
  onDelete: (id: string) => void;
}

function SortableRow({ cat, onToggleHidden, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${cat.isHidden ? "opacity-50" : ""} ${isDragging ? "bg-gray-100 dark:bg-gray-700 shadow-lg rounded-lg" : ""}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 touch-none select-none text-lg leading-none px-1"
        title="Перетащите для сортировки"
      >
        ⠿
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{cat.name}</span>
          <span className="text-xs text-gray-400">/{cat.slug}</span>
          {cat.isHidden && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded">Скрыта</span>}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {cat._count.instruments || cat._count.assets || 0} инструментов &bull; порядок: {cat.sortOrder}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onToggleHidden(cat.id, cat.isHidden)}
          className={`text-xs ${cat.isHidden ? "text-green-600 hover:text-green-800" : "text-gray-500 hover:text-amber-600"}`}>
          {cat.isHidden ? "Показать" : "Скрыть"}
        </button>
        <button onClick={() => onDelete(cat.id)}
          className="text-xs text-red-500 hover:text-red-700">Удалить</button>
      </div>
    </div>
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.sort((a: Category, b: Category) => a.sortOrder - b.sortOrder));
    setLoading(false);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  function generateSlug(text: string) {
    const map: Record<string, string> = {
      "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
      "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
      "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
      "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
      "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    };
    return text.toLowerCase().split("").map((c) => map[c] || c).join("")
      .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, sortOrder: Number(sortOrder) }),
    });
    setName(""); setSlug(""); setSortOrder("0");
    loadCategories();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить категорию? Инструменты останутся без категории.")) return;
    await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
    loadCategories();
  }

  async function handleToggleHidden(id: string, isHidden: boolean) {
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isHidden: !isHidden }),
    });
    loadCategories();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);

    // Optimistic update
    setCategories(reordered);

    // Persist new sortOrder for all affected categories
    const updates = reordered.map((cat, idx) => ({
      id: cat.id,
      sortOrder: idx,
    }));

    await Promise.all(
      updates.map((u) =>
        fetch("/api/categories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: u.id, sortOrder: u.sortOrder }),
        })
      )
    );

    loadCategories();
  }

  const filtered = search.trim()
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase())
      )
    : categories;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Категории инструментов</h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">Добавить категорию</h2>
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); setSlug(generateSlug(e.target.value)); }}
              required className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100" placeholder="Криптовалюты" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
              required className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100" placeholder="crypto" />
          </div>
          <div className="w-24">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Порядок</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition">Добавить</button>
        </div>
      </form>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : (
        <>
          {categories.length > 0 && (
            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск категорий..."
                className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100 bg-white"
              />
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
            {categories.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Нет категорий</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Ничего не найдено</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filtered.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div>
                    {filtered.map((cat) => (
                      <SortableRow
                        key={cat.id}
                        cat={cat}
                        onToggleHidden={handleToggleHidden}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </>
      )}
    </div>
  );
}
