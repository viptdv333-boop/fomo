"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useT } from "@/lib/i18n/client";
import DemoGate from "@/components/shared/DemoGate";
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
import { isForexSymbol } from "@/lib/forex-meta";
import { autoToAsset, itemToInstrument, lookupSecid } from "@/lib/market-client";
import { usFutureBySymbol, usFutureItem } from "@/lib/us-futures";
import { hasAccountHint, openChannel, withTimeout, type Channel } from "@/lib/chart/account-sync";
import { KIND_LAST } from "@/lib/chart/sync-logic";

// MultiChart wraps the chart(s): one pane looks exactly like the plain TradingChart, the layout picker adds 2-4 linked panes
const TradingChart = dynamic(() => import("@/components/chart/MultiChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[var(--tv3-canvas)] animate-pulse" />,
});

const DEFAULT_INSTRUMENT: TerminalInstrument = TERMINAL_DATA[0].instruments[0];
const TICKER_RE = /^[A-Za-z0-9_.-]{1,24}$/;

const LAST_KEY = "fomo-terminal-last-v1";
const WATCHLIST_KEY = "fomo-terminal-watchlist-v1"; // the terminal's own list (RightPanel keeps it in sync with the account)

/** The last opened symbol follows the account (`terminal_last` / `default`, the newer of this device and the account wins). */
let lastChannel: Channel | null = null;
function getLastChannel(): Channel {
  if (!lastChannel) {
    lastChannel = openChannel({
      kind: KIND_LAST,
      key: "default",
      lsKey: LAST_KEY,
      current: () => {
        try {
          return localStorage.getItem(LAST_KEY) ?? "";
        } catch {
          return "";
        }
      },
      apply: () => {}, // the channel has already put the account copy into LAST_KEY; the page reads it from there
      isEmpty: (j) => !j,
      emptyJson: "",
    });
  }
  return lastChannel;
}

/** The symbol to open when the URL names none: the last one opened here, else the first of the watchlist (favorites). */
function storedSymbol(): { symbol: string; source: ChartSource } | null {
  const ok = (v: unknown): v is { source: ChartSource; dataTicker: string } => {
    const o = v as { source?: unknown; dataTicker?: unknown } | null;
    return !!o && (o.source === "moex" || o.source === "bybit" || o.source === "fmp" || o.source === "forex") && typeof o.dataTicker === "string" && TICKER_RE.test(o.dataTicker);
  };
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
    if (ok(last)) return { symbol: last.dataTicker, source: last.source };
  } catch {}
  try {
    const list = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    if (Array.isArray(list) && ok(list[0])) return { symbol: list[0].dataTicker, source: list[0].source };
  } catch {}
  return null;
}

/** ?symbol=SBER&source=moex -> instrument (curated list first, otherwise an ad-hoc symbol). Without a symbol: last opened / first favorite / SBER. */
function instrumentFromUrl(): TerminalInstrument {
  const sp = new URLSearchParams(window.location.search);
  let symbol = sp.get("symbol")?.trim();
  let src = sp.get("source");
  if (!symbol) {
    const stored = storedSymbol();
    if (stored) {
      symbol = stored.symbol;
      src = stored.source;
    }
  }
  if (!symbol || !TICKER_RE.test(symbol)) return DEFAULT_INSTRUMENT;
  const source: ChartSource | null = src === "moex" || src === "bybit" || src === "fmp" || src === "forex" ? src : null;
  if (source) {
    // a US future (CLUSD, GCUSD ...) opens with its root ticker, name and artwork, like a pick from the search
    const us = source === "fmp" ? usFutureBySymbol(symbol) : undefined;
    return findInstrument(source, symbol) ?? (us ? itemToInstrument(usFutureItem(us), us.icon) : adHocInstrument(source, symbol));
  }
  // no source given: take the curated instrument with that ticker, or guess Bybit for USDT pairs
  const known = ALL_INSTRUMENTS.find((i) => i.ticker.toLowerCase() === symbol.toLowerCase());
  if (known) return known;
  if (isForexSymbol(symbol)) return adHocInstrument("forex", symbol.toUpperCase());
  return adHocInstrument(/USDT$|USDC$|\.[PI]$|-\d{1,2}[A-Z]{3}\d{2}$/i.test(symbol) ? "bybit" : "moex", symbol);
}

export default function TerminalPage() {
  const { t } = useT();
  const [selected, setSelected] = useState<TerminalInstrument | null>(null);
  const [top, setTop] = useState(56);

  // the symbol comes from the URL, so a shared link opens the same chart
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // no symbol in the URL: the account may know a newer last symbol than this device (PC <-> phone). Waiting is short and only
      // when it can matter: nothing is stored here yet, or this browser is known to be signed in.
      if (!new URLSearchParams(window.location.search).get("symbol")) {
        const ch = getLastChannel();
        let hasLocal = false;
        try {
          hasLocal = !!localStorage.getItem(LAST_KEY);
        } catch {}
        if (!hasLocal || hasAccountHint()) await withTimeout(ch.start(), 700);
        else void ch.start();
        if (cancelled) return;
      }
      const inst = instrumentFromUrl();
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
    getLastChannel().changed(JSON.stringify({ source: inst.source, dataTicker: inst.dataTicker }));
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
    <div className="tv3 fixed inset-x-0 bottom-[var(--app-bottom-inset,0px)] z-40 bg-[var(--tv3-canvas)]" style={{ top }}>
      {/* Screen-reader/crawler heading: the terminal is a full-bleed app shell, so a visible <h1> would break the layout. */}
      <h1 className="sr-only">{t("term2.heading")}</h1>
      {/* a guest uses the terminal freely for a limited daily demo time, then sees the blurred teaser with the sign-in card */}
      <DemoGate kind="terminal" path="/terminal">
        {selected && (
          <TradingChart
            ticker={selected.dataTicker}
            source={selected.source}
            name={instName(selected, t)}
            onSelectSymbol={onSelectSymbol}
          />
        )}
      </DemoGate>
    </div>
  );
}
