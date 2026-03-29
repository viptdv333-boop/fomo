"use client";

import { useState, useEffect, useCallback } from "react";

interface UserOption {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
}

export default function AdminBroadcastPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [channel, setChannel] = useState<"notification" | "email">("notification");
  const [audience, setAudience] = useState<"all" | "role" | "manual">("all");
  const [selectedRole, setSelectedRole] = useState<"USER" | "ADMIN" | "OWNER">("USER");
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<{ total: number; byRole: Record<string, number> } | null>(null);

  // Load user stats
  useEffect(() => {
    fetch("/api/admin/broadcast/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  // Search users
  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/broadcast/users?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.filter((u: UserOption) => !selectedUsers.some((s) => s.id === u.id)));
      }
    } finally {
      setSearching(false);
    }
  }, [selectedUsers]);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(userSearch), 300);
    return () => clearTimeout(t);
  }, [userSearch, searchUsers]);

  function addUser(user: UserOption) {
    setSelectedUsers((prev) => [...prev, user]);
    setSearchResults((prev) => prev.filter((u) => u.id !== user.id));
    setUserSearch("");
  }

  function removeUser(userId: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  function getRecipientCount(): string {
    if (audience === "all") return stats ? `${stats.total}` : "...";
    if (audience === "role") return stats?.byRole?.[selectedRole]?.toString() || "0";
    return `${selectedUsers.length}`;
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (audience === "manual" && selectedUsers.length === 0) {
      setError("Выберите хотя бы одного получателя");
      return;
    }
    setMessage(""); setError(""); setSending(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: body || null,
          link: link || null,
          channel,
          audience,
          role: audience === "role" ? selectedRole : undefined,
          userIds: audience === "manual" ? selectedUsers.map((u) => u.id) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setTitle(""); setBody(""); setLink("");
        setSelectedUsers([]);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  }

  const inputCls = "w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Рассылка</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <form onSubmit={handleSend} className="space-y-5">
            {/* Channel */}
            <div>
              <label className={labelCls}>Канал отправки</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={channel === "notification"} onChange={() => setChannel("notification")}
                    className="accent-green-600" />
                  <span className="text-sm">🔔 В личку (уведомление)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={channel === "email"} onChange={() => setChannel("email")}
                    className="accent-green-600" />
                  <span className="text-sm">📧 На email</span>
                </label>
              </div>
            </div>

            {/* Audience */}
            <div>
              <label className={labelCls}>Получатели</label>
              <div className="flex gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={audience === "all"} onChange={() => setAudience("all")}
                    className="accent-green-600" />
                  <span className="text-sm">Все ({stats?.total || "..."})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={audience === "role"} onChange={() => setAudience("role")}
                    className="accent-green-600" />
                  <span className="text-sm">По роли</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={audience === "manual"} onChange={() => setAudience("manual")}
                    className="accent-green-600" />
                  <span className="text-sm">Вручную</span>
                </label>
              </div>

              {/* Role selector */}
              {audience === "role" && (
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as any)}
                  className={`${inputCls} mt-2 max-w-xs`}>
                  <option value="USER">USER ({stats?.byRole?.USER || 0})</option>
                  <option value="ADMIN">ADMIN ({stats?.byRole?.ADMIN || 0})</option>
                  <option value="OWNER">OWNER ({stats?.byRole?.OWNER || 0})</option>
                </select>
              )}

              {/* Manual user search */}
              {audience === "manual" && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Поиск по имени или email..."
                      className={inputCls} />
                    {searching && (
                      <div className="absolute right-3 top-2.5 text-xs text-gray-400">...</div>
                    )}
                    {searchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {searchResults.map((u) => (
                          <button key={u.id} type="button" onClick={() => addUser(u)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex justify-between items-center">
                            <span>{u.displayName}</span>
                            <span className="text-xs text-gray-400">{u.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected users chips */}
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map((u) => (
                        <span key={u.id} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full text-xs">
                          {u.displayName}
                          <button type="button" onClick={() => removeUser(u.id)} className="hover:text-red-500 font-bold">&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            <div>
              <label className={labelCls}>Заголовок *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
                className={inputCls} placeholder="Важное обновление!" />
            </div>
            <div>
              <label className={labelCls}>Текст</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
                className={inputCls} placeholder="Текст рассылки..." />
            </div>
            <div>
              <label className={labelCls}>Ссылка (необязательно)</label>
              <input type="text" value={link} onChange={(e) => setLink(e.target.value)}
                className={inputCls} placeholder="/feed или https://..." />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-4">
              <button type="submit" disabled={sending}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                {sending ? "Отправка..." : `Отправить (${getRecipientCount()} чел.)`}
              </button>
            </div>

            {message && <p className="text-green-600 text-sm font-medium">{message}</p>}
            {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
          </form>
        </div>

        {/* Stats sidebar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 h-fit">
          <h3 className="font-semibold mb-4 text-sm text-gray-500 dark:text-gray-400 uppercase">Статистика</h3>
          {stats ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Всего пользователей</span>
                <span className="font-bold">{stats.total}</span>
              </div>
              {Object.entries(stats.byRole).map(([role, count]) => (
                <div key={role} className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{role}</span>
                  <span className="font-medium">{count as number}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Загрузка...</p>
          )}
        </div>
      </div>
    </div>
  );
}
