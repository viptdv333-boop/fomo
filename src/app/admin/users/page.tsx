"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  rating: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);
    const params = filter !== "ALL" ? `?status=${filter}` : "";
    const res = await fetch(`/api/users${params}`);
    const data = await res.json();
    setUsers(data);
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, [filter]);

  async function updateStatus(userId: string, status: string) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadUsers();
  }

  async function deleteUser(userId: string) {
    if (!confirm("Удалить пользователя? Это действие необратимо.")) return;
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    loadUsers();
  }

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    BANNED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Пользователи</h1>

      <div className="flex gap-2 mb-4">
        {["ALL", "PENDING", "APPROVED", "BANNED"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === s
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            {s === "ALL" ? "Все" : s === "PENDING" ? "Ожидают" : s === "APPROVED" ? "Одобрены" : "Заблокированы"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm dark:text-gray-300">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Имя</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Рейтинг</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 font-medium dark:text-gray-100">{user.displayName}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[user.status]}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 dark:text-gray-300">{Number(user.rating).toFixed(1)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString("ru")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {user.status === "PENDING" && (
                        <button
                          onClick={() => updateStatus(user.id, "APPROVED")}
                          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-xs font-medium"
                        >
                          Одобрить
                        </button>
                      )}
                      {user.status === "APPROVED" && (
                        <button
                          onClick={() => updateStatus(user.id, "BANNED")}
                          className="text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 text-xs font-medium"
                        >
                          Забанить
                        </button>
                      )}
                      {user.status === "BANNED" && (
                        <button
                          onClick={() => updateStatus(user.id, "APPROVED")}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
                        >
                          Разбанить
                        </button>
                      )}
                      {user.role !== "ADMIN" && (
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Нет пользователей</div>
          )}
        </div>
      )}
    </div>
  );
}
