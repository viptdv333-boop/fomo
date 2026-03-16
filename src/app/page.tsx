"use client";

import { useEffect, useState } from "react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import Footer from "@/components/layout/Footer";

function AnimatedCounter({ target, label }: { target: number; label: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === 0) return;
    const duration = 1500;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{count}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  );
}

export default function HomePage() {
  const [stats, setStats] = useState({ users: 0, ideas: 0, instruments: 0 });

  useEffect(() => {
    fetch("/api/stats/public")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="text-center mb-6">
        <h1 className="text-6xl font-black tracking-tight mb-2">
          <span className="text-red-500">F</span>
          <span className="text-green-400">O</span>
          <span className="text-red-500">M</span>
          <span className="text-green-400">O</span>
        </h1>
        <p className="text-sm text-orange-500 font-semibold tracking-widest uppercase">
          Find Opportunities. Make Outcomes.
        </p>
      </div>

      <p className="text-xl text-gray-700 dark:text-gray-300 mb-2 font-medium">
        Добро пожаловать в FOMO!
      </p>
      <p className="text-base text-gray-500 dark:text-gray-400 mb-8 text-center max-w-md">
        Платформа для публикации и обсуждения торговых идей.
        Читайте аналитику, делитесь прогнозами, зарабатывайте на подписках.
      </p>

      <div className="flex flex-col items-center gap-3 mb-10 w-full max-w-xs">
        <a
          href="/login"
          className="w-full text-center rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition"
        >
          Войти
        </a>
        <a
          href="/register"
          className="w-full text-center rounded-lg border border-blue-600 px-6 py-3 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-gray-800 transition"
        >
          Зарегистрироваться
        </a>
        <a
          href="/feed"
          className="w-full text-center rounded-lg border border-gray-300 dark:border-gray-600 px-6 py-3 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          Продолжить без регистрации
        </a>
      </div>

      {(stats.users > 0 || stats.ideas > 0 || stats.instruments > 0) && (
        <div className="flex gap-12 mb-8 px-8 py-6 bg-white dark:bg-gray-900 rounded-2xl shadow-lg">
          <AnimatedCounter target={stats.users} label="Участников" />
          <AnimatedCounter target={stats.ideas} label="Идей" />
          <AnimatedCounter target={stats.instruments} label="Инструментов" />
        </div>
      )}

      <Footer />
    </main>
  );
}
