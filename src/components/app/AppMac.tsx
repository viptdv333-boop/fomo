"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import type { AppChip } from "@/components/chart/app-bridge";
import InstIcon from "@/components/chart/InstIcon";
import MacSvg from "@/components/chart/MacSvg";
import { instName, type TerminalInstrument } from "@/lib/terminal-data";
import { APP_TABS, appTabHref } from "@/lib/app-ui";
import { MAC_CHIP_COLORS, macTitle, MAC_QUICK, MAC_ROW_ICONS, MAC_TABS, macGradFor, macIconKey, macTone, sparkPath, type MacGlyphDef, type MacTabId } from "@/lib/app-mac";
import { hostNavigate } from "./tabhost/store";
import { useTheme } from "@/lib/theme";

/* Pieces of the phone version of the macOS look (design "FOMO Terminal Mobile"); AppTerminal.tsx wires them to the chart. Styles: app-mac.css. */

export function G({ g, size, alpha, width }: { g: MacGlyphDef; size: number; alpha?: string; width?: number }) {
  return <MacSvg d={g.d} fl={g.fl} light={g.light} stroke={g.stroke} size={size} alpha={alpha} width={width} />;
}

/** The round instrument icon: the design's glyph on its gradient when it has one for the ticker, else a gradient with the instrument's own artwork / letters. */
export function MacInstIcon({ inst, size }: { inst: TerminalInstrument; size: number }) {
  const key = macIconKey(inst.ticker);
  const ic = key ? MAC_ROW_ICONS[key] : null;
  const [c1, c2] = ic ? [ic.c1, ic.c2] : macGradFor(inst.ticker);
  return (
    <span className="app-mac-ico" data-art={!ic && (inst.emoji || inst.source === "forex") ? "1" : undefined} style={{ width: size, height: size, background: `linear-gradient(135deg,${c1},${c2})`, boxShadow: `0 3px 8px ${c2}55` }} aria-hidden="true">
      {ic ? (
        <svg viewBox="0 0 24 24" width={size * 0.52} height={size * 0.52} fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          {ic.fl && <path d={ic.fl} fill="rgba(255,255,255,.34)" stroke="none" />}
          <path d={ic.d} />
        </svg>
      ) : inst.emoji || inst.source === "forex" ? (
        <span className="app-mac-ico-art">
          <InstIcon inst={inst} size={Math.round(size * 0.82)} />
        </span>
      ) : (
        <b style={{ fontSize: size * 0.34 }}>{inst.ticker.slice(0, 2).toUpperCase()}</b>
      )}
    </span>
  );
}

export function MacHeader({
  inst,
  price,
  pct,
  tone,
  tfLabel,
  delayed,
  onSearch,
}: {
  inst: TerminalInstrument | null;
  price: string;
  pct: string;
  tone: "up" | "down" | null;
  tfLabel: string;
  delayed: boolean;
  onSearch: () => void;
}) {
  const { t } = useT();
  const c = macTone(tone);
  return (
    <div className="app-mac-head">
      <button type="button" className="app-mac-head-l" onClick={onSearch} aria-label={t("appui.term.pickTicker")}>
        {inst && <MacInstIcon inst={inst} size={46} />}
        <span className="app-mac-head-t">
          <b>{inst ? macTitle(inst.ticker, instName(inst, t)) : "—"}</b>
          <small>
            {inst ? [exchange(inst.source), inst.dataTicker, tfLabel].filter(Boolean).join(" · ") : ""}
            {delayed ? ` · ${t("mac.m.delayed")}` : ""}
          </small>
        </span>
      </button>
      <div className="app-mac-head-r">
        <div className="app-mac-px">{price}</div>
        <span className="app-mac-pill" style={{ background: c.bg, color: c.fg }}>
          {pct}
        </span>
      </div>
    </div>
  );
}

function exchange(source: string): string {
  return source === "moex" ? "MOEX" : source === "bybit" ? "Bybit" : source === "fmp" ? "FMP" : source === "forex" ? "Forex" : source === "databento" ? "Databento" : source === "twelvedata" ? "Twelve Data" : "";
}

export function MacChips({ chips, onOpen }: { chips: AppChip[]; onOpen: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="app-mac-chips">
      {chips.map((c, i) => (
        <button key={c.uid} type="button" className="app-mac-chip" data-off={c.visible ? undefined : "1"} onClick={onOpen}>
          <span style={{ background: c.color || MAC_CHIP_COLORS[i % MAC_CHIP_COLORS.length] }} />
          {c.title}
        </button>
      ))}
    </div>
  );
}

