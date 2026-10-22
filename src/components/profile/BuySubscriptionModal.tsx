"use client";

import { useEffect, useState } from "react";
import UnifiedPaymentModal, { TariffOption } from "@/components/shared/UnifiedPaymentModal";
import { useT } from "@/lib/i18n/client";
import { defaultPlan, sortPlans, type PlanView } from "@/lib/tariff-plans";

interface BuySubscriptionModalProps {
  authorId: string;
  authorName: string;
  onClose: () => void;
  /** The channel (its id; the id of one of its plans works too). */
  preselectedTariffId?: string;
  /** ISO end date of the viewer's running subscription: the modal renews THIS channel and the paid period is added to it. */
  renewUntil?: string;
  /** Renewal: the plan the viewer is on now - preselected (they may pick another plan; the term is added to the same subscription). */
  currentPlanId?: string | null;
}

/** A channel of GET /api/users/[id]/tariffs: the channel row plus its plans on sale. */
interface ChannelEntry {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  paymentMethods: string[];
  cardNumber?: string | null;
  sbpQrUrl?: string | null;
  plans?: PlanView[];
}

export default function BuySubscriptionModal({
  authorId,
  authorName,
  onClose,
  preselectedTariffId,
  renewUntil,
  currentPlanId,
}: BuySubscriptionModalProps) {
  const { t } = useT();
  const [options, setOptions] = useState<TariffOption[]>([]);
  const [tariff, setTariff] = useState<TariffOption | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${authorId}/tariffs`)
      .then((r) => r.json())
      .then((data: ChannelEntry[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        // renewal: exactly the viewer's channel, never "the first one" (that would charge for another channel)
        const channel = preselectedTariffId
          ? data.find((c) => c.id === preselectedTariffId || c.plans?.some((p) => p.id === preselectedTariffId)) || (renewUntil ? null : data[0])
          : data[0];
        if (!channel) return;
        // One option per plan on sale, sorted by period then price; a channel row without `plans` (old API answer) is a single plan.
        const views: PlanView[] =
          channel.plans && channel.plans.length > 0
            ? channel.plans
            : [{ id: channel.id, label: null, price: Number(channel.price), durationDays: channel.durationDays, isRoot: true, isActive: true }];
        const opts: TariffOption[] = sortPlans(views).map((p) => ({
          id: p.id,
          name: p.label || channel.name,
          planLabel: p.label,
          channelName: channel.name,
          description: null,
          price: p.price,
          durationDays: p.durationDays,
          paymentMethods: p.paymentMethods ?? channel.paymentMethods ?? ["card"],
          cardNumber: p.cardNumber ?? (p.isRoot ? channel.cardNumber : null),
          sbpQrUrl: p.sbpQrUrl ?? (p.isRoot ? channel.sbpQrUrl : null),
        }));
        setOptions(opts);
        setTariff(
          opts.find((o) => o.id === currentPlanId) ||
            opts.find((o) => o.id === defaultPlan(views)?.id) ||
            opts[0] ||
            null
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        plans: options,
        authorId,
        authorName,
        ...(renewUntil ? { renewUntil } : {}),
      }}
      onClose={onClose}
    />
  );
}
