"use client";

import ThemeToggle from "@/components/layout/ThemeToggle";
import { FlagIcon } from "@/components/layout/FlagIcon";
import { useTheme } from "@/lib/theme";
import { useT } from "@/lib/i18n/client";
import { DownloadAppsBlock } from "@/components/shared/DownloadApps";
import TerminalHeroBackdrop from "./TerminalHeroBackdrop";
import { TERMINAL_FAQ_KEYS } from "@/lib/terminal-faq";
import "./terminal-landing.css";

// Landing page of the terminal site (terminal.fomo.spot, SITE_MODE=terminal). src/app/page.tsx picks it by the site mode; LandingPage
// (the main site) is untouched.
//   hero (full-bleed screenshot carousel / video behind the login block) -> «Что внутри» -> FAQ (the same keys feed the FAQPage
//   JSON-LD in page.tsx) -> final call to action + downloads -> legal links. The invitation to fomo.spot is NOT here: it lives inside the terminal.
// The terminal needs a login (no guest demo, no standalone calendar page): the only ways in are «Регистрация» and «Вход».
// No price / "free" wording and no comparison with other services (src/lib/terminal-compare.ts stays as data, it is not rendered).
// All text is plain markup in the server HTML: entrance animations are CSS keyframes (no timers toggling classes), the FAQ answers
// sit in <details> (in the DOM, closed). Light and dark themes use Tailwind `dark:` classes, so the server HTML is right for both;
// the hero is always dark (it sits on screenshots).

const IMG = "/landing/terminal";

function Shot({ src, w, h, alt, className = "", priority = false }: { src: string; w: number; h: number; alt: string; className?: string; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={w} height={h} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className={`tl-shot ${className}`} />
  );
}

