"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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

interface Tariff {
  id: string;
  monthlyPrice: number;
  description: string | null;
}

export default function SubscriptionsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [subs, setSubs] = useState<Sub[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tariffs" | "subscriptions">("tariffs");

  useEffect(() => {
    Promise.all([
      fetch("/api/subscriptions").then((r) => r.json()),
      user?.id ? fetch(`/api/users/${user.id}/tariffs`).then((r) => r.json()).catch(() => []) : Promise.resolve([]),
    ]).then(([subsData, tariffsData]) => {
      setSubs(Array.isArray(subsData) ? subsData : []);
      setTariffs(Array.isArray(tariffsData) ? tariffsData : []);
      setLoading(false);
    });
  }, [user?.id]);

  if (loading) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Загрузка...</div>;

  const paidSubs = subs.filter((s) => Number(s.monthlyPrice) > 0);
  const freeSubs = subs.filter((s) => Number(s.monthlyPrice) === 0);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Тарифы и подписки</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setTab("tariffs")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
            tab === "tariffs"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Мои тарифы
        </button>
        <button
          onClick={() => setTab("subscriptions")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
            tab === "subscriptions"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Мои подписки {subs.length > 0 && <span className="ml-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">{subs.length}</span>}
        </button>
      </div>

      {/* Tariffs tab */}
      {tab === "tariffs" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Создайте платный тариф, чтобы монетизировать свои идеи
            </p>
            <Link
              href="/profile#tariffs"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shrink-0 ml-4"
            >
              + Создать тариф
            </Link>
          </div>

          {tariffs.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl shadow">
              <div className="text-4xl mb-3">💰</div>
              <p className="text-gray-500 dark:text-gray-400 mb-4">У вас пока нет тарифов</p>
              <Link
                href="/profile#tariffs"
                className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Создать платный тариф
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {tariffs.map((t) => (
                <div key={t.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium dark:text-gray-100">{Number(t.monthlyPrice)} ₽/мес</div>
                    {t.description && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t.description}</div>
                    )}
                  </div>
                  <Link
                    href="/profile#tariffs"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Настроить
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subscriptions tab */}
      {tab === "subscriptions" && (
        <div>
          {subs.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl shadow">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-gray-500 dark:text-gray-400 mb-4">У вас нет активных подписок</p>
              <Link href="/feed" className="text-blue-600 dark:text-blue-400 hover:underline">
                Перейти в ленту
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Paid subscriptions */}
              {paidSubs.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    Платные подписки
                  </h2>
                  <div className="space-y-3">
                    {paidSubs.map((sub) => (
                      <div key={sub.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 flex items-center justify-between">
                        <div>
                          <Link
                            href={`/profile/${sub.author.id}`}
                            className="font-medium hover:text-blue-600 dark:text-gray-100"
                          >
                            {sub.author.displayName}
                          </Link>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {Number(sub.monthlyPrice)} ₽/мес · До {new Date(sub.endDate).toLocaleDateString("ru")}
                          </div>
                        </div>
                        <button className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                          Отписаться
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Free subscriptions */}
              {freeSubs.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    Бесплатные подписки
                  </h2>
                  <div className="space-y-3">
                    {freeSubs.map((sub) => (
                      <div key={sub.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 flex items-center justify-between">
                        <div>
                          <Link
                            href={`/profile/${sub.author.id}`}
                            className="font-medium hover:text-blue-600 dark:text-gray-100"
                          >
                            {sub.author.displayName}
                          </Link>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Бесплатно
                          </div>
                        </div>
                        <button className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                          Отписаться
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
