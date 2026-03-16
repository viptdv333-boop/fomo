"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import ThemeToggle from "@/components/layout/ThemeToggle";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";

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
  const [showLogo, setShowLogo] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    fetch("/api/stats/public")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});

    // Animation sequence
    const logoTimer = setTimeout(() => setShowLogo(true), 100);
    const contentTimer = setTimeout(() => setShowContent(true), 1200);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(contentTimer);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-gray-950 transition-colors duration-500">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="w-20" />
        <div />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-16">
        {/* Logo with fade-in animation */}
        <div
          className={`transition-all duration-[1500ms] ease-out ${
            showLogo ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
          }`}
        >
          <div className="mb-8">
            <Image
              src="/images/logo-light.png"
              alt="FOMO"
              width={220}
              height={110}
              className="block dark:hidden mx-auto"
              priority
            />
            <Image
              src="/images/logo-dark.png"
              alt="FOMO"
              width={220}
              height={110}
              className="hidden dark:block mx-auto"
              priority
            />
          </div>
        </div>

        {/* Auth block with delayed fade-in */}
        <div
          className={`transition-all duration-1000 ease-out ${
            showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-base text-gray-500 dark:text-gray-400 mb-8 text-center max-w-md">
            Платформа для публикации и обсуждения торговых идей.
            Читайте аналитику, делитесь прогнозами, зарабатывайте на подписках.
          </p>

          <div className="flex flex-col items-center gap-3 mb-10 w-full max-w-xs mx-auto">
            <a
              href="/login"
              className="w-full text-center rounded-xl bg-blue-600 px-6 py-3.5 text-white font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 transition-all duration-300"
            >
              Войти
            </a>
            <a
              href="/register"
              className="w-full text-center rounded-xl border-2 border-blue-600 px-6 py-3.5 text-blue-600 dark:text-blue-400 dark:border-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300"
            >
              Зарегистрироваться
            </a>
            <a
              href="/feed"
              className="w-full text-center rounded-xl border border-gray-300 dark:border-gray-700 px-6 py-3.5 text-gray-500 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300"
            >
              Продолжить без регистрации
            </a>
          </div>

          {(stats.users > 0 || stats.ideas > 0 || stats.instruments > 0) && (
            <div className="flex gap-12 px-8 py-6 bg-gray-50 dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
              <AnimatedCounter target={stats.users} label="Участников" />
              <AnimatedCounter target={stats.ideas} label="Идей" />
              <AnimatedCounter target={stats.instruments} label="Инструментов" />
            </div>
          )}
        </div>
      </div>

      {/* Copyright at the very bottom */}
      <footer className="text-center text-xs text-gray-400 dark:text-gray-600 py-6">
        Copyright &copy; Neurotrader 2026
      </footer>
    </main>
  );
}
