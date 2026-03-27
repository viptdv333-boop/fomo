"use client";

import { useEffect, useState } from "react";

interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; displayName: string; avatarUrl: string | null };
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "resolved">("pending");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/reports?status=${tab}`);
    if (res.ok) setReports(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [tab]);

  async function resolve(reportId: string, resolution: string) {
    await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, resolution }),
    });
    load();
  }

  const typeLabel: Record<string, string> = { idea: "Идея", author: "Автор", channel: "Канал" };
  const reasonLabel: Record<string, string> = { spam: "Спам", fraud: "Мошенничество", inappropriate: "Неприемлемый контент", misleading: "Ввод в заблуждение" };
  const resLabel: Record<string, string> = { deleted: "Удалено", banned: "Забанен", dismissed: "Отклонено" };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Жалобы</h1>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("pending")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "pending" ? "bg-red-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>
          Ожидают ({tab === "pending" ? reports.length : "..."})
        </button>
        <button onClick={() => setTab("resolved")} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === "resolved" ? "bg-gray-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>
          Решённые
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-400 py-8 text-center">{tab === "pending" ? "Нет активных жалоб" : "Нет решённых жалоб"}</p>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 mr-2">
                    {typeLabel[r.targetType] || r.targetType}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {reasonLabel[r.reason] || r.reason}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    От: {r.reporter.displayName} | {new Date(r.createdAt).toLocaleString("ru")}
                  </p>
                  {r.details && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{r.details}</p>}
                  <p className="text-xs text-gray-400 mt-1 font-mono">ID: {r.targetId}</p>
                </div>

                {r.status === "pending" ? (
                  <div className="flex gap-2 shrink-0">
                    {r.targetType === "idea" && (
                      <button onClick={() => resolve(r.id, "deleted")} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">
                        Удалить идею
                      </button>
                    )}
                    {r.targetType === "author" && (
                      <button onClick={() => resolve(r.id, "banned")} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">
                        Забанить
                      </button>
                    )}
                    <button onClick={() => resolve(r.id, "dismissed")} className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
                      Отклонить
                    </button>
                  </div>
                ) : (
                  <span className={`text-xs px-2 py-1 rounded ${r.resolution === "dismissed" ? "bg-gray-100 dark:bg-gray-700 text-gray-500" : "bg-red-100 dark:bg-red-900/30 text-red-600"}`}>
                    {resLabel[r.resolution || ""] || r.resolution}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
