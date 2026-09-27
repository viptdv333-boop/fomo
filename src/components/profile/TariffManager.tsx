"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  isActive: boolean;
}

interface TariffManagerProps {
  userId: string;
  rating: number;
}

export default function TariffManager({ userId, rating }: TariffManagerProps) {
  const { t } = useT();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadChannels() {
    const res = await fetch(`/api/users/${userId}/tariffs`);
    if (res.ok) setChannels(await res.json());
  }

  useEffect(() => {
    loadChannels();
  }, [userId]);

  async function handleCreate() {
    setError("");
    if (!name.trim()) {
      setError(t("profile2.tariffNameRequired"));
      return;
    }
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) {
      setError(t("profile2.tariffPriceInvalid"));
      return;
    }
    const d = parseInt(durationDays);
    if (isNaN(d) || d < 1) {
      setError(t("profile2.tariffDurationRequired"));
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/users/${userId}/tariffs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        price: p,
        durationDays: d,
      }),
    });

    if (res.ok) {
      setShowForm(false);
      setName("");
      setDescription("");
      setPrice("");
      setDurationDays("30");
      loadChannels();
    } else {
      const data = await res.json();
      setError(data.error || t("profile2.tariffCreateError"));
    }
    setSaving(false);
  }

  if (rating < 5) {
    return (
      <div className="mt-6 pt-6 border-t dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-2 dark:text-gray-100">{t("nav.channels")}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("profile2.tariffRatingRequired", { rating: rating.toFixed(1) })}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-6 border-t dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold dark:text-gray-100">{t("nav.channels")}</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-green-600 hover:text-green-800 transition"
        >
          {showForm ? t("common.cancel") : t("profile2.tariffNew")}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("profile2.tariffName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profile2.phTariffName")}
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("profile2.tariffDescription")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("profile2.phTariffDescription")}
              className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("profile2.tariffPrice")}
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="500"
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("profile2.tariffDuration")}
              </label>
              <input
                type="number"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="30"
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {saving ? t("channels.saving") : t("channels.create")}
          </button>
        </div>
      )}

      {channels.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("profile2.tariffNone")}</p>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-medium dark:text-gray-100">{ch.name}</h4>
                <span className="text-sm font-semibold text-green-600">
                  {t("pay.pricePerDays", { price: Number(ch.price), days: ch.durationDays })}
                </span>
              </div>
              {ch.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {ch.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
