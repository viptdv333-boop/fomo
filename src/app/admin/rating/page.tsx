"use client";

import { useEffect, useState } from "react";

interface PaidTier {
  min: number;
  max: number;
  maxPaid: number;
}

interface RatingConfigData {
  subscriberWeight: number;
  likeWeight: number;
  dislikeWeight: number;
  inactivityPenalty: number;
  inactivityThresholdDays: number;
  paidTiers: PaidTier[];
}

export default function AdminRatingPage() {
  const [config, setConfig] = useState<RatingConfigData | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/rating")
      .then((r) => r.json())
      .then((data) => {
        setConfig({
          ...data,
          subscriberWeight: Number(data.subscriberWeight),
          likeWeight: Number(data.likeWeight),
          dislikeWeight: Number(data.dislikeWeight),
          inactivityPenalty: Number(data.inactivityPenalty),
          paidTiers:
            typeof data.paidTiers === "string"
              ? JSON.parse(data.paidTiers)
              : data.paidTiers,
        });
      });
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/rating", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    if (res.ok) {
      setMessage("Сохранено");
    } else {
      setMessage("Ошибка сохранения");
    }
  }

  function updateTier(index: number, field: keyof PaidTier, value: number) {
    if (!config) return;
    const tiers = [...config.paidTiers];
    tiers[index] = { ...tiers[index], [field]: value };
    setConfig({ ...config, paidTiers: tiers });
  }

  function addTier() {
    if (!config) return;
    setConfig({
      ...config,
      paidTiers: [...config.paidTiers, { min: 0, max: 10, maxPaid: 0 }],
    });
  }

  function removeTier(index: number) {
    if (!config) return;
    setConfig({
      ...config,
      paidTiers: config.paidTiers.filter((_, i) => i !== index),
    });
  }

  if (!config) return <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Настройки рейтинга</h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">Веса формулы</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Вес подписчиков
            </label>
            <input
              type="number"
              step="0.01"
              value={config.subscriberWeight}
              onChange={(e) =>
                setConfig({ ...config, subscriberWeight: Number(e.target.value) })
              }
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Вес лайков
            </label>
            <input
              type="number"
              step="0.01"
              value={config.likeWeight}
              onChange={(e) =>
                setConfig({ ...config, likeWeight: Number(e.target.value) })
              }
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Вес дизлайков
            </label>
            <input
              type="number"
              step="0.01"
              value={config.dislikeWeight}
              onChange={(e) =>
                setConfig({ ...config, dislikeWeight: Number(e.target.value) })
              }
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Штраф за простой (в день)
            </label>
            <input
              type="number"
              step="0.01"
              value={config.inactivityPenalty}
              onChange={(e) =>
                setConfig({ ...config, inactivityPenalty: Number(e.target.value) })
              }
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Порог простоя (дней)
            </label>
            <input
              type="number"
              value={config.inactivityThresholdDays}
              onChange={(e) =>
                setConfig({
                  ...config,
                  inactivityThresholdDays: Number(e.target.value),
                })
              }
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-100">Пороги платных идей</h2>
          <button
            onClick={addTier}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            + Добавить порог
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          maxPaid = -1 означает без ограничений
        </p>
        <div className="space-y-3">
          {config.paidTiers.map((tier, i) => (
            <div key={i} className="flex gap-3 items-center">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">От</label>
                <input
                  type="number"
                  step="0.1"
                  value={tier.min}
                  onChange={(e) => updateTier(i, "min", Number(e.target.value))}
                  className="w-20 px-2 py-1 border dark:border-gray-700 rounded dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">До</label>
                <input
                  type="number"
                  step="0.1"
                  value={tier.max}
                  onChange={(e) => updateTier(i, "max", Number(e.target.value))}
                  className="w-20 px-2 py-1 border dark:border-gray-700 rounded dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Макс. платных/нед</label>
                <input
                  type="number"
                  value={tier.maxPaid}
                  onChange={(e) =>
                    updateTier(i, "maxPaid", Number(e.target.value))
                  }
                  className="w-24 px-2 py-1 border dark:border-gray-700 rounded dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <button
                onClick={() => removeTier(i)}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm mt-4"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        {message && (
          <span
            className={
              message === "Сохранено" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
