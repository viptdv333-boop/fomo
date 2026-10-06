"use client";

import { useEffect, useState } from "react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { FlagIcon } from "@/components/layout/FlagIcon";
import { useTheme } from "@/lib/theme";
import { useT } from "@/lib/i18n/client";
import { DownloadAppsBlock } from "@/components/shared/DownloadApps";

// Landing page of the terminal site (terminal.fomo.spot, SITE_MODE=terminal): the logo with «FOMO Terminal», login / sign-up,
// a few feature lines, the app downloads (DownloadAppsBlock flavor="terminal": Android, Windows, macOS when a file exists) and the legal links. LandingPage (the main site) is untouched. src/app/page.tsx
// picks one of the two by the site mode.

export default function TerminalLanding() {
  const { theme } = useTheme();
  const { t, locale, setLocale } = useT();
  const [logoRevealed, setLogoRevealed] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [loginVisible, setLoginVisible] = useState(false);
  const lang = (locale === "en" || locale === "cn" ? locale : "ru") as "ru" | "en" | "cn";
  const isDark = theme === "dark";

  useEffect(() => {
    const a = setTimeout(() => setLogoRevealed(true), 300);
    const b = setTimeout(() => setTextVisible(true), 1200);
    const c = setTimeout(() => setLoginVisible(true), 1800);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(c);
    };
  }, []);

  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const link = `text-sm underline underline-offset-4 transition-colors duration-300 ${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-800"}`;
  const features = [t("termsite.f1"), t("termsite.f2"), t("termsite.f3"), t("termsite.f4")];

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0a0a0a]" : "bg-white"}`}
      style={isDark ? { background: "linear-gradient(180deg, #0a0a0a 0%, #151515 30%, #0d0d0d 60%, #111111 100%)" } : undefined}
      data-terminal-landing
    >
      <header className="w-full px-6 py-4 flex justify-end items-center gap-4 fixed top-0 left-0 right-0 z-50">
        <button
          onClick={() => setLocale(lang === "ru" ? "en" : lang === "en" ? "cn" : "ru")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 ${
            isDark ? "text-gray-300 hover:text-white hover:bg-gray-800" : "text-gray-600 hover:text-black hover:bg-gray-100"
          }`}
        >
          <FlagIcon code={lang === "cn" ? "zh" : lang} size={22} />
          <span className="text-sm font-medium uppercase">{lang}</span>
        </button>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-16 pb-4">
        <div className="flex flex-col items-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fomo.png" alt="FOMO" className={`logo-image ${logoRevealed ? "revealed" : ""}`} />
          <div className={`logo-subtitle ${logoRevealed ? "revealed" : ""} ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            <span className={`font-semibold ${isDark ? "text-green-400" : "text-green-600"}`}>{t("termsite.name")}</span>
            {" · "}
            {t("termsite.tagline")}
          </div>
        </div>

        <div className={`welcome-text max-w-xl text-center mb-6 ${textVisible ? "visible" : ""}`}>
          <h1 className={`text-xl sm:text-2xl font-semibold mb-3 leading-snug ${isDark ? "text-gray-100" : "text-gray-900"}`}>{t("termsite.h1")}</h1>
          <p className={`text-base leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{t("termsite.welcome")}</p>
        </div>

        <div className={`login-block flex flex-col sm:flex-row gap-4 items-center ${loginVisible ? "visible" : ""}`}>
          <a
            href="/login"
            className={`min-w-[160px] text-center px-6 py-3 rounded-lg border-2 font-medium transition-all duration-300 ${
              isDark ? "border-gray-600 text-gray-200 hover:bg-gray-800 hover:text-white" : "border-gray-300 text-gray-800 hover:bg-gray-50"
            }`}
          >
            {t("auth.login")}
          </a>
          <a
            href="/register"
            className={`min-w-[160px] text-center px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
              isDark ? "bg-white text-black hover:bg-gray-200" : "bg-black text-white hover:bg-gray-800"
            }`}
          >
            {t("auth.signUp")}
          </a>
        </div>

        <div className={`continue-link mt-5 flex items-center gap-5 ${loginVisible ? "visible" : ""}`}>
          <a href="/terminal" className={link}>
            {t("termsite.try")}
          </a>
          <a href="/calendar" className={link}>
            {t("nav.calendar")}
          </a>
        </div>

        <ul className={`welcome-text mt-8 max-w-md space-y-2 text-sm leading-snug ${muted} ${textVisible ? "visible" : ""}`}>
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className={isDark ? "text-green-400" : "text-green-600"} aria-hidden="true">
                ✓
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {/* Downloads: Android / Windows (and macOS once a .dmg exists), the terminal's own files; hidden inside the apps themselves */}
        <div className={`download-block mt-8 ${loginVisible ? "visible" : ""}`}>
          <DownloadAppsBlock isDark={isDark} flavor="terminal" />
        </div>

        <p className={`mt-8 max-w-sm text-center text-xs leading-snug ${muted} welcome-text ${textVisible ? "visible" : ""}`}>{t("termsite.separate")}</p>
      </main>

      <footer className={`landing-footer w-full py-6 text-center text-xs ${loginVisible ? "visible" : ""} ${isDark ? "text-gray-500" : "text-gray-400"}`}>
        <div className="flex items-center justify-center gap-4 mb-1.5">
          <a href="/privacy" className="hover:underline">
            {t("common.footer.privacy")}
          </a>
          <a href="/terms" className="hover:underline">
            {t("common.landing.terms")}
          </a>
        </div>
        Copyright © Neurotrader 2026
      </footer>
    </div>
  );
}
