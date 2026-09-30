"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { CS_ICONS } from "./icons-cs";
import type { ScaleMode } from "@/lib/chart/types";
import type { ChartSettingsApi } from "./useChartSettings";

interface Props {
  /** Client coordinates of the right click; null = closed. */
  pos: { x: number; y: number } | null;
  onClose: () => void;
  api: ChartSettingsApi;
  autoScale: boolean;
  onAuto: (auto: boolean) => void;
  onSettings: () => void;
}

function Item({ checked, radio, onClick, children }: { checked?: boolean; radio?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="w-full h-8 pl-2 pr-4 flex items-center gap-2 text-[13px] text-left whitespace-nowrap cursor-pointer text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2a2e39]">
      <span className="w-4 h-4 inline-flex items-center justify-center text-[#2962ff]">
        {checked ? radio ? <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff]" /> : CS_ICONS.check : null}
      </span>
      {children}
    </button>
  );
}

const Sep = () => <div className="my-1 h-px bg-gray-200 dark:bg-[#2a2e39]" />;

/** Right-click menu of the price scale: auto / lock / invert, scale mode, labels, side. */
export default function PriceScaleMenu({ pos, onClose, api, autoScale, onAuto, onSettings }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const s = api.settings;
  const sc = s.scale;

  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAt({ left: Math.max(4, Math.min(pos.x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(pos.y, window.innerHeight - r.height - 4)) });
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [pos, onClose]);

  if (!pos) return null;
  const setScale = <K extends keyof typeof sc>(k: K, v: (typeof sc)[K]) => api.update((x) => ({ ...x, scale: { ...x.scale, [k]: v } }));
  const modes: ScaleMode[] = ["regular", "percent", "indexed", "log"];

  return (
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        className="fixed z-[61] w-[270px] py-1 rounded-lg bg-white dark:bg-[#1e222d] border border-gray-200 dark:border-[#2a2e39] shadow-xl"
        style={{ left: at?.left ?? pos.x, top: at?.top ?? pos.y, visibility: at ? "visible" : "hidden" }}
      >
        <Item checked={autoScale} onClick={() => { onAuto(!autoScale); onClose(); }}>{t("cs.autoScale")}</Item>
        <Item checked={sc.lock} onClick={() => { setScale("lock", !sc.lock); onClose(); }}>{t("cs.lockScale")}</Item>
        <Item checked={sc.invert} onClick={() => { setScale("invert", !sc.invert); onClose(); }}>{t("cs.invertScale")}</Item>
        <Sep />
        {modes.map((m) => (
          <Item key={m} radio checked={sc.mode === m} onClick={() => { setScale("mode", m); onClose(); }}>
            {t(`cs.mode.${m}`)}
          </Item>
        ))}
        <Sep />
        <Item checked={sc.symbolLabel} onClick={() => { setScale("symbolLabel", !sc.symbolLabel); onClose(); }}>{t("cs.lbl.symbol")}</Item>
        <Item checked={sc.lastPriceLabel} onClick={() => { setScale("lastPriceLabel", !sc.lastPriceLabel); onClose(); }}>{t("cs.lbl.lastPrice")}</Item>
        <Item checked={sc.priceLine} onClick={() => { setScale("priceLine", !sc.priceLine); onClose(); }}>{t("cs.lbl.priceLine")}</Item>
        <Item checked={sc.prevCloseLine} onClick={() => { setScale("prevCloseLine", !sc.prevCloseLine); onClose(); }}>{t("cs.lbl.prevClose")}</Item>
        <Item checked={sc.countdown} onClick={() => { setScale("countdown", !sc.countdown); onClose(); }}>{t("cs.lbl.countdown")}</Item>
        <Item checked={sc.highLow} onClick={() => { setScale("highLow", !sc.highLow); onClose(); }}>{t("cs.lbl.highLow")}</Item>
        <Sep />
        <Item onClick={() => { setScale("side", sc.side === "right" ? "left" : "right"); onClose(); }}>
          {sc.side === "right" ? t("cs.moveLeft") : t("cs.moveRight")}
        </Item>
        <Item onClick={() => { onSettings(); onClose(); }}>{t("cs.settingsDots")}</Item>
      </div>
    </>
  );
}
