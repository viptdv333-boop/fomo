"use client";

import { useEffect, useState, useRef } from "react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import { FlagIcon } from "@/components/layout/FlagIcon";
import { useTheme } from "@/lib/theme";

function useCountUp(end: number, duration: number = 1500, start: boolean = false) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) { setCount(0); return; }
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentCount = Math.floor(easeOutQuart * end);
      if (currentCount !== countRef.current) {
        countRef.current = currentCount;
        setCount(currentCount);
      }
      if (progress < 1) requestAnimationFrame(animate);
      else setCount(end);
    };
    requestAnimationFrame(animate);
    return () => { startTimeRef.current = null; };
  }, [end, duration, start]);

  return count;
}

export default function HomePage() {
  const { theme } = useTheme();
  const [stats, setStats] = useState({ users: 0, ideas: 0, instruments: 0 });
  const [logoRevealed, setLogoRevealed] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [loginVisible, setLoginVisible] = useState(false);
  const [lang, setLang] = useState<"ru" | "en" | "cn">("ru");

  useEffect(() => {
    fetch("/api/stats/public")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});

    const logoTimer = setTimeout(() => setLogoRevealed(true), 300);
    const textTimer = setTimeout(() => setTextVisible(true), 1800);
    const loginTimer = setTimeout(() => setLoginVisible(true), 2500);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(textTimer);
      clearTimeout(loginTimer);
    };
  }, []);

  const membersCount = useCountUp(stats.users || 4, 1500, loginVisible);
  const ideasCount = useCountUp(stats.ideas || 10, 1800, loginVisible);
  const instrumentsCount = useCountUp(stats.instruments || 30, 2000, loginVisible);

  const isDark = theme === "dark";

  const content = {
    ru: {
      tagline: "FIND OPPORTUNITIES, MAKE OUTCOMES",
      welcome: "Платформа для публикации и обсуждения торговых идей. Читайте аналитику, делитесь прогнозами, зарабатывайте на подписках.",
      login: "Войти",
      register: "Зарегистрироваться",
      continue: "Продолжить без регистрации",
      participants: "Участников",
      ideas: "Идей",
      instruments: "Инструментов",
      copyright: "Copyright © Neurotrader 2026",
    },
    en: {
      tagline: "FIND OPPORTUNITIES, MAKE OUTCOMES",
      welcome: "A platform for publishing and discussing trading ideas. Read analytics, share forecasts, earn from subscriptions.",
      login: "Sign In",
      register: "Sign Up",
      continue: "Continue without registration",
      participants: "Members",
      ideas: "Ideas",
      instruments: "Instruments",
      copyright: "Copyright © Neurotrader 2026",
    },
    cn: {
      tagline: "FIND OPPORTUNITIES, MAKE OUTCOMES",
      welcome: "\u53D1\u5E03\u548C\u8BA8\u8BBA\u4EA4\u6613\u60F3\u6CD5\u7684\u5E73\u53F0\u3002\u9605\u8BFB\u5206\u6790\uFF0C\u5206\u4EAB\u9884\u6D4B\uFF0C\u901A\u8FC7\u8BA2\u9605\u8D5A\u53D6\u6536\u5165\u3002",
      login: "\u767B\u5F55",
      register: "\u6CE8\u518C",
      continue: "\u65E0\u9700\u6CE8\u518C\u7EE7\u7EED",
      participants: "\u53C2\u4E0E\u8005",
      ideas: "\u60F3\u6CD5",
      instruments: "\u5DE5\u5177",
      copyright: "Copyright © Neurotrader 2026",
    },
  };

  const t = content[lang];

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-gray-900" : "bg-white"}`}>
      {/* Top bar */}
      <header className="w-full px-6 py-4 flex justify-end items-center gap-4 fixed top-0 left-0 right-0 z-50">
        <button
          onClick={() => setLang(lang === "ru" ? "en" : lang === "en" ? "cn" : "ru")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 ${
            isDark
              ? "text-gray-300 hover:text-white hover:bg-gray-800"
              : "text-gray-600 hover:text-black hover:bg-gray-100"
          }`}
        >
          <FlagIcon code={lang === "cn" ? "zh" : lang} size={22} />
          <span className="text-sm font-medium uppercase">{lang}</span>
        </button>
        <ThemeToggle />
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-16 pb-4">
        {/* Logo with photo-reveal effect */}
        <div className="flex flex-col items-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-fomo.png"
            alt="FOMO"
            className={`logo-image ${logoRevealed ? "revealed" : ""}`}
          />
          <div
            className={`logo-subtitle ${logoRevealed ? "revealed" : ""} ${
              isDark ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {t.tagline}
          </div>
        </div>

        {/* Welcome text */}
        <div className={`welcome-text max-w-xl text-center mb-6 ${textVisible ? "visible" : ""}`}>
          <p className={`text-base leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {t.welcome}
          </p>
        </div>

        {/* Login buttons */}
        <div className={`login-block flex flex-col sm:flex-row gap-4 items-center ${loginVisible ? "visible" : ""}`}>
          <a
            href="/login"
            className={`min-w-[160px] text-center px-6 py-3 rounded-lg border-2 font-medium transition-all duration-300 ${
              isDark
                ? "border-gray-600 text-gray-200 hover:bg-gray-800 hover:text-white"
                : "border-gray-300 text-gray-800 hover:bg-gray-50"
            }`}
          >
            {t.login}
          </a>
          <a
            href="/register"
            className={`min-w-[160px] text-center px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
              isDark
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-black text-white hover:bg-gray-800"
            }`}
          >
            {t.register}
          </a>
        </div>

        {/* Continue without registration */}
        <div className={`continue-link mt-5 ${loginVisible ? "visible" : ""}`}>
          <a
            href="/feed"
            className={`text-sm underline underline-offset-4 transition-colors duration-300 ${
              isDark
                ? "text-gray-400 hover:text-white"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.continue}
          </a>
        </div>

        {/* Stats with animated counters */}
        <div className={`stats-container mt-10 grid grid-cols-3 gap-12 ${loginVisible ? "visible" : ""}`}>
          <div className="stat-item text-center">
            <div className={`text-3xl font-bold ${isDark ? "text-white" : "text-black"}`}>{membersCount}</div>
            <div className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{t.participants}</div>
          </div>
          <div className="stat-item text-center">
            <div className={`text-3xl font-bold ${isDark ? "text-white" : "text-black"}`}>{ideasCount}</div>
            <div className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{t.ideas}</div>
          </div>
          <div className="stat-item text-center">
            <div className={`text-3xl font-bold ${isDark ? "text-white" : "text-black"}`}>{instrumentsCount}</div>
            <div className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{t.instruments}</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`landing-footer w-full py-6 text-center text-xs ${loginVisible ? "visible" : ""} ${isDark ? "text-gray-500" : "text-gray-400"}`}>
        {t.copyright}
      </footer>
    </div>
  );
}
