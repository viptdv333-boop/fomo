"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  displayName: string;
  fomoId: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  rating: number;
  bannedUntil: string | null;
  banReason: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [banModal, setBanModal] = useState<{ userId: string; name: string } | null>(null);
  const [banDays, setBanDays] = useState("7");
  const [banReason, setBanReason] = useState("");
  const [ratingModal, setRatingModal] = useState<{ userId: string; name: string; rating: number } | null>(null);
  const [ratingDelta, setRatingDelta] = useState("0");

  async function loadUsers() {
    setLoading(true);
    const params = filter !== "ALL" ? `?status=${filter}` : "";
    const res = await fetch(`/api/users${params}`);
    const data = await res.json();
    if (Array.isArray(data)) setUsers(data);
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function adminAction(userId: string, body: Record<string, unknown>) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    loadUsers();
  }

  async function deleteUser(userId: string) {
    if (!confirm("Удалить пользователя? Это действие необратимо.")) return;
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    loadUsers();
  }

  async function handleBan() {
    if (!banModal) return;
    const days = parseInt(banDays);
    const until = new Date();
    until.setDate(until.getDate() + days);
    await adminAction(banModal.userId, {
      bannedUntil: until.toISOString(),
      banReason: banReason || null,
      status: "BANNED",
    });
    setBanModal(null);
    setBanDays("7");
    setBanReason("");
  }

  async function handleRating() {
    if (!ratingModal) return;
    const delta = parseFloat(ratingDelta);
    if (isNaN(delta) || delta === 0) return;
    await adminAction(ratingModal.userId, { ratingDelta: delta });
    setRatingModal(null);
    setRatingDelta("0");
  }

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    BANNED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const roleColors: Record<string, string> = {
    ADMIN: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    USER: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
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
                ? "bg-green-600 text-white"
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
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Пользователь</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Роль</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Рейтинг</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Бан до</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Дата рег.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-xs overflow-hidden shrink-0">
                        {user.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          user.displayName[0]
                        )}
                      </div>
                      <div>
                        <div className="font-medium dark:text-gray-100">{user.displayName}</div>
                        <div className="text-xs text-gray-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[user.role]}`}>
                      {user.role === "ADMIN" ? "Админ" : "Юзер"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[user.status]}`}>
                      {user.status === "PENDING" ? "Ожидает" : user.status === "APPROVED" ? "Активен" : "Забанен"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{Number(user.rating).toFixed(1)}</span>
                      <button
                        onClick={() => setRatingModal({ userId: user.id, name: user.displayName, rating: Number(user.rating) })}
                        className="text-gray-400 hover:text-green-500 dark:hover:text-green-400 ml-1"
                        title="Изменить рейтинг"
                      >
                        ✏️
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {user.bannedUntil ? (
                      <div>
                        <div className="text-red-500">{new Date(user.bannedUntil).toLocaleDateString("ru")}</div>
                        {user.banReason && <div className="text-gray-400 truncate max-w-[120px]" title={user.banReason}>{user.banReason}</div>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(user.createdAt).toLocaleDateString("ru")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {/* Approve */}
                      {user.status === "PENDING" && (
                        <button
                          onClick={() => adminAction(user.id, { status: "APPROVED" })}
                          className="px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                        >
                          ✅ Одобрить
                        </button>
                      )}
                      {/* Temp ban */}
                      {user.status !== "BANNED" && (
                        <button
                          onClick={() => setBanModal({ userId: user.id, name: user.displayName })}
                          className="px-2 py-1 rounded text-xs font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
                        >
                          ⏳ Врем. бан
                        </button>
                      )}
                      {/* Permanent ban */}
                      {user.status === "APPROVED" && (
                        <button
                          onClick={() => adminAction(user.id, { status: "BANNED" })}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        >
                          🚫 Забанить
                        </button>
                      )}
                      {/* Unban */}
                      {user.status === "BANNED" && (
                        <button
                          onClick={() => adminAction(user.id, { status: "APPROVED", bannedUntil: null, banReason: null })}
                          className="px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                        >
                          🔓 Разбанить
                        </button>
                      )}
                      {/* Toggle admin */}
                      {user.role === "USER" ? (
                        <button
                          onClick={() => {
                            if (confirm(`Назначить ${user.displayName} администратором?`)) {
                              adminAction(user.id, { role: "ADMIN" });
                            }
                          }}
                          className="px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50"
                        >
                          👑 Назначить админом
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (confirm(`Снять права администратора у ${user.displayName}?`)) {
                              adminAction(user.id, { role: "USER" });
                            }
                          }}
                          className="px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                        >
                          👤 Снять админа
                        </button>
                      )}
                      {/* Delete */}
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        🗑️ Удалить
                      </button>
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

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setBanModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold dark:text-gray-100 mb-4">Временный бан: {banModal.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Срок (дней)</label>
                <div className="flex gap-2">
                  {["1", "3", "7", "14", "30"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setBanDays(d)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        banDays === d
                          ? "bg-red-600 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {d}д
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Причина (необязательно)</label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Причина бана..."
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleBan}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Забанить на {banDays} дн.
              </button>
              <button
                onClick={() => setBanModal(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {ratingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setRatingModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold dark:text-gray-100 mb-2">Рейтинг: {ratingModal.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Текущий: <strong>{ratingModal.rating.toFixed(1)}</strong></p>
            <div className="space-y-3">
              <div className="flex gap-2">
                {["-5", "-1", "-0.5", "+0.5", "+1", "+5"].map((d) => (
                  <button
                    key={d}
                    onClick={() => setRatingDelta(d)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                      ratingDelta === d
                        ? d.startsWith("-") ? "bg-red-600 text-white" : "bg-green-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Или ввести вручную</label>
                <input
                  type="number"
                  step="0.1"
                  value={ratingDelta}
                  onChange={(e) => setRatingDelta(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <p className="text-xs text-gray-400">
                Новый рейтинг: <strong>{Math.max(0, Math.min(99.99, ratingModal.rating + parseFloat(ratingDelta || "0"))).toFixed(1)}</strong>
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleRating}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Применить
              </button>
              <button
                onClick={() => setRatingModal(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
