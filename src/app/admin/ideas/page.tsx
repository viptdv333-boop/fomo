"use client";

import { useEffect, useState } from "react";

interface Idea {
  id: string;
  title: string;
  preview: string;
  isPaid: boolean;
  moderationStatus: string;
  createdAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  instruments: { name: string }[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  published: { label: "Опубликована", color: "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400" },
  hidden: { label: "Скрыта", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" },
  archived: { label: "В архиве", color: "text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400" },
};

export default function AdminIdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "published" | "hidden" | "archived">("all");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadIdeas() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50", admin: "1" });
    // /api/ideas uses `status` for the moderation filter. Sending
    // `moderationStatus` silently fell through to its normal published feed,
    // so the Archive tab showed published ideas with an Archive action.
    if (filter !== "all") params.set("status", filter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/ideas?${params}`);
    const data = await res.json();
    setIdeas(data.data || data.ideas || (Array.isArray(data) ? data : []));
    setTotal(data.total || 0);
    setLoading(false);
  }

  useEffect(() => { loadIdeas(); }, [page, filter]);

  async function moderateIdea(id: string, status: string) {
    await fetch(`/api/admin/ideas/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaId: id, status }),
    });
    loadIdeas();
  }

  async function deleteIdea(id: string) {
    if (!confirm("Удалить идею безвозвратно?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ideas/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || `Не удалось удалить идею (ошибка ${res.status}).`);
        return;
      }
      await loadIdeas();
    } catch {
      alert("Не удалось связаться с сервером. Идея не удалена.");
    } finally {
      setDeletingId(null);
    }
  }

  const inputCls = "px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100";

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 dark:text-gray-100">Модерация идей</h1>

      {/* Filters */}
      <div className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow p-3 sm:p-4 mb-4 sm:mb-6 flex items-center gap-2 sm:gap-4 flex-wrap">
        <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
          {(["all", "published", "hidden", "archived"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${filter === f
                ? "bg-green-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>
              {f === "all" ? "Все" : STATUS_LABELS[f]?.label || f}
            </button>
          ))}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); loadIdeas(); } }}
          placeholder="Поиск по заголовку..." className={`${inputCls} min-w-0 w-full sm:w-64`} />
        <button onClick={() => { setPage(1); loadIdeas(); }}
          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">Найти</button>
        <span className="text-xs text-gray-400 ml-auto">Всего: {total}</span>
      </div>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400 text-center py-8">Загрузка...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Нет идей</div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => {
            const st = STATUS_LABELS[idea.moderationStatus] || STATUS_LABELS.published;
            return (
              <div key={idea.id} className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="min-w-0 font-medium text-sm text-gray-900 dark:text-gray-100 break-words">{idea.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${st.color}`}>{st.label}</span>
                    {idea.isPaid && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded">Платная</span>}
                  </div>
                  <div className="text-xs text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{idea.author.displayName}</span>
                    <span>{new Date(idea.createdAt).toLocaleDateString("ru")}</span>
                    {idea.instruments.length > 0 && (
                      <span className="flex gap-1">
                        {idea.instruments.map((i) => (
                          <span key={i.name} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">{i.name}</span>
                        ))}
                      </span>
                    )}
                  </div>
                  {idea.preview && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{idea.preview}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0">
                  {idea.moderationStatus !== "published" && (
                    <button onClick={() => moderateIdea(idea.id, "published")}
                      className="text-xs text-green-600 hover:text-green-800 dark:text-green-400">Опубликовать</button>
                  )}
                  {idea.moderationStatus !== "hidden" && (
                    <button onClick={() => moderateIdea(idea.id, "hidden")}
                      className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400">Скрыть</button>
                  )}
                  {idea.moderationStatus !== "archived" && (
                    <button onClick={() => moderateIdea(idea.id, "archived")}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">В архив</button>
                  )}
                  <button onClick={() => deleteIdea(idea.id)} disabled={deletingId === idea.id}
                    className="text-xs text-red-500 hover:text-red-700">Удалить</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-center gap-2 mt-4">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
          className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300">← Назад</button>
        <span className="px-4 py-2 text-gray-500 dark:text-gray-400">Стр. {page}</span>
        <button onClick={() => setPage(page + 1)} disabled={ideas.length < 50}
          className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300">Далее →</button>
      </div>
    </div>
  );
}
