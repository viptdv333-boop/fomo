"use client";

import { useState } from "react";

export default function AdminBroadcastPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setMessage(""); setError(""); setSending(true);
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, link: link || null }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) { setMessage(data.message); setTitle(""); setBody(""); setLink(""); }
    else setError(data.error);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Рассылка уведомлений</h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 max-w-lg">
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Заголовок *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Важное обновление!" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Текст</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="Описание..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ссылка (необязательно)</label>
            <input type="text" value={link} onChange={(e) => setLink(e.target.value)} className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100" placeholder="/feed или https://..." />
          </div>
          <button type="submit" disabled={sending} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
            {sending ? "Отправка..." : "Отправить всем"}
          </button>
          {message && <p className="text-green-600 text-sm">{message}</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
