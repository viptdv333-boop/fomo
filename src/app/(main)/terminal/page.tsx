"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/client";
import {
  ALL_INSTRUMENTS,
  TERMINAL_DATA,
  adHocInstrument,
  findInstrument,
  instName,
  type ChartSource,
  type TerminalInstrument,
} from "@/lib/terminal-data";

const TradingChart = dynamic(() => import("@/components/chart/TradingChart"), {
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
  return adHocInstrument(/USDT$|USDC$/i.test(symbol) ? "bybit" : "moex", symbol);
}

export default function TerminalPage() {
  const { t } = useT();
  const [selected, setSelected] = useState<TerminalInstrument | null>(null);
  const [top, setTop] = useState(56);

  // the symbol comes from the URL, so a shared link opens the same chart
  useEffect(() => {
    setSelected(instrumentFromUrl());
  }, []);

  const onSelectSymbol = useCallback((inst: TerminalInstrument) => {
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
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white dark:bg-gray-900" style={{ top }}>
      {/* Screen-reader/crawler heading: the terminal is a full-bleed app shell, so a visible <h1> would break the layout. */}
      <h1 className="sr-only">{t("term2.heading")}</h1>
      {selected && (
        <TradingChart
          ticker={selected.dataTicker}
          source={selected.source}
          name={instName(selected, t)}
          onSelectSymbol={onSelectSymbol}
        />
      )}
    </div>
  );
}
