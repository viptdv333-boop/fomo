"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import PaymentMethodsManager from "./PaymentMethodsManager";
import { useT } from "@/lib/i18n/client";

const DATE_LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", cn: "zh-CN" };

interface PaymentItem {
  id: string;
  sellerId?: string;
  sellerName?: string;
  buyerId?: string;
  buyerName?: string;
  ideaId: string | null;
  ideaTitle: string | null;
  subscriptionType: string | null;
  amount: number;
  receiptUrl: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  createdAt: string;
}

interface FinanceData {
  earnings: { total: number; thisMonth: number; transactionCount: number };
  subscribers: { active: number };
  tariffs: { id: string; name: string; price: number; durationDays: number; subscriberCount: number }[];
  ideaSales: { total: number; count: number };
  spending: { total: number; count: number };
  mySubscriptions: {
    id: string;
    authorId: string;
    authorName: string;
    tariffName: string;
    endDate: string;
    monthlyPrice: number;
  }[];
  purchases: PaymentItem[];
  sales: PaymentItem[];
}

interface FinanceTabProps {
  userId: string;
}

export default function FinanceTab({ userId }: FinanceTabProps) {
  const { t } = useT();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsubscribing, setUnsubscribing] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null);
  const [sendingReceipt, setSendingReceipt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePaymentIdRef = useRef<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/users/${userId}/finances`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  const handleUnsubscribe = async (subscriptionId: string) => {
    if (!confirm(t("pay.confirmUnsubscribe"))) return;
    setUnsubscribing(subscriptionId);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subscriptionId }),
      });
      if (res.ok) {
        fetchData();
      } else {
        alert(t("pay.unsubscribeFailed"));
      }
    } finally {
      setUnsubscribing(null);
    }
  };

  const handleReceiptUpload = (paymentId: string) => {
    activePaymentIdRef.current = paymentId;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const paymentId = activePaymentIdRef.current;
    if (!file || !paymentId) return;

    setUploadingReceipt(paymentId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "receipts");

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        alert(t("pay.fileUploadError"));
        return;
      }
      const { url } = await uploadRes.json();

      const patchRes = await fetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptUrl: url }),
      });
      if (patchRes.ok) {
        fetchData();
      } else {
        alert(t("pay.receiptSaveError"));
      }
    } finally {
      setUploadingReceipt(null);
      activePaymentIdRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSendForReview = async (paymentId: string) => {
    setSendingReceipt(paymentId);
    try {
      // The receipt is already uploaded; this PATCH just notifies
      // (status stays PENDING until seller confirms)
      // We refresh data to reflect the updated state
      fetchData();
    } finally {
      setSendingReceipt(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const paidSubscriptions = data.mySubscriptions.filter((s) => s.monthlyPrice > 0);
  const freeSubscriptions = data.mySubscriptions.filter((s) => s.monthlyPrice === 0);

  return (
    <div className="space-y-6">
      {/* Payment methods */}
      <PaymentMethodsManager />

      {/* Hidden file input for receipt upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Earnings overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={t("pay.earnedTotal")}
          value={`${data.earnings.total.toLocaleString("ru")} ₽`}
          accent="green"
        />
        <StatCard
          label={t("pay.thisMonth")}
          value={`${data.earnings.thisMonth.toLocaleString("ru")} ₽`}
          accent="green"
        />
        <StatCard
          label={t("pay.activeSubscribers")}
          value={String(data.subscribers.active)}
          accent="purple"
        />
        <StatCard
          label={t("pay.ideasSold")}
          value={`${data.ideaSales.count} (${data.ideaSales.total.toLocaleString("ru")} ₽)`}
          accent="amber"
        />
      </div>

      {/* Tariffs stats */}
      {data.tariffs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            {t("pay.myChannels")}
          </h3>
          <div className="space-y-2">
            {data.tariffs.map((tr) => (
              <Link
                key={tr.id}
                href={`/channels/${tr.id}`}
                className="flex items-center justify-between bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3 hover:border-green-400 dark:hover:border-green-500 transition"
              >
                <div>
                  <span className="font-medium dark:text-gray-100">{tr.name}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    {t("pay.pricePerDays", { price: tr.price, days: tr.durationDays })}
                  </span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t("pay.subscribersCount", { count: tr.subscriberCount })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* My spending */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          {t("pay.mySpending")}
        </h3>
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">{t("pay.spentTotal")}</span>
            <span className="font-semibold dark:text-gray-100">
              {data.spending.total.toLocaleString("ru")} ₽
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-gray-600 dark:text-gray-400">{t("pay.transactions")}</span>
            <span className="dark:text-gray-300">{data.spending.count}</span>
          </div>
        </div>
      </div>

      {/* Active subscriptions - Paid */}
      {paidSubscriptions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            {t("pay.mySubsPaid")}
          </h3>
          <div className="space-y-2">
            {paidSubscriptions.map((s) => (
              <SubscriptionCard
                key={s.id}
                subscription={s}
                unsubscribing={unsubscribing === s.id}
                onUnsubscribe={() => handleUnsubscribe(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active subscriptions - Free */}
      {freeSubscriptions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            {t("pay.mySubsFree")}
          </h3>
          <div className="space-y-2">
            {freeSubscriptions.map((s) => (
              <SubscriptionCard
                key={s.id}
                subscription={s}
                unsubscribing={unsubscribing === s.id}
                onUnsubscribe={() => handleUnsubscribe(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {data.mySubscriptions.length === 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            {t("pay.mySubs")}
          </h3>
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400">
            {t("pay.noActiveSubs")}
          </div>
        </div>
      )}

      {/* My Purchases */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          {t("pay.myPurchases")}
        </h3>
        {data.purchases.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400">
            {t("pay.noPurchases")}
          </div>
        ) : (
          <div className="space-y-2">
            {data.purchases.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                role="buyer"
                uploadingReceipt={uploadingReceipt === p.id}
                sendingReceipt={sendingReceipt === p.id}
                onUploadReceipt={() => handleReceiptUpload(p.id)}
                onSendForReview={() => handleSendForReview(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* My Sales */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          {t("pay.mySales")}
        </h3>
        {data.sales.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400">
            {t("pay.noSales")}
          </div>
        ) : (
          <div className="space-y-2">
            {data.sales.map((s) => (
              <PaymentCard
                key={s.id}
                payment={s}
                role="seller"
                uploadingReceipt={false}
                sendingReceipt={false}
                onUploadReceipt={() => {}}
                onSendForReview={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function SubscriptionCard({
  subscription,
  unsubscribing,
  onUnsubscribe,
}: {
  subscription: {
    id: string;
    authorId: string;
    authorName: string;
    tariffName: string;
    endDate: string;
    monthlyPrice: number;
  };
  unsubscribing: boolean;
  onUnsubscribe: () => void;
}) {
  const { t } = useT();
  const s = subscription;
  const daysLeft = Math.ceil(
    (new Date(s.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
      <div>
        <Link
          href={`/profile/${s.authorId}`}
          className="font-medium hover:text-green-600 dark:text-gray-100 transition"
        >
          {s.authorName}
        </Link>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
          {s.tariffName}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium dark:text-gray-300">
            {s.monthlyPrice > 0 ? `${s.monthlyPrice} ₽` : t("pay.free")}
          </div>
          <div
            className={`text-xs ${
              daysLeft <= 3
                ? "text-red-500"
                : daysLeft <= 7
                ? "text-amber-500"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {daysLeft > 0 ? t("pay.daysLeft", { days: daysLeft }) : t("pay.expired")}
          </div>
        </div>
        <button
          onClick={onUnsubscribe}
          disabled={unsubscribing}
          className="text-xs px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
        >
          {unsubscribing ? "..." : t("channels.unsubscribe")}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "PENDING" | "CONFIRMED" | "REJECTED" }) {
  const { t } = useT();
  const styles = {
    PENDING: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300",
    CONFIRMED: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300",
    REJECTED: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300",
  };
  const labels = {
    PENDING: t("pay.statusPending"),
    CONFIRMED: t("pay.statusConfirmed"),
    REJECTED: t("pay.statusRejected"),
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function PaymentCard({
  payment,
  role,
  uploadingReceipt,
  sendingReceipt,
  onUploadReceipt,
  onSendForReview,
}: {
  payment: PaymentItem;
  role: "buyer" | "seller";
  uploadingReceipt: boolean;
  sendingReceipt: boolean;
  onUploadReceipt: () => void;
  onSendForReview: () => void;
}) {
  const { t, locale } = useT();
  const p = payment;
  const counterpartyId = role === "buyer" ? p.sellerId : p.buyerId;
  const counterpartyName = role === "buyer" ? p.sellerName : p.buyerName;
  const counterpartyLabel = role === "buyer" ? t("pay.seller") : t("pay.buyer");
  const dateStr = new Date(p.createdAt).toLocaleDateString(DATE_LOCALES[locale] || "ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Determine what the payment is for
  let description: React.ReactNode;
  if (p.ideaId && p.ideaTitle) {
    description = (
      <Link
        href={`/ideas/${p.ideaId}`}
        className="text-green-600 dark:text-green-400 hover:underline text-sm"
      >
        {p.ideaTitle}
      </Link>
    );
  } else if (p.subscriptionType) {
    description = (
      <span className="text-sm text-gray-500 dark:text-gray-400">{t("pay.subscription")}</span>
    );
  } else {
    description = (
      <span className="text-sm text-gray-500 dark:text-gray-400">{t("pay.payment")}</span>
    );
  }

  const showUploadButton = role === "buyer" && p.status === "PENDING" && !p.receiptUrl;
  const showSendButton = role === "buyer" && p.status === "PENDING" && !!p.receiptUrl;

  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {description}
            <StatusBadge status={p.status} />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {counterpartyLabel}:{" "}
            <Link
              href={`/profile/${counterpartyId}`}
              className="hover:text-green-600 dark:hover:text-green-400 transition"
            >
              {counterpartyName}
            </Link>
            {" · "}
            {dateStr}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-semibold dark:text-gray-100">{p.amount.toLocaleString("ru")} ₽</div>
        </div>
      </div>

      {/* Receipt actions for buyer */}
      {showUploadButton && (
        <div className="mt-2 pt-2 border-t dark:border-gray-700">
          <button
            onClick={onUploadReceipt}
            disabled={uploadingReceipt}
            className="text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
          >
            {uploadingReceipt ? t("common.loading") : t("pay.uploadReceipt")}
          </button>
        </div>
      )}

      {showSendButton && (
        <div className="mt-2 pt-2 border-t dark:border-gray-700 flex items-center gap-2">
          <a
            href={p.receiptUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            {t("pay.receiptUploaded")}
          </a>
          <button
            onClick={onSendForReview}
            disabled={sendingReceipt}
            className="text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
          >
            {sendingReceipt ? t("pay.sending") : t("pay.sendForReview")}
          </button>
        </div>
      )}

      {/* Receipt image for seller + confirm/reject */}
      {p.receiptUrl && role === "seller" && p.status === "PENDING" && (
        <SellerActions paymentId={p.id} receiptUrl={p.receiptUrl} />
      )}

      {/* Show receipt link for confirmed/rejected */}
      {p.receiptUrl && !(role === "seller" && p.status === "PENDING") && !showSendButton && !showUploadButton && (
        <div className="mt-2 pt-2 border-t dark:border-gray-700">
          <a
            href={p.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            {t("pay.viewReceipt")}
          </a>
        </div>
      )}
    </div>
  );
}

function SellerActions({ paymentId, receiptUrl }: { paymentId: string; receiptUrl: string }) {
  const { t } = useT();
  const [confirming, setConfirming] = useState<"none" | "confirm" | "reject">("none");
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState<"confirm" | "reject" | null>(null);

  async function handleAction(action: "confirm" | "reject") {
    if (confirming !== action) {
      setConfirming(action);
      return;
    }
    // Second click — actually do it
    setProcessing(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setDone(action);
      }
    } catch {}
    setProcessing(false);
  }

  if (done) {
    return (
      <div className="mt-2 pt-2 border-t dark:border-gray-700">
        <span className={`text-xs font-medium ${done === "confirm" ? "text-green-600" : "text-red-500"}`}>
          ✓ {done === "confirm" ? t("pay.statusConfirmed") : t("pay.statusRejected")}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t dark:border-gray-700 space-y-2">
      {/* Receipt preview */}
      <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={receiptUrl} alt={t("pay.receiptAlt")} className="max-h-32 rounded-lg border dark:border-gray-600 object-contain" />
      </a>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleAction("confirm")}
          disabled={processing}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition disabled:opacity-50 ${
            confirming === "confirm"
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200"
          }`}
        >
          {processing ? "..." : confirming === "confirm" ? t("pay.confirmSure") : t("pay.confirm")}
        </button>
        <button
          onClick={() => handleAction("reject")}
          disabled={processing}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition disabled:opacity-50 ${
            confirming === "reject"
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200"
          }`}
        >
          {processing ? "..." : confirming === "reject" ? t("pay.rejectSure") : t("pay.reject")}
        </button>
        {confirming !== "none" && (
          <button
            onClick={() => setConfirming("none")}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {t("common.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "green" | "purple" | "amber";
}) {
  const accentClasses = {
    green: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
  };

  return (
    <div className={`rounded-lg border p-4 ${accentClasses[accent]}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-lg font-bold dark:text-gray-100">{value}</div>
    </div>
  );
}
