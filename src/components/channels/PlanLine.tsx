"use client";

import { useT } from "@/lib/i18n/client";
import { planSummary } from "@/lib/tariff-plans";

export interface PlanLineItem {
  id: string;
  label: string | null;
  price: number;
  durationDays: number;
}

/**
 * «Неделя 1000 ₽ · Месяц 3000 ₽ · и ещё 2»: the plans of ONE channel on a single line (first `max`, then «и ещё N»).
 * A plan without a name shows «1000 ₽ / 7 дн.». Without any plan data the channel's own price / period is shown.
 */
export default function PlanLine({
  plans,
  price,
  durationDays,
  max = 3,
  className = "",
}: {
  plans?: PlanLineItem[];
  price?: number;
  durationDays?: number;
  max?: number;
  className?: string;
}) {
  const { t } = useT();
  const list: PlanLineItem[] =
    plans && plans.length > 0
      ? plans
      : price && price > 0
        ? [{ id: "own", label: null, price, durationDays: durationDays ?? 30 }]
        : [];
  if (list.length === 0) return null;
  const { shown, more } = planSummary(list.map((p) => ({ ...p, isRoot: false, isActive: true })), max);
  return (
    <span className={className} data-testid="plan-line">
      {shown.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span aria-hidden> · </span>}
          {p.label ? `${p.label} ${p.price} ₽` : t("channel2.priceForDays", { price: p.price, days: p.durationDays })}
        </span>
      ))}
      {more > 0 && <span> {t("channel2.plansMore", { count: more })}</span>}
    </span>
  );
}
