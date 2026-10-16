"use client";

import { useEffect, useState } from "react";
import UnifiedPaymentModal, { TariffOption } from "@/components/shared/UnifiedPaymentModal";
import { useT } from "@/lib/i18n/client";

interface BuySubscriptionModalProps {
  authorId: string;
  authorName: string;
  onClose: () => void;
  preselectedTariffId?: string;
  /** ISO end date of the viewer's running subscription: the modal renews THIS tariff and the paid period is added to it. */
  renewUntil?: string;
}

export default function BuySubscriptionModal({
  authorId,
  authorName,
  onClose,
  preselectedTariffId,
  renewUntil,
}: BuySubscriptionModalProps) {
  const { t } = useT();
  const [tariff, setTariff] = useState<TariffOption | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${authorId}/tariffs`)
      .then((r) => r.json())
      .then((data: TariffOption[]) => {
        if (data.length > 0) {
          // renewal: exactly the viewer's channel, never "the first one" (that would charge for another channel)
          const match = preselectedTariffId
            ? data.find((t) => t.id === preselectedTariffId) || (renewUntil ? null : data[0])
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
          <p className="text-gray-500 dark:text-gray-400">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!tariff) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-3">{t("pay.authorNoChannels")}</p>
          <button onClick={onClose} className="text-green-600 text-sm hover:underline">{t("common.close")}</button>
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
        ...(renewUntil ? { renewUntil } : {}),
      }}
      onClose={onClose}
    />
  );
}
