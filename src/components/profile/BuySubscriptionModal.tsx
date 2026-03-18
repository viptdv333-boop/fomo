"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Tariff {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
}

interface BuySubscriptionModalProps {
  authorId: string;
  authorName: string;
  onClose: () => void;
}

export default function BuySubscriptionModal({
  authorId,
  authorName,
  onClose,
}: BuySubscriptionModalProps) {
  const router = useRouter();
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [selectedTariff, setSelectedTariff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  useEffect(() => {
    fetch(`/api/users/${authorId}/tariffs`)
      .then((r) => r.json())
      .then((data) => {
        setTariffs(data);
        if (data.length > 0) setSelectedTariff(data[0].id);
      })
      .finally(() => setLoading(false));
  }, [authorId]);

  async function handleSubmit() {
    if (!selectedTariff) return;
    setSubmitting(true);
    setError("");

    const tariff = tariffs.find((t) => t.id === selectedTariff);
    if (!tariff) return;

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerId: authorId,
        subscriptionType: "tariff",
        tariffId: selectedTariff,
        amount: tariff.price,
        receiptUrl: receiptUrl || undefined,
      }),
    });

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Ошибка оплаты");
    }
    setSubmitting(false);
  }

  const selected = tariffs.find((t) => t.id === selectedTariff);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold dark:text-gray-100">
              Подписка на {authorName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
            >
              ✕
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Загрузка каналов...
            </div>
          ) : tariffs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              У автора нет активных каналов
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-4">
                {tariffs.map((t) => (
                  <label
                    key={t.id}
                    className={`block border rounded-lg p-4 cursor-pointer transition ${
                      selectedTariff === t.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tariff"
                      value={t.id}
                      checked={selectedTariff === t.id}
                      onChange={() => setSelectedTariff(t.id)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-medium dark:text-gray-100">{t.name}</span>
                      <span className="text-sm font-semibold text-green-600">
                        {Number(t.price)} ₽
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {t.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Срок: {t.durationDays} дн.
                    </p>
                  </label>
                ))}
              </div>

              {selected && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Для оплаты переведите <strong className="text-gray-800 dark:text-gray-200">{Number(selected.price)} ₽</strong> автору
                    и приложите чек (необязательно):
                  </p>
                  <input
                    type="url"
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    placeholder="Ссылка на чек (необязательно)"
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              )}

              {error && (
                <p className="text-red-500 dark:text-red-400 text-sm mb-3">{error}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !selectedTariff}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? "Отправка..." : "Отправить заявку на подписку"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
