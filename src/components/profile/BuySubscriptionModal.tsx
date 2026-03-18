"use client";

import { useEffect, useState } from "react";
import UnifiedPaymentModal, { TariffOption } from "@/components/shared/UnifiedPaymentModal";

interface BuySubscriptionModalProps {
  authorId: string;
  authorName: string;
  onClose: () => void;
  preselectedTariffId?: string;
}

export default function BuySubscriptionModal({
  authorId,
  authorName,
  onClose,
  preselectedTariffId,
}: BuySubscriptionModalProps) {
  const [tariff, setTariff] = useState<TariffOption | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${authorId}/tariffs`)
      .then((r) => r.json())
      .then((data: TariffOption[]) => {
        if (data.length > 0) {
          const match = preselectedTariffId
            ? data.find((t) => t.id === preselectedTariffId) || data[0]
            : data[0];
          setTariff(match);
        }
      })
      .finally(() => setLoading(false));
  }, [authorId, preselectedTariffId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!tariff) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-3">У автора нет активных каналов</p>
          <button onClick={onClose} className="text-blue-600 text-sm hover:underline">Закрыть</button>
        </div>
      </div>
    );
  }

  return (
    <UnifiedPaymentModal
      purpose={{
        type: "subscription",
        tariff,
        authorId,
        authorName,
      }}
      onClose={onClose}
    />
  );
}
