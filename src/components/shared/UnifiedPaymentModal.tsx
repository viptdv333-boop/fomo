"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

// ===== Universal payment types =====
export type PaymentPurpose =
  | { type: "donation"; authorId: string; authorName: string; donationCard?: string | null }
  | { type: "idea"; ideaId: string; ideaTitle: string; price: number; authorId: string; authorName: string }
  | { type: "subscription"; tariff: TariffOption; authorId: string; authorName: string }
  | { type: "course"; courseId: string; courseTitle: string; price: number; authorId: string; authorName: string };

export interface TariffOption {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  paymentMethods: string[];
  cardNumber?: string | null;
}

interface UnifiedPaymentModalProps {
  purpose: PaymentPurpose;
  onClose: () => void;
  onSuccess?: () => void;
}

type PaymentMethod = "card" | "yukassa";
type Step = "method" | "pay" | "success";

export default function UnifiedPaymentModal({ purpose, onClose, onSuccess }: UnifiedPaymentModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Steps
  const [step, setStep] = useState<Step>("method");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  // Tariff selection (only for subscription)
  const [tariffs, setTariffs] = useState<TariffOption[]>([]);
  const [selectedTariff, setSelectedTariff] = useState<TariffOption | null>(
    purpose.type === "subscription" ? purpose.tariff : null
  );
  const [tariffsLoaded, setTariffsLoaded] = useState(purpose.type !== "subscription");

  // Card payment
  const [cardCopied, setCardCopied] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  // Donation amount (free-form)
  const [donationAmount, setDonationAmount] = useState("");

  // State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load tariffs for subscription
  useState(() => {
    if (purpose.type === "subscription") {
      fetch(`/api/users/${purpose.authorId}/tariffs`)
        .then((r) => r.json())
        .then((data: TariffOption[]) => {
          setTariffs(data);
          if (data.length > 0) {
            const match = data.find((t) => t.id === purpose.tariff.id) || data[0];
            setSelectedTariff(match);
          }
        })
        .finally(() => setTariffsLoaded(true));
    }
  });

  // ===== Helpers =====
  const title = (() => {
    switch (purpose.type) {
      case "donation": return `Донат для ${purpose.authorName}`;
      case "idea": return `Покупка идеи`;
      case "subscription": return `Подписка на ${purpose.authorName}`;
      case "course": return `Покупка курса`;
    }
  })();

  const amount = (() => {
    switch (purpose.type) {
      case "donation": return donationAmount ? Number(donationAmount) : 0;
      case "idea": return purpose.price;
      case "subscription": return selectedTariff ? Number(selectedTariff.price) : 0;
      case "course": return purpose.price;
    }
  })();

  const cardNumber = (() => {
    switch (purpose.type) {
      case "donation": return purpose.donationCard || null;
      case "idea": return null; // will be set after payment request
      case "subscription": return selectedTariff?.cardNumber || null;
      case "course": return null;
    }
  })();

  // Available methods
  const availableMethods: PaymentMethod[] = (() => {
    if (purpose.type === "subscription" && selectedTariff) {
      const m = selectedTariff.paymentMethods || ["card"];
      return m.filter((x): x is PaymentMethod => x === "card" || x === "yukassa");
    }
    // For now, only card for other types
    return ["card"];
  })();

  // ===== Actions =====
  async function copyCard(card: string) {
    await navigator.clipboard.writeText(card.replace(/\s/g, ""));
    setCardCopied(true);
    setTimeout(() => setCardCopied(false), 2000);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Можно прикрепить только изображение"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Максимальный размер — 10 МБ"); return; }
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
    const formData = new FormData();
    formData.append("file", receiptFile);
    formData.append("type", "receipts");
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) { setError("Не удалось загрузить скриншот"); return null; }
    return (await res.json()).url;
  }

  async function handleSelectMethod(method: PaymentMethod) {
    setPaymentMethod(method);
    setStep("pay");
  }

  async function handleCardPayment() {
    if (!receiptFile) { setError("Прикрепите скриншот чека об оплате"); return; }
    setSubmitting(true);
    setError("");

    const receiptUrl = await uploadReceipt();
    if (!receiptUrl) { setSubmitting(false); return; }

    try {
      let paymentId: string | null = null;

      if (purpose.type === "idea") {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId: purpose.ideaId }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        const data = await res.json();
        paymentId = data.paymentRequest?.id;
      } else if (purpose.type === "subscription" && selectedTariff) {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sellerId: purpose.authorId,
            subscriptionType: "tariff",
            tariffId: selectedTariff.id,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        const data = await res.json();
        paymentId = data.paymentRequest?.id;
      } else if (purpose.type === "donation") {
        // Donation — just send DM with receipt
        await sendReceiptDM(receiptUrl);
        setStep("success");
        setSubmitting(false);
        return;
      }

      // Attach receipt to payment
      if (paymentId) {
        await fetch(`/api/payments/${paymentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiptUrl }),
        });
      }

      // Send DM to author with receipt
      await sendReceiptDM(receiptUrl);

      setStep("success");
    } catch (err: any) {
      setError(err.message || "Ошибка оплаты");
    }
    setSubmitting(false);
  }

  async function handleYukassaPayment() {
    if (purpose.type !== "subscription" || !selectedTariff) return;
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/yukassa/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariffId: selectedTariff.id, sellerId: purpose.authorId }),
    });

    if (res.ok) {
      const data = await res.json();
      window.location.href = data.paymentUrl;
    } else {
      setError((await res.json()).error || "Ошибка создания платежа");
      setSubmitting(false);
    }
  }

  async function sendReceiptDM(receiptUrl: string) {
    try {
      const convRes = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: purpose.authorId }),
      });
      if (!convRes.ok) return;
      const conv = await convRes.json();

      const msgText = (() => {
        switch (purpose.type) {
          case "donation":
            return `💰 Донат${donationAmount ? ` ${donationAmount} ₽` : ""}\n\nЧек об оплате прикреплён. Спасибо!`;
          case "idea":
            return `💳 Оплата идеи «${purpose.ideaTitle}» — ${purpose.price} ₽\n\nЧек об оплате прикреплён. Пожалуйста, подтвердите получение.`;
          case "subscription":
            return `💳 Оплата подписки «${selectedTariff?.name}» — ${amount} ₽\n\nЧек об оплате прикреплён. Пожалуйста, подтвердите получение.`;
          case "course":
            return `💳 Оплата курса «${purpose.courseTitle}» — ${purpose.price} ₽\n\nЧек об оплате прикреплён. Пожалуйста, подтвердите получение.`;
        }
      })();

      await fetch(`/api/messages/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msgText, fileUrl: receiptUrl, fileName: "чек_оплаты.png", fileType: "image" }),
      });
    } catch { /* non-critical */ }
  }

  // ===== RENDER =====
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold dark:text-gray-100">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
          </div>

          {/* ===== SUCCESS ===== */}
          {step === "success" && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Заявка отправлена!</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {purpose.type === "donation"
                  ? "Автор получил ваш чек в сообщениях. Спасибо за поддержку!"
                  : "Автор получил ваш чек в сообщениях и подтвердит оплату после проверки."}
              </p>
              <button
                onClick={() => { onClose(); onSuccess?.(); router.refresh(); }}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Понятно
              </button>
            </div>
          )}

          {/* ===== STEP 1: Choose method ===== */}
          {step === "method" && (
            <>
              {/* Product info */}
              <ProductInfo purpose={purpose} selectedTariff={selectedTariff} amount={amount} />

              {/* Tariff selector for subscriptions */}
              {purpose.type === "subscription" && tariffs.length > 1 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Выберите тариф</p>
                  {tariffs.map((t) => (
                    <label
                      key={t.id}
                      className={`block border rounded-lg p-3 cursor-pointer transition ${
                        selectedTariff?.id === t.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="tariff"
                        checked={selectedTariff?.id === t.id}
                        onChange={() => setSelectedTariff(t)}
                        className="sr-only"
                      />
                      <div className="flex justify-between">
                        <span className="font-medium text-sm dark:text-gray-100">{t.name}</span>
                        <span className="text-sm font-semibold text-green-600">{Number(t.price)} ₽</span>
                      </div>
                      {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">Срок: {t.durationDays} дн.</p>
                    </label>
                  ))}
                </div>
              )}

              {/* Donation amount */}
              {purpose.type === "donation" && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Сумма доната (необязательно)</label>
                  <input
                    type="number"
                    value={donationAmount}
                    onChange={(e) => setDonationAmount(e.target.value)}
                    placeholder="Любая сумма"
                    className="mt-1 w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              )}

              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Выберите способ оплаты</p>

              <div className="space-y-2">
                {availableMethods.includes("card") && (
                  <button
                    onClick={() => handleSelectMethod("card")}
                    className="w-full flex items-center gap-3 p-4 border dark:border-gray-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition text-left"
                  >
                    <span className="text-2xl">💳</span>
                    <div>
                      <div className="font-medium text-sm dark:text-gray-100">Перевод на карту</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Перевод через банковское приложение или СБП</div>
                    </div>
                    <span className="ml-auto text-gray-400">→</span>
                  </button>
                )}
                {availableMethods.includes("yukassa") && (
                  <button
                    onClick={() => { setPaymentMethod("yukassa"); handleYukassaPayment(); }}
                    disabled={submitting}
                    className="w-full flex items-center gap-3 p-4 border dark:border-gray-700 rounded-lg hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition text-left disabled:opacity-50"
                  >
                    <span className="text-2xl">🏦</span>
                    <div>
                      <div className="font-medium text-sm dark:text-gray-100">ЮKassa</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Автоматическая оплата картой онлайн</div>
                    </div>
                    <span className="ml-auto text-gray-400">{submitting ? "..." : "→"}</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* ===== STEP 2: Card payment ===== */}
          {step === "pay" && paymentMethod === "card" && (
            <>
              <button onClick={() => setStep("method")} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-3 inline-flex items-center gap-1">
                ← Назад
              </button>

              <ProductInfo purpose={purpose} selectedTariff={selectedTariff} amount={amount} />

              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">Инструкция:</p>
                <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5 list-decimal list-inside">
                  <li>Скопируйте номер карты ниже</li>
                  <li>Переведите {amount > 0 ? `${amount} ₽` : "нужную сумму"} через банковское приложение</li>
                  <li>Сделайте скриншот чека об оплате</li>
                  <li>Прикрепите скриншот и нажмите «Я оплатил»</li>
                </ol>
              </div>

              {/* Card number */}
              {cardNumber ? (
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-4 py-3 mb-4">
                  <span className="font-mono text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-wider flex-1">
                    {cardNumber}
                  </span>
                  <button
                    onClick={() => copyCard(cardNumber)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      cardCopied
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 hover:bg-blue-200"
                    }`}
                  >
                    {cardCopied ? "✓ Скопировано" : "Копировать"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
                  Номер карты не указан. Уточните у автора.
                </p>
              )}

              {/* Receipt upload */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Скриншот чека <span className="text-red-500">*</span>
                </p>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                {receiptPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptPreview} alt="Чек" className="w-full max-h-48 object-contain rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-800" />
                    <button onClick={removeReceipt} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600">✕</button>
                    <p className="text-xs text-green-600 mt-1">✓ Скриншот прикреплён</p>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-400 transition"
                  >
                    <div className="text-2xl mb-1">📎</div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Нажмите, чтобы прикрепить скриншот</p>
                    <p className="text-xs text-gray-400 mt-0.5">JPG, PNG до 10 МБ</p>
                  </button>
                )}
              </div>

              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

              <button
                onClick={handleCardPayment}
                disabled={submitting || !receiptFile}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? "Отправка..." : "Я оплатил"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Product info summary =====
function ProductInfo({
  purpose,
  selectedTariff,
  amount,
}: {
  purpose: PaymentPurpose;
  selectedTariff: TariffOption | null;
  amount: number;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm dark:text-gray-100">
            {purpose.type === "donation" && `Донат для ${purpose.authorName}`}
            {purpose.type === "idea" && purpose.ideaTitle}
            {purpose.type === "subscription" && (selectedTariff?.name || "Подписка")}
            {purpose.type === "course" && purpose.courseTitle}
          </div>
          {purpose.type === "subscription" && selectedTariff?.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedTariff.description}</p>
          )}
          {purpose.type === "subscription" && selectedTariff && (
            <p className="text-xs text-gray-400 mt-0.5">Срок: {selectedTariff.durationDays} дн.</p>
          )}
        </div>
        {amount > 0 && (
          <span className="text-sm font-bold text-green-600 ml-2 shrink-0">{amount} ₽</span>
        )}
      </div>
    </div>
  );
}
