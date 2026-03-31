"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PaymentMethod {
  id: string;
  type: string;
  label: string;
  details: any;
  isDefault: boolean;
}

interface Props {
  selectedId: string | null;
  onSelect: (method: PaymentMethod) => void;
}

const TYPE_ICONS: Record<string, string> = {
  card: "💳",
  yukassa: "🏦",
  crypto: "₿",
};

export default function PaymentMethodPicker({ selectedId, onSelect }: Props) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payment-methods")
      .then((r) => r.json())
      .then((data) => { setMethods(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-xs text-gray-400 py-2">Загрузка...</div>;

  if (methods.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-3 text-center bg-gray-50 dark:bg-gray-800 rounded-lg">
        Нет сохранённых способов оплаты.{" "}
        <Link href="/profile?tab=finance" className="text-green-600 hover:underline">Добавить в профиле</Link>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {methods.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m)}
          className={`w-full flex items-center gap-3 p-3 rounded-lg text-left text-sm transition border ${
            selectedId === m.id
              ? "border-green-500 bg-green-50 dark:bg-green-900/20"
              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
          }`}
        >
          <span className="text-lg">{TYPE_ICONS[m.type] || "💳"}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium dark:text-gray-100">{m.label}</div>
            {m.details?.cardNumber && (
              <div className="text-xs text-gray-400">**** {m.details.cardNumber.slice(-4)}</div>
            )}
          </div>
          {m.isDefault && <span className="text-[10px] text-green-600">По умолч.</span>}
          {selectedId === m.id && (
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
          )}
        </button>
      ))}
    </div>
  );
}
