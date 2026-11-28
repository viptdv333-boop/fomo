"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PopupPortal } from "./ModalPortal";
import { useT } from "@/lib/i18n/client";
import { CS_ICONS } from "./icons-cs";
import type { ScaleMode } from "@/lib/chart/types";
import type { ChartSettingsApi } from "./useChartSettings";

interface Props {
  /** Screen coordinates; anchor positions the menu above the scale gear, otherwise at the cursor. */
  pos: { x: number; y: number; anchor?: boolean } | null;
  paneId: string;
  onClose: () => void;
  api: ChartSettingsApi;
  autoScale: boolean;
  onAuto: (auto: boolean) => void;
  onSettings: () => void;
}

function Item({ checked, radio, onClick, children }: { checked?: boolean; radio?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="w-full min-h-8 px-3 flex items-center gap-2 text-[13px] text-left whitespace-nowrap cursor-pointer text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)]">
      <span className="w-4 h-4 shrink-0 inline-flex items-center justify-center text-[var(--tv3-accent)]">
        {checked ? radio ? <span className="w-1.5 h-1.5 rounded-full bg-[var(--tv3-accent)]" /> : CS_ICONS.check : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Submenu({ title, open, onClick, children }: { title: string; open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <>
      <button type="button" role="menuitem" aria-expanded={open} onClick={onClick} className="w-full h-8 px-3 flex items-center gap-2 text-[13px] text-left whitespace-nowrap cursor-pointer text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)]">
        <span className="w-4 shrink-0" />
        <span className="flex-1">{title}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
      </button>
      {open && <div className="border-y border-[var(--tv3-hair)] bg-[var(--tv3-fill)]/40 py-1">{children}</div>}
    </>
  );
}

const Sep = () => <div className="my-1 h-px bg-[var(--tv3-hair)]" />;

/** TradingView-style context menu opened from the control under the price scale. */
export default function PriceScaleMenu({ pos, paneId, onClose, api, autoScale, onAuto, onSettings }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [submenu, setSubmenu] = useState<"labels" | "lines" | null>(null);
  const sc = api.settings.scale;

  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const requestedLeft = pos.anchor ? pos.x - r.width : pos.x;
    const requestedTop = pos.anchor ? pos.y - r.height : pos.y;
    setAt({ left: Math.max(4, Math.min(requestedLeft, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(requestedTop, window.innerHeight - r.height - 4)) });
  }, [pos, submenu]);

  useEffect(() => {
    if (!pos) return;
    setSubmenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [pos, onClose]);

  if (!pos) return null;
  const setScale = <K extends keyof typeof sc>(k: K, v: (typeof sc)[K]) => api.update((x) => ({ ...x, scale: { ...x.scale, [k]: v } }));
  const isMainPane = paneId === "main";
  const selectedMode = isMainPane ? sc.mode : sc.indicatorMode;
  const modes: ScaleMode[] = isMainPane ? ["regular", "percent", "indexed", "log"] : ["regular", "log"];
  const setMode = (mode: ScaleMode) => api.update((x) => ({
    ...x,
    scale: isMainPane ? { ...x.scale, mode } : { ...x.scale, indicatorMode: mode as "regular" | "log" },
  }));
  const toggle = (key: "symbolLabel" | "lastPriceLabel" | "countdown" | "highLow" | "tagCaptions" | "priceLine" | "prevCloseLine") => {
    setScale(key, !sc[key]);
  };

  return (
    <PopupPortal>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        role="menu"
        aria-label={t("cs.scaleMenuTitle")}
        className="fixed z-[61] w-[300px] max-h-[min(78vh,680px)] overflow-y-auto py-1 rounded-xl tv3-pop shadow-[var(--tv3-shadow-pop)] [scrollbar-width:thin]"
        style={{ left: at?.left ?? pos.x, top: at?.top ?? pos.y, visibility: at ? "visible" : "hidden" }}
      >
        <Item onClick={() => { onAuto(true); onClose(); }}>{t("cs.resetScale")}</Item>
        <Sep />
        <Item checked={autoScale} onClick={() => { onAuto(!autoScale); onClose(); }}>{t("cs.autoScale")}</Item>
        <Item checked={sc.lock} onClick={() => { setScale("lock", !sc.lock); onClose(); }}>{t("cs.lockScale")}</Item>
        {isMainPane && <Item checked={sc.ignoreIndicators} onClick={() => { setScale("ignoreIndicators", !sc.ignoreIndicators); onClose(); }}>{t("cs.ignoreIndicators")}</Item>}
        <Item checked={sc.invert} onClick={() => { setScale("invert", !sc.invert); onClose(); }}>{t("cs.invertScale")}</Item>
        <Sep />
        {modes.map((m) => (
          <Item key={m} radio checked={selectedMode === m} onClick={() => { setMode(m); onClose(); }}>
            {t(`cs.mode.${m}`)}
          </Item>
        ))}
        <Sep />
        <Item onClick={() => { setScale("side", sc.side === "right" ? "left" : "right"); onClose(); }}>
          {sc.side === "right" ? t("cs.moveLeft") : t("cs.moveRight")}
        </Item>
        <Sep />
        <Submenu title={t("cs.menu.labels")} open={submenu === "labels"} onClick={() => setSubmenu(submenu === "labels" ? null : "labels")}>
          <Item checked={sc.symbolLabel} onClick={() => toggle("symbolLabel")}>{t("cs.lbl.symbol")}</Item>
          <Item checked={sc.lastPriceLabel} onClick={() => toggle("lastPriceLabel")}>{t("cs.lbl.lastPrice")}</Item>
          <Item checked={sc.countdown} onClick={() => toggle("countdown")}>{t("cs.lbl.countdown")}</Item>
          <Item checked={sc.highLow} onClick={() => toggle("highLow")}>{t("cs.lbl.highLow")}</Item>
          <Item checked={sc.tagCaptions} onClick={() => toggle("tagCaptions")}>{t("cs.lbl.captions")}</Item>
        </Submenu>
        <Submenu title={t("cs.menu.lines")} open={submenu === "lines"} onClick={() => setSubmenu(submenu === "lines" ? null : "lines")}>
          <Item checked={sc.priceLine} onClick={() => toggle("priceLine")}>{t("cs.lbl.priceLine")}</Item>
          <Item checked={sc.prevCloseLine} onClick={() => toggle("prevCloseLine")}>{t("cs.lbl.prevClose")}</Item>
        </Submenu>
        <Sep />
        <Item onClick={() => { onSettings(); onClose(); }}>{t("cs.settingsDots")}</Item>
      </div>
    </PopupPortal>
  );
}
