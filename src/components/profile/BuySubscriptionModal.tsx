"use client";

import { useEffect, useState, useRef } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [selectedTariff, setSelectedTariff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "yukassa">("card");
  const [cardCopied, setCardCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  // Receipt image
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${authorId}/tariffs`)
      .then((r) => r.json())
      .then((data) => {
        setTariffs(data);
        if (data.length > 0) {
          setSelectedTariff(data[0].id);
          const methods = data[0].paymentMethods || ["card"];
          setPaymentMethod(methods.includes("yukassa") ? "yukassa" : "card");
        }
      })
      .finally(() => setLoading(false));
  }, [authorId]);

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

  async function copyCard(cardNumber: string) {
    await navigator.clipboard.writeText(cardNumber.replace(/\s/g, ""));
    setCardCopied(true);
    setTimeout(() => setCardCopied(false), 2000);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Можно прикрепить только изображение");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Максимальный размер файла — 10 МБ");
      return;
    }
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
    setError("");
  }

  function removeReceipt() {
    setReceiptFile(null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadReceipt(): Promise<string | null> {
    if (!receiptFile) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", receiptFile);
      formData.append("type", "receipts");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      return data.url;
    } catch {
      setError("Не удалось загрузить скриншот");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleCardPayment() {
    if (!selectedTariff) return;
    if (!receiptFile) {
      setError("Прикрепите скриншот чека об оплате");
      return;
    }

    setSubmitting(true);
    setError("");

    // 1. Upload receipt image
    const receiptUrl = await uploadReceipt();
    if (!receiptUrl) {
      setSubmitting(false);
      return;
    }

    const tariff = tariffs.find((t) => t.id === selectedTariff);
    if (!tariff) return;

    // 2. Create payment request
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerId: authorId,
        subscriptionType: "tariff",
        tariffId: selectedTariff,
        amount: tariff.price,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Ошибка оплаты");
      setSubmitting(false);
      return;
    }

    const paymentData = await res.json();
    const paymentId = paymentData.paymentRequest?.id || paymentData.id;

    // 3. Attach receipt to payment
    if (paymentId) {
      await fetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptUrl }),
      });
    }

    // 4. Send DM to author with receipt
    await sendReceiptToAuthor(receiptUrl, tariff);

    setSuccess(true);
    setSubmitting(false);
  }

  async function sendReceiptToAuthor(receiptUrl: string, tariff: Tariff) {
    try {
      // Create or get conversation
      const convRes = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: authorId }),
      });
      if (!convRes.ok) return;
      const conv = await convRes.json();

      // Send message with receipt
      await fetch(`/api/messages/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `💳 Оплата подписки «${tariff.name}» — ${Number(tariff.price)} ₽\n\nЧек об оплате прикреплён ниже. Пожалуйста, подтвердите получение.`,
          fileUrl: receiptUrl,
          fileName: "чек_оплаты.png",
          fileType: "image",
        }),
      });
    } catch {
      // Non-critical — payment request already created
    }
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

          {/* Success state */}
          {success ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Заявка отправлена!
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Автор получил ваш чек в сообщениях и подтвердит подписку после проверки оплаты.
              </p>
              <button
                onClick={() => { onClose(); router.refresh(); }}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Понятно
              </button>
            </div>
          ) : loading ? (
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
                      🏦 ЮKassa (авто)
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
                <div className="space-y-3 mb-4">
                  {/* Instructions */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">Как оплатить:</p>
                    <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5 list-decimal list-inside">
                      <li>Скопируйте номер карты ниже</li>
                      <li>Переведите {Number(selected.price)} ₽ через банковское приложение</li>
                      <li>Сделайте скриншот чека об оплате</li>
                      <li>Прикрепите скриншот и нажмите «Я оплатил»</li>
                    </ol>
                  </div>

                  {/* Card number */}
                  {selected.cardNumber ? (
                    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-4 py-3">
                      <span className="font-mono text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-wider flex-1">
                        {selected.cardNumber}
                      </span>
                      <button
                        onClick={() => copyCard(selected.cardNumber!)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          cardCopied
                            ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        }`}
                      >
                        {cardCopied ? "✓ Скопировано" : "Копировать"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      Номер карты не указан. Свяжитесь с автором.
                    </p>
                  )}

                  {/* Receipt upload */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                      Скриншот чека об оплате <span className="text-red-500">*</span>
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    {receiptPreview ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={receiptPreview}
                          alt="Чек"
                          className="w-full max-h-48 object-contain rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                        />
                        <button
                          onClick={removeReceipt}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition"
                        >
                          ✕
                        </button>
                        <p className="text-xs text-green-600 mt-1">✓ Скриншот прикреплён</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-400 dark:hover:border-blue-500 transition"
                      >
                        <div className="text-2xl mb-1">📎</div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Нажмите, чтобы прикрепить скриншот
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          JPG, PNG до 10 МБ
                        </p>
                      </button>
                    )}
                  </div>
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
                disabled={submitting || uploading || !selectedTariff}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting || uploading
                  ? "Отправка..."
                  : paymentMethod === "yukassa"
                  ? "Оплатить через ЮKassa"
                  : "Я оплатил"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
