"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";
import {
  ALL_INSTRUMENTS,
  TERMINAL_DATA,
  adHocInstrument,
  findInstrument,
  instName,
  rememberInstrument,
  type ChartSource,
  type TerminalInstrument,
} from "@/lib/terminal-data";
import "@/components/chart/terminal-v3.css";
import { autoToAsset, itemToInstrument, lookupSecid } from "@/lib/market-client";

// MultiChart wraps the chart(s): one pane looks exactly like the plain TradingChart, the layout picker adds 2-4 linked panes
const TradingChart = dynamic(() => import("@/components/chart/MultiChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 dark:bg-gray-900 animate-pulse" />,
});

const DEFAULT_INSTRUMENT: TerminalInstrument = TERMINAL_DATA[0].instruments[0];
const TICKER_RE = /^[A-Za-z0-9_.-]{1,24}$/;

/** ?symbol=SBER&source=moex -> instrument (curated list first, otherwise an ad-hoc symbol). */
function instrumentFromUrl(): TerminalInstrument {
  const sp = new URLSearchParams(window.location.search);
  const symbol = sp.get("symbol")?.trim();
  if (!symbol || !TICKER_RE.test(symbol)) return DEFAULT_INSTRUMENT;
  const src = sp.get("source");
  const source: ChartSource | null = src === "moex" || src === "bybit" || src === "fmp" ? src : null;
  if (source) return findInstrument(source, symbol) ?? adHocInstrument(source, symbol);
  // no source given: take the curated instrument with that ticker, or guess Bybit for USDT pairs
  const known = ALL_INSTRUMENTS.find((i) => i.ticker.toLowerCase() === symbol.toLowerCase());
  if (known) return known;
  return adHocInstrument(/USDT$|USDC$|\.[PI]$|-\d{1,2}[A-Z]{3}\d{2}$/i.test(symbol) ? "bybit" : "moex", symbol);
}

export default function TerminalPage() {
  const { t, locale: lang } = useT();
  const locale = lang as Locale;
  const { status } = useSession();
  const locked = status === "unauthenticated";
  const [selected, setSelected] = useState<TerminalInstrument | null>(null);
  const [top, setTop] = useState(56);

  // the symbol comes from the URL, so a shared link opens the same chart
  useEffect(() => {
    let cancelled = false;
    const inst = instrumentFromUrl();
    (async () => {
      // an id outside the curated list (an exact futures contract MXZ6, IMOEXF, a bond, a fund ...): ask the exchange search for
      // its proper name / group / unit once, before the chart loads (never longer than 2.5 s)
      if (inst.source === "moex" && !inst.emoji && !findInstrument("moex", inst.dataTicker)) {
        const item = await Promise.race([lookupSecid(inst.dataTicker), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
        if (item && !cancelled) {
          const parent = item.asset ? ALL_INSTRUMENTS.find((i) => i.source === "moex" && i.group === undefined && (i.dataTicker === item.asset || autoToAsset(i.dataTicker) === item.asset)) : undefined;
          const found = itemToInstrument(item, parent?.emoji ?? "");
          if (!cancelled) setSelected(found);
          return;
        }
      }
      if (!cancelled) setSelected(inst);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSelectSymbol = useCallback((inst: TerminalInstrument) => {
    rememberInstrument(inst);
    setSelected(inst);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("symbol", inst.dataTicker);
      url.searchParams.set("source", inst.source);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }, []);

  // The terminal is edge to edge: a fixed layer from the bottom of the site header (and any banners) to the
  // bottom of the viewport, which also covers the footer on this route.
  useLayoutEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const measure = () => setTop(Math.max(0, Math.round(main.getBoundingClientRect().top)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="tv3 fixed inset-x-0 bottom-0 z-40 bg-[var(--tv3-canvas)]" style={{ top }}>
      {/* Screen-reader/crawler heading: the terminal is a full-bleed app shell, so a visible <h1> would break the layout. */}
      <h1 className="sr-only">{t("term2.heading")}</h1>
      {selected && (
        <div
          className={`w-full h-full ${locked ? "blur-[6px] pointer-events-none select-none" : ""}`}
          // a guest sees the terminal only as a teaser: nothing in it can be focused or used
          {...(locked ? { inert: true, "aria-hidden": true } : {})}
        >
          <TradingChart
            ticker={selected.dataTicker}
            source={selected.source}
            name={instName(selected, t)}
            onSelectSymbol={onSelectSymbol}
          />
        </div>
      )}
      {locked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/20">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6 text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-green-600/10 text-green-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 118 0v3" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t("tg.lockTitle")}</h2>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{t("tg.lockText")}</p>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href={`${localizedPath(locale, "/login")}?callbackUrl=${encodeURIComponent(localizedPath(locale, "/terminal"))}`}
                className="h-10 inline-flex items-center justify-center rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                {t("tg.login")}
              </Link>
              <Link
                href={`${localizedPath(locale, "/register")}?callbackUrl=${encodeURIComponent(localizedPath(locale, "/terminal"))}`}
                className="h-10 inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {t("tg.register")}
              </Link>
            </div>
            <Link href={localizedPath(locale, "/terminal/features")} className="mt-4 inline-block text-xs text-green-600 hover:underline">
              {t("tf.more")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
