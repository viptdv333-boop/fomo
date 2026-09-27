"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { receiptDmText } from "@/lib/i18n/receipt-dm";

// ===== Universal payment types =====
export type PaymentPurpose =
  | { type: "donation"; authorId: string; authorName: string; donationCard?: string | null; donationQrUrl?: string | null }
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
  sbpQrUrl?: string | null;
}

interface UnifiedPaymentModalProps {
  purpose: PaymentPurpose;
  onClose: () => void;
  onSuccess?: () => void;
}

type PaymentMethod = "card" | "yukassa" | "sbp";
type Step = "method" | "pay" | "success";

export default function UnifiedPaymentModal({ purpose, onClose, onSuccess }: UnifiedPaymentModalProps) {
  const router = useRouter();
  const { t } = useT();
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

  // Idea purchase: payment request is created up front (on method select) so we
  // can show the seller's real card number, not just at receipt-upload time
  const [ideaPayment, setIdeaPayment] = useState<{ id: string; sellerCard: string | null; sellerQrUrl: string | null } | null>(null);
  const [loadingIdeaPayment, setLoadingIdeaPayment] = useState(false);

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
      case "donation": return t("pay.titleDonation", { name: purpose.authorName });
      case "idea": return t("pay.titleIdea");
      case "subscription": return t("pay.titleSubscription", { name: purpose.authorName });
      case "course": return t("pay.titleCourse");
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
      case "idea": return ideaPayment?.sellerCard || null;
      case "subscription": return selectedTariff?.cardNumber || null;
      case "course": return null;
    }
  })();

  const qrUrl = (() => {
    switch (purpose.type) {
      case "donation": return purpose.donationQrUrl || null;
      case "idea": return ideaPayment?.sellerQrUrl || null;
      case "subscription": return selectedTariff?.sbpQrUrl || null;
      case "course": return null;
    }
  })();

  // Available methods
  const availableMethods: PaymentMethod[] = (() => {
    if (purpose.type === "subscription" && selectedTariff) {
      const m = selectedTariff.paymentMethods || ["card"];
      return m.filter((x): x is PaymentMethod => x === "card" || x === "yukassa" || x === "sbp");
    }
    // Donation/idea/course are manual bank transfers — always offer both.
    return ["card", "sbp"];
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
    if (!file.type.startsWith("image/")) { setError(t("pay.onlyImage")); return; }
    if (file.size > 10 * 1024 * 1024) { setError(t("pay.maxSize10")); return; }
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
    if (!res.ok) { setError(t("pay.screenshotUploadFailed")); return null; }
    return (await res.json()).url;
  }

  async function handleSelectMethod(method: PaymentMethod) {
    setPaymentMethod(method);

    if ((method === "card" || method === "sbp") && purpose.type === "idea" && !ideaPayment) {
      setLoadingIdeaPayment(true);
      setError("");
      try {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId: purpose.ideaId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("pay.paymentError"));
        if (!data.paymentRequest?.id) throw new Error(t("pay.paymentError"));
        setIdeaPayment({ id: data.paymentRequest.id, sellerCard: data.sellerCard || null, sellerQrUrl: data.sellerQrUrl || null });
      } catch (err: any) {
        setError(err.message || t("pay.paymentError"));
        setLoadingIdeaPayment(false);
        return;
      }
      setLoadingIdeaPayment(false);
    }

    setStep("pay");
  }

  async function handleCardPayment() {
    if (!receiptFile) { setError(t("pay.attachReceipt")); return; }
    setSubmitting(true);
    setError("");

    const receiptUrl = await uploadReceipt();
    if (!receiptUrl) { setSubmitting(false); return; }

    try {
      let paymentId: string | null = null;

      if (purpose.type === "idea") {
        if (ideaPayment?.id) {
          paymentId = ideaPayment.id;
        } else {
          // Fallback in case the request wasn't created on method-select
          const res = await fetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ideaId: purpose.ideaId }),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          const data = await res.json();
          paymentId = data.paymentRequest?.id;
        }
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
      setError(err.message || t("pay.paymentError"));
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
      setError((await res.json()).error || t("pay.paymentCreateError"));
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

      // The DM goes to the author, not the buyer — keep it in the site's base language.
      const tRu = receiptDmText;
      const msgText = (() => {
        switch (purpose.type) {
          case "donation":
            return tRu("pay.dmDonation", { amount: donationAmount ? ` ${donationAmount} ₽` : "" });
          case "idea":
            return tRu("pay.dmIdea", { title: purpose.ideaTitle, price: purpose.price });
          case "subscription":
            return tRu("pay.dmSubscription", { title: String(selectedTariff?.name), price: amount });
          case "course":
            return tRu("pay.dmCourse", { title: purpose.courseTitle, price: purpose.price });
        }
      })();

      await fetch(`/api/messages/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msgText, fileUrl: receiptUrl, fileName: tRu("pay.receiptFileName"), fileType: "image" }),
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t("pay.requestSent")}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {purpose.type === "donation"
                  ? t("pay.successDonation")
                  : t("pay.successPayment")}
              </p>
              <button
                onClick={() => { onClose(); onSuccess?.(); router.refresh(); }}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition"
              >
                {t("pay.gotIt")}
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
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("pay.chooseTariff")}</p>
                  {tariffs.map((tf) => (
                    <label
                      key={tf.id}
                      className={`block border rounded-lg p-3 cursor-pointer transition ${
                        selectedTariff?.id === tf.id
                          ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="tariff"
                        checked={selectedTariff?.id === tf.id}
                        onChange={() => setSelectedTariff(tf)}
                        className="sr-only"
                      />
                      <div className="flex justify-between">
                        <span className="font-medium text-sm dark:text-gray-100">{tf.name}</span>
                        <span className="text-sm font-semibold text-green-600">{Number(tf.price)} ₽</span>
                      </div>
                      {tf.description && <p className="text-xs text-gray-500 mt-0.5">{tf.description}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{t("pay.termDays", { days: tf.durationDays })}</p>
                    </label>
                  ))}
                </div>
              )}

              {/* Donation amount */}
              {purpose.type === "donation" && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("pay.donationAmountLabel")}</label>
                  <input
                    type="number"
                    value={donationAmount}
                    onChange={(e) => setDonationAmount(e.target.value)}
                    placeholder={t("pay.anyAmount")}
                    className="mt-1 w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              )}

              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t("pay.chooseMethod")}</p>

              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

              <div className="space-y-2">
                {availableMethods.includes("card") && (
                  <button
                    onClick={() => handleSelectMethod("card")}
                    disabled={loadingIdeaPayment}
                    className="w-full flex items-center gap-3 p-4 border dark:border-gray-700 rounded-lg hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition text-left disabled:opacity-50"
                  >
                    <span className="text-2xl">💳</span>
                    <div>
                      <div className="font-medium text-sm dark:text-gray-100">{t("pay.methodCardTitle")}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t("pay.methodCardDesc")}</div>
                    </div>
                    <span className="ml-auto text-gray-400">{loadingIdeaPayment && paymentMethod === "card" ? "..." : "→"}</span>
                  </button>
                )}
                {availableMethods.includes("sbp") && (
                  <button
                    onClick={() => handleSelectMethod("sbp")}
                    disabled={loadingIdeaPayment}
                    className="w-full flex items-center gap-3 p-4 border dark:border-gray-700 rounded-lg hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition text-left disabled:opacity-50"
                  >
                    <span className="text-2xl">🔳</span>
                    <div>
                      <div className="font-medium text-sm dark:text-gray-100">{t("pay.methodSbpTitle")}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t("pay.methodSbpDesc")}</div>
                    </div>
                    <span className="ml-auto text-gray-400">{loadingIdeaPayment && paymentMethod === "sbp" ? "..." : "→"}</span>
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t("pay.methodYukassaDesc")}</div>
                    </div>
                    <span className="ml-auto text-gray-400">{submitting ? "..." : "→"}</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* ===== STEP 2: Card / SBP QR payment ===== */}
          {step === "pay" && (paymentMethod === "card" || paymentMethod === "sbp") && (
            <>
              <button onClick={() => setStep("method")} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-3 inline-flex items-center gap-1">
                ← {t("common.back")}
              </button>

              <ProductInfo purpose={purpose} selectedTariff={selectedTariff} amount={amount} />

              {/* Instructions */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">{t("pay.instruction")}</p>
                <ol className="text-xs text-green-700 dark:text-green-400 space-y-0.5 list-decimal list-inside">
                  {paymentMethod === "sbp" ? (
                    <>
                      <li>{t("pay.sbpStep1")}</li>
                      <li>{t("pay.sbpStep2")}</li>
                      <li>{t("pay.transferAmount", { amount: amount > 0 ? `${amount} ₽` : t("pay.requiredAmount") })}</li>
                      <li>{t("pay.stepScreenshot")}</li>
                      <li>{t("pay.stepAttach")}</li>
                    </>
                  ) : (
                    <>
                      <li>{t("pay.cardStep1")}</li>
                      <li>{t("pay.cardStepTransfer", { amount: amount > 0 ? `${amount} ₽` : t("pay.requiredAmount") })}</li>
                      <li>{t("pay.stepScreenshot")}</li>
                      <li>{t("pay.stepAttach")}</li>
                    </>
                  )}
                </ol>
              </div>

              {/* Payment details: card number or SBP QR code */}
              {paymentMethod === "sbp" ? (
                qrUrl ? (
                  <div className="flex flex-col items-center bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl} alt={t("profile2.sbpQr")} className="w-48 h-48 object-contain" />
                    <p className="text-xs text-gray-400 mt-2">{t("pay.qrScanHint")}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
                    {t("pay.qrMissing")}
                  </p>
                )
              ) : cardNumber ? (
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-4 py-3 mb-4">
                  <span className="font-mono text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-wider flex-1">
                    {cardNumber}
                  </span>
                  <button
                    onClick={() => copyCard(cardNumber)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      cardCopied
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                        : "bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200"
                    }`}
                  >
                    {cardCopied ? t("pay.copied") : t("pay.copy")}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
                  {t("pay.cardMissing")}
                </p>
              )}

              {/* Receipt upload */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {t("pay.receiptScreenshot")} <span className="text-red-500">*</span>
                </p>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                {receiptPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptPreview} alt={t("pay.receiptAlt")} className="w-full max-h-48 object-contain rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-800" />
                    <button onClick={removeReceipt} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600">✕</button>
                    <p className="text-xs text-green-600 mt-1">{t("pay.screenshotAttached")}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-green-400 transition"
                  >
                    <div className="text-2xl mb-1">📎</div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("pay.clickToAttach")}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t("pay.fileHint10")}</p>
                  </button>
                )}
              </div>

              {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

              <button
                onClick={handleCardPayment}
                disabled={submitting || !receiptFile}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {submitting ? t("pay.sending") : t("pay.iPaid")}
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
  const { t } = useT();
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm dark:text-gray-100">
            {purpose.type === "donation" && t("pay.titleDonation", { name: purpose.authorName })}
            {purpose.type === "idea" && purpose.ideaTitle}
            {purpose.type === "subscription" && (selectedTariff?.name || t("pay.subscription"))}
            {purpose.type === "course" && purpose.courseTitle}
          </div>
          {purpose.type === "subscription" && selectedTariff?.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedTariff.description}</p>
          )}
          {purpose.type === "subscription" && selectedTariff && (
            <p className="text-xs text-gray-400 mt-0.5">{t("pay.termDays", { days: selectedTariff.durationDays })}</p>
          )}
        </div>
        {amount > 0 && (
          <span className="text-sm font-bold text-green-600 ml-2 shrink-0">{amount} ₽</span>
        )}
      </div>
    </div>
  );
}
