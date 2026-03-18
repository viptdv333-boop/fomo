"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Tariff {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  paymentMethods: string[];
  cardNumber?: string | null;
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
  const [paymentMethod, setPaymentMethod] = useState<"card" | "yukassa">("card");

  useEffect(() => {
    fetch(`/api/users/${authorId}/tariffs`)
      .then((r) => r.json())
      .then((data) => {
        setTariffs(data);
        if (data.length > 0) {
          setSelectedTariff(data[0].id);
          // Auto-select first available payment method
          const methods = data[0].paymentMethods || ["card"];
          setPaymentMethod(methods.includes("yukassa") ? "yukassa" : "card");
        }
      })
      .finally(() => setLoading(false));
  }, [authorId]);

  // Update payment method when tariff changes
  function handleTariffChange(tariffId: string) {
    setSelectedTariff(tariffId);
    const tariff = tariffs.find((t) => t.id === tariffId);
    if (tariff) {
      const methods = tariff.paymentMethods || ["card"];
      if (!methods.includes(paymentMethod)) {
        setPaymentMethod(methods[0] as "card" | "yukassa");
      }
    }
  }

  async function handleCardPayment() {
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

  async function handleYukassaPayment() {
    if (!selectedTariff) return;
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/yukassa/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariffId: selectedTariff,
        sellerId: authorId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Redirect to YuKassa payment page
      window.location.href = data.paymentUrl;
    } else {
      const data = await res.json();
      setError(data.error || "Ошибка создания платежа");
      setSubmitting(false);
    }
  }

  function handleSubmit() {
    if (paymentMethod === "yukassa") {
      handleYukassaPayment();
    } else {
      handleCardPayment();
    }
  }

  const selected = tariffs.find((t) => t.id === selectedTariff);
  const selectedMethods = selected?.paymentMethods || ["card"];
  const hasCard = selectedMethods.includes("card");
  const hasYukassa = selectedMethods.includes("yukassa");

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
              {/* Tariff selection */}
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
                      onChange={() => handleTariffChange(t.id)}
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

              {/* Payment method selection */}
              {selected && hasCard && hasYukassa && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Способ оплаты
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPaymentMethod("yukassa")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition ${
                        paymentMethod === "yukassa"
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      🏦 ЮKassa
                    </button>
                    <button
                      onClick={() => setPaymentMethod("card")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition ${
                        paymentMethod === "card"
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      💳 Перевод на карту
                    </button>
                  </div>
                </div>
              )}

              {/* Card payment section */}
              {selected && paymentMethod === "card" && hasCard && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
                  {selected.cardNumber && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Переведите <strong className="text-gray-800 dark:text-gray-200">{Number(selected.price)} ₽</strong> на карту{" "}
                      <strong className="text-gray-800 dark:text-gray-200 font-mono">{selected.cardNumber}</strong>
                    </p>
                  )}
                  {!selected.cardNumber && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Переведите <strong className="text-gray-800 dark:text-gray-200">{Number(selected.price)} ₽</strong> автору
                      и приложите чек:
                    </p>
                  )}
                  <input
                    type="url"
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    placeholder="Ссылка на чек (необязательно)"
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              )}

              {/* YuKassa payment section */}
              {selected && paymentMethod === "yukassa" && hasYukassa && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Оплата <strong className="text-gray-800 dark:text-gray-200">{Number(selected.price)} ₽</strong> пройдёт автоматически через ЮKassa.
                    Вы будете перенаправлены на страницу оплаты.
                  </p>
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
                {submitting
                  ? "Обработка..."
                  : paymentMethod === "yukassa"
                  ? "Оплатить через ЮKassa"
                  : "Отправить заявку на подписку"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
