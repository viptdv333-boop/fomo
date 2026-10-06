"use client";

import ThemeToggle from "@/components/layout/ThemeToggle";
import { FlagIcon } from "@/components/layout/FlagIcon";
import { useTheme } from "@/lib/theme";
import { useT } from "@/lib/i18n/client";
import { DownloadAppsBlock } from "@/components/shared/DownloadApps";
import TerminalHeroBackdrop from "./TerminalHeroBackdrop";
import { checkedAt, checkedLabel, compareSource, fomoTerminal, tradingViewPlans } from "@/lib/terminal-compare";
import { TERMINAL_FAQ_KEYS } from "@/lib/terminal-faq";
import "./terminal-landing.css";

// Landing page of the terminal site (terminal.fomo.spot, SITE_MODE=terminal). src/app/page.tsx picks it by the site mode; LandingPage
// (the main site) is untouched.
//   hero (full-bleed screenshot carousel / video behind the login block) -> "free" strip -> «Что внутри» -> comparison
//   -> FAQ (the same keys feed the FAQPage JSON-LD in page.tsx) -> downloads + final call to action -> legal links.
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

function Check() {
  return (
    <svg className="w-4 h-4 shrink-0 mt-0.5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
    </svg>
  );
}

export default function TerminalLanding() {
  const { theme } = useTheme();
  const { t, locale, setLocale } = useT();
  const lang = (locale === "en" || locale === "cn" ? locale : "ru") as "ru" | "en" | "cn";
  const isDark = theme === "dark";

  const heroLink = "text-sm underline underline-offset-4 text-gray-200 hover:text-white transition-colors";
  const card = "rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.04]";
  const h2 = "text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100";
  const body = "text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-300";
  const btnPrimary =
    "tl-btn min-w-[170px] text-center px-6 py-3 rounded-lg font-medium bg-green-500 text-white hover:bg-green-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
  const btnGhost =
    "tl-btn min-w-[170px] text-center px-6 py-3 rounded-lg border-2 border-white/40 text-white font-medium hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  const freeItems = [1, 2, 3].map((n) => ({ t: t(`termsite.free.t${n}`), d: t(`termsite.free.d${n}`) }));
  const cmpWhen = checkedLabel(lang, checkedAt);

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
            <p className="tl-rise mt-4 inline-flex items-center gap-2 rounded-full border border-green-400/40 bg-green-500/15 px-4 py-1.5 text-sm font-medium text-green-300" style={{ ["--tl-d" as string]: "0.5s" }}>
              <span className="h-2 w-2 rounded-full bg-green-400" aria-hidden="true" />
              {t("termsite.hero.free")}
            </p>

            <div className="tl-rise mt-7 flex flex-col sm:flex-row gap-3 sm:gap-4 items-center" style={{ ["--tl-d" as string]: "0.65s" }}>
              <a href="/register" className={btnPrimary}>
                {t("auth.signUp")}
              </a>
              <a href="/login" className={btnGhost}>
                {t("auth.login")}
              </a>
            </div>

            <div className="tl-rise mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2" style={{ ["--tl-d" as string]: "0.8s" }}>
              <a href="/terminal" className={heroLink}>
                {t("termsite.try")}
              </a>
              <a href="/calendar" className={heroLink}>
                {t("nav.calendar")}
              </a>
            </div>
          </div>
          <a href="#inside" className="relative z-[1] mx-auto mb-10 text-xs uppercase tracking-widest text-gray-300 hover:text-white transition-colors">
            {t("termsite.hero.scroll")} <span aria-hidden="true">↓</span>
          </a>
        </section>

        {/* ── free strip ───────────────────────────────────────── */}
        <section className="border-b border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#0f0f0f]" aria-labelledby="tl-free">
          <h2 id="tl-free" className="sr-only">
            {t("termsite.hero.free")}
          </h2>
          <ul className="mx-auto max-w-5xl grid gap-4 sm:grid-cols-3 px-4 py-8 sm:py-10">
            {freeItems.map((it) => (
              <li key={it.t} className={`${card} p-5`}>
                <div className="flex items-start gap-2">
                  <Check />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{it.t}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{it.d}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
                  <a href="/calendar" className="mt-4 inline-block text-sm font-medium text-green-700 dark:text-green-400 underline underline-offset-4">
                    {t("nav.calendar")}
                  </a>
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

        {/* ── comparison ───────────────────────────────────────── */}
        <section className="border-y border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#0f0f0f] px-4 py-14 sm:py-20" aria-labelledby="tl-cmp">
          <div className="mx-auto max-w-4xl">
            <h2 id="tl-cmp" className={h2}>
              {t("termsite.cmp.title")}
            </h2>
            <p className={`mt-3 max-w-2xl ${body}`}>{t("termsite.cmp.lead", { when: cmpWhen })}</p>

            <div className={`mt-8 overflow-x-auto ${card}`}>
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400">
                    <th scope="col" className="px-3 sm:px-4 py-3 font-medium">{t("termsite.cmp.col.plan")}</th>
                    <th scope="col" className="px-2 sm:px-4 py-3 font-medium">{t("termsite.cmp.col.ind")}</th>
                    <th scope="col" className="px-2 sm:px-4 py-3 font-medium">{t("termsite.cmp.col.charts")}</th>
                    <th scope="col" className="px-2 sm:px-4 py-3 font-medium">{t("termsite.cmp.col.alerts")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-green-500/10 border-b border-gray-200 dark:border-white/10">
                    <th scope="row" className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                      FOMO Terminal
                      <span className="block text-[11px] font-medium text-green-700 dark:text-green-400">{t("termsite.cmp.free")}</span>
                    </th>
                    <td className="px-2 sm:px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t("termsite.cmp.noLimit")}</td>
                    <td className="px-2 sm:px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t("termsite.cmp.upTo", { n: fomoTerminal.chartsPerTab })}</td>
                    <td className="px-2 sm:px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t("termsite.cmp.upTo", { n: fomoTerminal.activePriceAlerts })}</td>
                  </tr>
                  {tradingViewPlans.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300">
                      <th scope="row" className="px-3 sm:px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {compareSource.service} {r.plan}
                        <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400">{t(r.kind === "free" ? "termsite.cmp.freePlan" : "termsite.cmp.paid")}</span>
                      </th>
                      <td className="px-2 sm:px-4 py-3">{r.indicatorsPerChart}</td>
                      <td className="px-2 sm:px-4 py-3">{r.chartsPerTab}</td>
                      <td className="px-2 sm:px-4 py-3">{r.activePriceAlerts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {t("termsite.cmp.note")}{" "}
              {t("termsite.cmp.source")}:{" "}
              <a href={compareSource.url} target="_blank" rel="noopener nofollow" className="underline underline-offset-2">
                {compareSource.label}
              </a>
              , {cmpWhen}.
            </p>
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
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <a href="/terminal" className="underline underline-offset-4 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t("termsite.try")}
              </a>
              <a href="/calendar" className="underline underline-offset-4 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t("nav.calendar")}
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