export default function TerminalLanding() {
  const { theme } = useTheme();
  const { t, locale, setLocale } = useT();
  const lang = (locale === "en" || locale === "cn" ? locale : "ru") as "ru" | "en" | "cn";
  const isDark = theme === "dark";

  const card = "rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.04]";
  const h2 = "text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100";
  const body = "text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-300";
  const btnPrimary =
    "tl-btn min-w-[170px] text-center px-6 py-3 rounded-lg font-medium bg-green-500 text-white hover:bg-green-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
  const btnGhost =
    "tl-btn min-w-[170px] text-center px-6 py-3 rounded-lg border-2 border-white/40 text-white font-medium hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-[#0a0a0a] dark:text-gray-100" data-terminal-landing>
      <header className="fixed top-0 right-0 z-50 p-3 sm:p-4 flex items-center gap-1 sm:gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-black/45 backdrop-blur px-1.5 py-1 text-gray-100 [&_button]:!text-gray-100 [&_button:hover]:!bg-white/15">
          <button
            type="button"
            onClick={() => setLocale(lang === "ru" ? "en" : lang === "en" ? "cn" : "ru")}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors"
            aria-label="Language"
          >
            <FlagIcon code={lang === "cn" ? "zh" : lang} size={20} />
            <span className="text-sm font-medium uppercase">{lang}</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main>
        {/* ── hero ─────────────────────────────────────────────── */}
        <section className="tl-hero min-h-[100svh] flex flex-col" aria-labelledby="tl-h1">
          <TerminalHeroBackdrop />
          <div className="relative z-[1] flex-1 flex flex-col items-center justify-center px-4 pt-20 pb-16 text-center">
            <div className="tl-rise flex flex-col items-center" style={{ ["--tl-d" as string]: "0.05s" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/logo.webp`} alt="FOMO" width={480} height={203} className="w-[min(260px,62vw)] h-auto" />
              <div className="mt-1 text-[0.7rem] sm:text-sm tracking-[0.3em] uppercase text-gray-300">
                <span className="font-semibold text-green-400">{t("termsite.name")}</span>
                {" · "}
                {t("termsite.tagline")}
              </div>
            </div>

            <h1 id="tl-h1" className="tl-rise mt-6 max-w-2xl text-3xl sm:text-5xl font-semibold leading-tight tracking-tight" style={{ ["--tl-d" as string]: "0.2s" }}>
              {t("termsite.h1")}
            </h1>
            <p className="tl-rise mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-gray-200" style={{ ["--tl-d" as string]: "0.35s" }}>
              {t("termsite.welcome")}
            </p>
            <div className="tl-rise mt-7 flex flex-col sm:flex-row gap-3 sm:gap-4 items-center" style={{ ["--tl-d" as string]: "0.5s" }}>
              <a href="/register" className={btnPrimary}>
                {t("auth.signUp")}
              </a>
              <a href="/login" className={btnGhost}>
                {t("auth.login")}
              </a>
            </div>
          </div>
          <a href="#inside" className="relative z-[1] mx-auto mb-10 text-xs uppercase tracking-widest text-gray-300 hover:text-white transition-colors">
            {t("termsite.hero.scroll")} <span aria-hidden="true">↓</span>
          </a>
        </section>

        {/* ── what is inside ───────────────────────────────────── */}
        <section id="inside" className="scroll-mt-4 px-4 py-14 sm:py-20" aria-labelledby="tl-inside">
          <div className="mx-auto max-w-5xl">
            <h2 id="tl-inside" className={h2}>
              {t("termsite.inside.title")}
            </h2>
            <p className={`mt-3 max-w-2xl ${body}`}>{t("termsite.inside.lead")}</p>

            <div className="mt-10 space-y-14 sm:space-y-20">
              {/* charts */}
              <article className="grid md:grid-cols-2 gap-6 md:gap-10 items-center">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t("termsite.c1.t")}</h3>
                  <p className={`mt-3 ${body}`}>{t("termsite.c1.d")}</p>
                </div>
                <div className="grid gap-3">
                  <Shot src={`${IMG}/chart-1.webp`} w={1440} h={900} alt={t("termsite.c1.alt1")} className="w-full border border-gray-200 dark:border-white/10 shadow-lg" />
                  <Shot src={`${IMG}/chart-2.webp`} w={1440} h={900} alt={t("termsite.c1.alt2")} className="w-full border border-gray-200 dark:border-white/10 shadow-lg hidden sm:block" />
                </div>
              </article>

              {/* calendar */}
              <article className="grid md:grid-cols-2 gap-6 md:gap-10 items-center">
                <div className="md:order-2">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t("termsite.c2.t")}</h3>
                  <p className={`mt-3 ${body}`}>{t("termsite.c2.d")}</p>
                </div>
                <div className="md:order-1">
                  <Shot src={`${IMG}/calendar.webp`} w={1440} h={900} alt={t("termsite.c2.alt")} className="w-full border border-gray-200 dark:border-white/10 shadow-lg" />
                </div>
              </article>

              {/* alerts */}
              <article className="grid md:grid-cols-2 gap-6 md:gap-10 items-center">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t("termsite.c3.t")}</h3>
                  <p className={`mt-3 ${body}`}>{t("termsite.c3.d")}</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-[#16181d] dark:to-[#0d0f13] border border-gray-200 dark:border-white/10 p-6 sm:p-8">
                  <div className="mx-auto max-w-sm rounded-2xl bg-white dark:bg-[#1f2229] shadow-lg border border-gray-200 dark:border-white/10 p-4 flex gap-3 items-start">
                    <span className="h-10 w-10 shrink-0 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 flex items-center justify-center" aria-hidden="true">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t("termsite.c3.example")}</div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{t("termsite.c3.exTitle")}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">{t("termsite.c3.exText")}</div>
                    </div>
                  </div>
                </div>
              </article>

              {/* phone + desktop apps */}
              <article className="grid md:grid-cols-2 gap-6 md:gap-10 items-center">
                <div className="md:order-2">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t("termsite.c4.t")}</h3>
                  <p className={`mt-3 ${body}`}>{t("termsite.c4.d")}</p>
                </div>
                <div className="md:order-1 flex justify-center gap-4">
                  <Shot src={`${IMG}/mobile-chart.webp`} w={560} h={1212} alt={t("termsite.c4.alt1")} className="w-[44%] max-w-[230px] border border-gray-200 dark:border-white/10 shadow-lg" />
                  <Shot src={`${IMG}/mobile-indicators.webp`} w={560} h={1212} alt={t("termsite.c4.alt2")} className="w-[44%] max-w-[230px] border border-gray-200 dark:border-white/10 shadow-lg mt-6" />
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section className="px-4 py-14 sm:py-20" aria-labelledby="tl-faq">
          <div className="mx-auto max-w-3xl">
            <h2 id="tl-faq" className={h2}>
              {t("termsite.faq.title")}
            </h2>
            <div className="mt-8 space-y-3">
              {TERMINAL_FAQ_KEYS.map(({ q, a }) => (
                <details key={q} className={`tl-faq group ${card} px-4 sm:px-5 py-4`}>
                  <summary className="flex items-center justify-between gap-4 font-medium text-gray-900 dark:text-gray-100">
                    <h3 className="text-base font-medium">{t(q)}</h3>
                    <svg className="tl-chev w-5 h-5 shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" clipRule="evenodd" />
                    </svg>
                  </summary>
                  <p className={`mt-3 ${body}`}>{t(a)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── final call to action + downloads ─────────────────── */}
        <section className="border-t border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#0f0f0f] px-4 py-14 sm:py-20" aria-labelledby="tl-cta">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="tl-cta" className={h2}>
              {t("termsite.cta.title")}
            </h2>
            <p className={`mt-3 ${body}`}>{t("termsite.cta.text")}</p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:gap-4 items-center justify-center">
              <a href="/register" className="min-w-[170px] text-center px-6 py-3 rounded-lg font-medium bg-green-600 text-white hover:bg-green-500 transition-colors">
                {t("auth.signUp")}
              </a>
              <a
                href="/login"
                className="min-w-[170px] text-center px-6 py-3 rounded-lg border-2 border-gray-300 text-gray-800 font-medium hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors"
              >
                {t("auth.login")}
              </a>
            </div>
            {/* Downloads: Android / Windows (and macOS once a .dmg exists), the terminal's own files; hidden inside the apps themselves */}
            <div className="mt-10 min-h-[190px]">
              <DownloadAppsBlock isDark={isDark} flavor="terminal" />
            </div>

            <p className="mt-6 mx-auto max-w-sm text-xs leading-snug text-gray-500 dark:text-gray-400">{t("termsite.separate")}</p>
          </div>
        </section>
      </main>

      <footer className="w-full py-6 text-center text-xs text-gray-500 dark:text-gray-500 border-t border-gray-200 dark:border-white/10">
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
