"use client";

import { useEffect, useState, useRef } from "react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { FlagIcon } from "@/components/layout/FlagIcon";
import { useTheme } from "@/lib/theme";
import ChartBackground from "./TickerBackground";

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

export default function DesignPreviewPage() {
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
      welcome: "发布和讨论交易想法的平台。阅读分析，分享预测，通过订阅赚取收入。",
      login: "登录",
      register: "注册",
      continue: "无需注册继续",
      participants: "参与者",
      ideas: "想法",
      instruments: "工具",
      copyright: "Copyright © Neurotrader 2026",
    },
  };

  const t = content[lang];

  return (
    <div
      className={`design-preview min-h-screen flex flex-col relative ${isDark ? "bg-[#0a0a0a]" : "bg-white"}`}
      style={isDark ? { background: "linear-gradient(180deg, #0a0a0a 0%, #151515 30%, #0d0d0d 60%, #111111 100%)" } : undefined}
    >
      {/* Animated monochrome chart background */}
      <ChartBackground />

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
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-16 pb-4">
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
      <footer className={`relative z-10 landing-footer w-full py-6 text-center text-xs ${loginVisible ? "visible" : ""} ${isDark ? "text-gray-500" : "text-gray-400"}`}>
        {t.copyright}
      </footer>

      {/* Newspaper serif fonts — scoped to this preview page only */}
      <style jsx global>{`
        .design-preview,
        .design-preview p,
        .design-preview a,
        .design-preview span,
        .design-preview div,
        .design-preview button {
          font-family: "Crimson Pro", "Playfair Display", Georgia, "Times New Roman", serif;
        }
        .design-preview .logo-subtitle {
          font-family: "Playfair Display", Georgia, serif;
          font-weight: 500;
        }
        .design-preview .stat-item > div:first-child {
          font-family: "Playfair Display", Georgia, serif;
          font-weight: 900;
        }
      `}</style>
    </div>
  );
}
