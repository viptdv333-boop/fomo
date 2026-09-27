"use client";

import { useEffect, useRef, useState } from "react";
import { KLineChartPro, loadLocales } from "@klinecharts/pro";
import type { SymbolInfo, Period } from "@klinecharts/pro";
import "@klinecharts/pro/dist/klinecharts-pro.css";

import { MoexDatafeed } from "@/lib/kline-datafeed";
import { ruLocale } from "@/lib/kline-locale-ru";
import { useT } from "@/lib/i18n/client";

export type DataSource = "moex" | "fmp" | "bybit" | "none";

interface Props {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

// Register Russian locale once
let localeRegistered = false;
function ensureRuLocale() {
  if (!localeRegistered) {
    loadLocales("ru", ruLocale);
    localeRegistered = true;
  }
}

// Per-source datafeed instances
const datafeedCache = new Map<string, MoexDatafeed>();
function getDatafeed(source: string = "moex"): MoexDatafeed {
  if (!datafeedCache.has(source)) datafeedCache.set(source, new MoexDatafeed(source));
  return datafeedCache.get(source)!;
}

function buildPeriods(t: (key: string) => string): Period[] {
  return [
    { multiplier: 1, timespan: "minute", text: t("inst.period.1m") },
    { multiplier: 5, timespan: "minute", text: t("inst.period.5m") },
    { multiplier: 15, timespan: "minute", text: t("inst.period.15m") },
    { multiplier: 1, timespan: "hour", text: t("inst.period.1h") },
    { multiplier: 4, timespan: "hour", text: t("inst.period.4h") },
    { multiplier: 1, timespan: "day", text: t("inst.period.D") },
    { multiplier: 1, timespan: "week", text: t("inst.period.W") },
    { multiplier: 1, timespan: "month", text: t("inst.period.M") },
  ];
}

// KLineChart Pro ships en-US and zh-CN; ru is registered from our own locale file.
const KLINE_LOCALES: Record<string, string> = { ru: "ru", en: "en-US", cn: "zh-CN" };

export default function KlineChartWidget({ ticker, source, name, height }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartProRef = useRef<KLineChartPro | null>(null);
  const [ready, setReady] = useState(false);
  const { t, locale } = useT();

  // Init KlineChart Pro
  useEffect(() => {
    if (!containerRef.current) return;
    ensureRuLocale();

    const dark = document.documentElement.classList.contains("dark");

    const symbol: SymbolInfo = {
      ticker: ticker,
      name: name || ticker,
      shortName: ticker,
      exchange: source === "moex" ? "MOEX" : source === "fmp" ? "FMP" : source.toUpperCase(),
      market: source,
      pricePrecision: source === "fmp" ? 2 : 2,
      volumePrecision: 0,
      priceCurrency: source === "moex" ? "rub" : "usd",
      type: "stock",
    };

    const chartPro = new KLineChartPro({
      container: containerRef.current,
      symbol,
      period: { multiplier: 1, timespan: "day", text: t("inst.period.D") },
      periods: buildPeriods(t),
      datafeed: getDatafeed(source),
      theme: dark ? "dark" : "light",
      locale: KLINE_LOCALES[locale] || "ru",
      timezone: "Europe/Moscow",
      drawingBarVisible: true,
      mainIndicators: ["MA"],
      subIndicators: ["VOL"],
      styles: {
        candle: {
          priceMark: {
            last: {
              show: true,
              upColor: "#22c55e",
              downColor: "#ef4444",
              noChangeColor: "#888",
            },
          },
          bar: {
            upColor: "#22c55e",
            downColor: "#ef4444",
            noChangeColor: "#888",
            upBorderColor: "#22c55e",
            downBorderColor: "#ef4444",
            noChangeBorderColor: "#888",
            upWickColor: "#22c55e",
            downWickColor: "#ef4444",
            noChangeWickColor: "#888",
          },
        },
      },
    });

    chartProRef.current = chartPro;
    setReady(true);

    return () => {
      chartProRef.current = null;
    };
  }, []); // eslint-disable-line

  // Update symbol when ticker changes
  useEffect(() => {
    if (!ready || !chartProRef.current) return;
    const chart = chartProRef.current;
    const currentSymbol = chart.getSymbol();
    if (currentSymbol.ticker !== ticker) {
      chart.setSymbol({
        ticker: ticker,
        name: name || ticker,
        shortName: ticker,
        exchange: "MOEX",
        market: "moex",
        pricePrecision: 2,
        volumePrecision: 0,
        priceCurrency: "rub",
        type: "stock",
      });
    }
  }, [ticker, name, ready]);

  // Update theme on dark mode change
  useEffect(() => {
    if (!ready || !chartProRef.current) return;
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      chartProRef.current?.setTheme(dark ? "dark" : "light");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div
      ref={containerRef}
      className="klinecharts-pro-container"
      style={{
        width: "100%",
        height: height && height > 0 ? height : "100%",
      }}
    />
  );
}
