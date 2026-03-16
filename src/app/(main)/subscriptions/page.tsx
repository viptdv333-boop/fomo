"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Sub {
  id: string;
  monthlyPrice: number;
  startDate: string;
  endDate: string;
  author: {
    id: string;
    displayName: string;
    rating: number;
  };
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((data) => {
        setSubs(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-gray-500 py-12 text-center">Загрузка...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Мои подписки</h1>

      {subs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>У вас нет активных подписок</p>
          <Link href="/feed" className="text-blue-600 hover:underline mt-2 inline-block">
            Перейти в ленту
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((sub) => (
            <div key={sub.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
              <div>
                <Link
                  href={`/profile/${sub.author.id}`}
                  className="font-medium hover:text-blue-600"
                >
                  {sub.author.displayName}
                </Link>
                <div className="text-sm text-gray-500">
                  Рейтинг: {Number(sub.author.rating).toFixed(1)} · {Number(sub.monthlyPrice)} ₽/мес
                </div>
              </div>
              <div className="text-sm text-gray-500">
                До {new Date(sub.endDate).toLocaleDateString("ru")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
