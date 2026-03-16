"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="text-gray-400 dark:text-gray-500 text-center py-12">
        Загрузка...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-sm mx-4 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Доступно после регистрации
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Войдите или зарегистрируйтесь, чтобы получить доступ к этому разделу
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="w-full text-center rounded-lg bg-blue-600 px-6 py-2.5 text-white font-medium hover:bg-blue-700 transition"
            >
              Войти
            </Link>
            <Link
              href="/register"
              className="w-full text-center rounded-lg border border-blue-600 px-6 py-2.5 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-gray-700 transition"
            >
              Зарегистрироваться
            </Link>
            <Link
              href="/feed"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition mt-1"
            >
              ← Вернуться к стакану идей
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