export function MacQuick({ windows, onCompare, onIndicators, onWindow, onSettings, onAlerts, onList, onTools }: { windows: { count: number } | null; onCompare: () => void; onIndicators: () => void; onWindow: () => void; onSettings: () => void; onAlerts: () => void; onList: () => void; onTools: () => void }) {
  const { t } = useT();
  const item = (id: string, g: MacGlyphDef & { key: string }, run: () => void, badge?: number) => (
    <button key={id} type="button" className="app-mac-q" onClick={run} data-q={id}>
      <G g={g} size={34} />
      <span>{t(g.key)}</span>
      {badge ? <i>{badge}</i> : null}
    </button>
  );
  return (
    <div className="app-mac-quick">
      {item("compare", MAC_QUICK.compare, onCompare)}
      {item("indicators", MAC_QUICK.indicators, onIndicators)}
      {windows ? item("window", MAC_QUICK.window, onWindow, windows.count) : item("settings", MAC_QUICK.settings, onSettings)}
      {item("alerts", MAC_QUICK.alerts, onAlerts)}
      {item("list", MAC_TABS[1], onList)}
      {item("tools", MAC_TABS[2], onTools)}
    </div>
  );
}

export function MacTabBar({ active, locale, onPick }: { active: MacTabId; locale: "ru" | "en" | "cn"; onPick: (id: MacTabId) => void }) {
  const { t } = useT();
  const me = APP_TABS.find((x) => x.id === "me");
  return (
    <nav className="app-mac-bar" aria-label={t("mac.m.nav")} data-app-mac-bar>
      {MAC_TABS.map((tab) => {
        const on = tab.id === active;
        const inner = (
          <>
            <span className="app-mac-bar-p" style={{ background: on ? `${tab.stroke}26` : "transparent" }}>
              <MacSvg d={tab.d} fl={tab.fl} light={tab.light} stroke={tab.stroke} size={32} alpha={on ? "88" : "55"} width={1.8} />
            </span>
            <span className="app-mac-bar-l" data-on={on ? "1" : undefined}>
              {t(tab.key)}
            </span>
          </>
        );
        if (tab.id === "profile" && me) {
          const href = appTabHref(locale, me);
          return (
            <Link
              key={tab.id}
              href={href}
              prefetch={false}
              className="app-mac-bar-t"
              data-mt={tab.id}
              onClick={(e) => {
                if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && hostNavigate(href)) e.preventDefault();
              }}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button key={tab.id} type="button" className="app-mac-bar-t" data-mt={tab.id} aria-current={on ? "page" : undefined} onClick={() => onPick(tab.id)}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

/** «⋯» button next to the timeframes: the actions that have no place of their own in the design (watchlist star, chart settings, the other sections, the way back to the classic look). */
export function MacMenu({ inList, onFav, onSettings, onClassic, locale }: { inList: boolean; onFav: () => void; onSettings: () => void; onClassic: () => void; locale: "ru" | "en" | "cn" }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const row = (key: string, label: ReactNode, run: () => void, tip?: string) => (
    <button key={key} type="button" role="menuitem" className="app-mac-mi" title={tip} onClick={() => { setOpen(false); run(); }}>
      {label}
    </button>
  );
  return (
    <div className="app-mac-menu" ref={ref}>
      <button type="button" className="app-mac-more" aria-haspopup="menu" aria-expanded={open} aria-label={t("mac.m.menu")} title={t("mac.m.menu")} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="app-mac-pop" role="menu">
          {row("fav", t(inList ? "appui.term.unfav" : "appui.term.fav"), onFav)}
          {row("set", t("mac.lbl.settings"), onSettings)}
          {row("theme", theme === "light" ? t("common.theme.dark") : t("common.theme.light"), toggleTheme)}
          <div className="app-mac-sep" />
          {APP_TABS.filter((x) => x.id !== "terminal" && x.id !== "settings" && x.id !== "me").map((tab) => {
            const href = appTabHref(locale, tab);
            return (
              <Link
                key={tab.id}
                href={href}
                prefetch={false}
                role="menuitem"
                className="app-mac-mi"
                onClick={(e) => {
                  setOpen(false);
                  if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && hostNavigate(href)) e.preventDefault();
                }}
              >
                {t(tab.labelKey)}
              </Link>
            );
          })}
          <div className="app-mac-sep" />
          {row("classic", t("mac.classic"), onClassic, t("mac.classicTip"))}
        </div>
      )}
    </div>
  );
}

export function MacSpark({ values, line }: { values: number[] | undefined; line: string }) {
  const d = sparkPath(values);
  return (
    <svg viewBox="0 0 60 24" width="56" height="24" preserveAspectRatio="none" className="app-mac-spark" aria-hidden="true">
      {d && <path d={d} fill="none" stroke={line} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
