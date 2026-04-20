"use client";

import { useEffect, useRef, useState } from "react";
import TickerBackground from "./TickerBackground";

export default function DesignPreviewPage() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="design-preview min-h-screen relative overflow-hidden bg-[#0a0a0a] text-gray-100">
      {/* ── Animated ticker/chart background ── */}
      <TickerBackground />

      {/* ── Foreground vignette so content pops ── */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(10,10,10,0.0) 0%, rgba(10,10,10,0.35) 55%, rgba(10,10,10,0.85) 100%)",
        }}
      />

      {/* ── Top bar ── */}
      <header className="relative z-10 flex items-center justify-between px-8 pt-6">
        <div className="font-headline text-sm tracking-[0.3em] uppercase text-gray-400">
          Est. 2026 · FOMO
        </div>
        <div className="text-xs tracking-widest text-gray-500 font-mono">
          PREVIEW · v0.1
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-20 pb-24 max-w-4xl mx-auto text-center">
        {/* Masthead rules (newspaper feel) */}
        <div className="w-full flex items-center gap-4 mb-8 opacity-70">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-500 to-gray-400" />
          <span className="font-body italic text-xs tracking-widest text-gray-400">
            FIND · OPPORTUNITIES · MAKE · OUTCOMES
          </span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-500 to-gray-400" />
        </div>

        {/* Masthead */}
        <h1
          className={`font-headline font-black leading-[0.95] tracking-tight transition-all duration-[1800ms] ease-out ${
            revealed ? "opacity-100 blur-0 translate-y-0" : "opacity-0 blur-xl translate-y-4"
          }`}
          style={{ fontSize: "clamp(4rem, 14vw, 10.5rem)" }}
        >
          FOMO
        </h1>

        <div className="my-6 flex items-center gap-3 text-[11px] tracking-[0.4em] uppercase text-gray-500">
          <span>Vol. MMXXVI</span>
          <span className="w-1 h-1 rounded-full bg-gray-600" />
          <span>Market Wire</span>
          <span className="w-1 h-1 rounded-full bg-gray-600" />
          <span>Daily Edition</span>
        </div>

        {/* Lede */}
        <p
          className={`font-body max-w-2xl text-lg md:text-xl leading-relaxed text-gray-300 transition-all duration-[1400ms] ease-out delay-500 ${
            revealed ? "opacity-100 blur-0" : "opacity-0 blur-sm"
          }`}
          style={{ fontStyle: "normal" }}
        >
          Платформа для публикации и обсуждения торговых идей. Читайте
          аналитику, делитесь прогнозами, <em className="italic text-gray-100">зарабатывайте на подписках.</em>
        </p>

        {/* Decorative fleuron */}
        <div className="my-10 text-gray-600 text-2xl font-body">❧</div>

        {/* Buttons */}
        <div
          className={`flex flex-col sm:flex-row gap-4 items-center transition-all duration-1000 delay-[900ms] ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <a
            href="#"
            className="group relative min-w-[180px] px-8 py-3.5 border border-gray-400/60 text-gray-100 font-body tracking-wide hover:border-gray-100 transition-all"
          >
            <span className="relative z-10 text-base">Войти</span>
            <span className="absolute inset-0 bg-gray-100 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
            <span className="absolute inset-0 flex items-center justify-center text-base text-black opacity-0 group-hover:opacity-100 transition-opacity delay-150">
              Войти
            </span>
          </a>
          <a
            href="#"
            className="min-w-[180px] px-8 py-3.5 bg-gray-100 text-black font-body tracking-wide hover:bg-white transition-all text-base"
          >
            Зарегистрироваться
          </a>
        </div>

        {/* Continue link */}
        <a
          href="#"
          className={`mt-6 font-body italic text-sm text-gray-500 hover:text-gray-200 underline underline-offset-4 decoration-gray-600 transition-all duration-1000 delay-[1100ms] ${
            revealed ? "opacity-100" : "opacity-0"
          }`}
        >
          Продолжить без регистрации
        </a>

        {/* Stats — newspaper column style */}
        <div
          className={`mt-16 grid grid-cols-3 gap-10 md:gap-20 w-full max-w-2xl transition-all duration-1000 delay-[1300ms] ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          {[
            { value: 4, label: "Участников" },
            { value: 10, label: "Идей" },
            { value: 30, label: "Инструментов" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center text-center">
              <div className="font-headline text-5xl md:text-6xl font-black leading-none">
                {s.value}
              </div>
              <div className="mt-3 h-px w-8 bg-gray-500/70" />
              <div className="mt-3 font-body italic text-xs md:text-sm text-gray-400 tracking-wide">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Sample card preview (to show newspaper serif in content) ── */}
      <section className="relative z-10 px-6 pb-24 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8 opacity-60">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="font-headline italic text-sm text-gray-400">Sample idea card</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>
        <article className="border border-gray-800 bg-[#0d0d0d]/60 backdrop-blur-sm p-6 md:p-8">
          <div className="flex items-center justify-between mb-4 font-mono text-xs tracking-widest text-gray-500 uppercase">
            <span>#SBER · MOEX</span>
            <span>Apr 20, 2026</span>
          </div>
          <h2 className="font-headline font-bold text-3xl md:text-4xl leading-tight mb-3">
            Сбербанк — возврат к сопротивлению,<br />
            возможна фиксация до уровня 305₽
          </h2>
          <p className="font-body text-base md:text-lg text-gray-300 leading-relaxed mb-5">
            Бумага <em className="italic">подошла к локальному максимуму</em> после уверенного роста на
            объёмах. На дневном таймфрейме видно формирование паттерна «двойная
            вершина» — логично ожидать технической коррекции в диапазон 298–302₽.
          </p>
          <div className="flex items-center gap-6 text-xs font-mono text-gray-500 tracking-wider uppercase">
            <span>By <span className="text-gray-200 not-italic">Neurotrader</span></span>
            <span>❤ 42</span>
            <span>✎ 8</span>
            <span className="ml-auto text-green-400">+3.8%</span>
          </div>
        </article>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 pb-8 text-center text-[11px] tracking-[0.3em] uppercase text-gray-600 font-body">
        Copyright © Neurotrader · MMXXVI
      </footer>

      {/* Fonts setup */}
      <style jsx global>{`
        .design-preview {
          font-family: "Crimson Pro", "Playfair Display", Georgia, serif;
        }
        .design-preview .font-headline {
          font-family: "Playfair Display", Georgia, serif;
          font-feature-settings: "liga", "kern";
        }
        .design-preview .font-body {
          font-family: "Crimson Pro", Georgia, serif;
        }
        .design-preview .font-mono {
          font-family: "IBM Plex Mono", ui-monospace, monospace;
        }
      `}</style>
    </div>
  );
}
