"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

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
  const { t } = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setError("");
    if (!name.trim()) {
      setError(t("chat2.enterName"));
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
      setError(data.error || t("chat2.createError"));
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
          <h2 className="text-lg font-semibold dark:text-gray-100">{t("chat2.newPrivateGroup")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {t("chat2.privateGroupHint")}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("chat2.nameLabel")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t("chat2.namePlaceholder")}
              autoFocus
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("chat2.descriptionOptional")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder={t("chat2.descriptionPlaceholder")}
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {saving ? t("chat2.creating") : t("chat2.createGroup")}
          </button>
        </div>
      </div>
    </div>
  );
}
