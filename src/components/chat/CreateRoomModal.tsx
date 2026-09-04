"use client";

import { useState } from "react";

interface CreatedRoom {
  id: string;
  name: string;
  description: string | null;
  inviteToken: string;
  membersCount: number;
  isOwner: true;
}

interface Props {
  onClose: () => void;
  onCreated: (room: CreatedRoom) => void;
}

export default function CreateRoomModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setError("");
    if (!name.trim()) {
      setError("Укажите название");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
    });
    if (res.ok) {
      onCreated(await res.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Ошибка создания");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-100">Новая приватная группа</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Бесплатно, вход только по ссылке-приглашению — как в приватном чате.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Например: Свои трейдеры"
              autoFocus
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Описание (необязательно)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="О чём эта группа..."
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {saving ? "Создание..." : "Создать группу"}
          </button>
        </div>
      </div>
    </div>
  );
}
