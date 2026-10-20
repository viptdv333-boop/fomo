"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import MenuPopover from "./MenuPopover";
import { CS_ICONS } from "./icons-cs";
import { useMoexSeconds } from "@/lib/chart/moex-seconds-client";
import { formatInterval, intervalOrder, isSecondsInterval, isValidInterval, pickerIntervals, secondsSupported } from "@/lib/chart/intervals";

interface Props {
  interval: string;
  onInterval: (id: string) => void;
  favorites: string[];
  onFavorites: (list: string[]) => void;
  btn: string;
  btnOn: string;
  /** data source of the chart: second timeframes are offered only where a trade stream exists */
  source?: string;
}

function group(id: string): "s" | "m" | "h" | "d" {
  if (isSecondsInterval(id)) return "s";
  if (id === "D" || id === "W" || id === "M" || id === "Y") return "d";
  return Number(id) >= 60 ? "h" : "m";
}

/** Favourite intervals as buttons plus a dropdown with every interval, stars and a custom interval form. */
export default function IntervalControl({ interval, onInterval, favorites, onFavorites, source = "" }: Props) {
  const { t } = useT();
  useMoexSeconds(source); // MOEX: the «Секунды» group appears when the server says the feed is there
  const [num, setNum] = useState("");
  const [unit, setUnit] = useState<"m" | "h">("m");

  const secOk = secondsSupported(source);
  // every pinned interval (also the seconds pinned on another symbol), and the ones this symbol can show
  const pinned = [...new Set(favorites.filter(isValidInterval))].sort((a, b) => intervalOrder(a) - intervalOrder(b));
  const favs = pinned.filter((id) => secOk || !isSecondsInterval(id));
  const shown = favs.includes(interval) ? favs : [...favs, interval].sort((a, b) => intervalOrder(a) - intervalOrder(b));
  const all = [...new Set([...pickerIntervals(source), ...favs])].sort((a, b) => intervalOrder(a) - intervalOrder(b));

  const toggleFav = (id: string) => onFavorites(pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]);

  const addCustom = (close: () => void) => {
    const n = Math.floor(Number(num));
    if (!isFinite(n) || n < 1) return;
    const minutes = unit === "h" ? n * 60 : n;
    // whole days are the D interval
    const id = minutes === 1440 ? "D" : String(minutes);
    if (!isValidInterval(id)) return;
    if (!pinned.includes(id)) onFavorites([...pinned, id]);
    onInterval(id);
    setNum("");
    close();
  };

  const sections: { id: "s" | "m" | "h" | "d"; key: string }[] = [
    { id: "s", key: "cs.iv.seconds" },
    { id: "m", key: "cs.iv.minutes" },
    { id: "h", key: "cs.iv.hours" },
    { id: "d", key: "cs.iv.days" },
  ];

  return (
    <div className="flex items-center shrink-0 rounded-[11px] bg-[var(--tv3-fill2)] p-0.5">
      {shown.map((id) => (
        <button
          key={id}
          onClick={() => onInterval(id)}
          aria-pressed={interval === id}
          className={`tv3-press px-[10px] py-[5.5px] text-[13.5px] font-semibold rounded-[9px] shrink-0 cursor-pointer text-[var(--tv3-text)] ${interval === id ? "bg-[var(--tv3-card)] shadow-[0_1px_3px_rgba(0,0,0,.18)]" : "hover:bg-[var(--tv3-card)]/60"}`}
        >
          {formatInterval(id, t)}
        </button>
      ))}
      <MenuPopover title={t("cs.iv.all")} className="tv3-press px-2 py-[7px] rounded-[9px] shrink-0 cursor-pointer text-[var(--tv3-text)] hover:bg-[var(--tv3-card)]/60" width={230} trigger={<svg viewBox="0 0 24 24" className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>}>
        {(close) => (
          <div className="text-[13px]">
            {sections.map((sec) => {
              const items = all.filter((id) => group(id) === sec.id);
              if (items.length === 0) return null;
              return (
                <div key={sec.id}>
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)]">{t(sec.key)}</div>
                  {items.map((id) => (
                    <div key={id} className={`group flex items-center h-8 pl-3 pr-1 hover:bg-[var(--tv3-fill)] ${interval === id ? "text-[var(--tv3-accent)] font-medium" : "text-[var(--tv3-text)]"}`}>
                      <button
                        className="flex-1 text-left h-full cursor-pointer"
                        onClick={() => {
                          onInterval(id);
                          close();
                        }}
                      >
                        {formatInterval(id, t)}
                      </button>
                      <button
                        onClick={() => toggleFav(id)}
                        title={favs.includes(id) ? t("cs.iv.unfav") : t("cs.iv.fav")}
                        aria-pressed={favs.includes(id)}
                        className={`w-7 h-7 inline-flex items-center justify-center rounded cursor-pointer ${favs.includes(id) ? "text-amber-400" : "text-[var(--tv3-muted)] sm:opacity-0 group-hover:opacity-100"}`}
                      >
                        {favs.includes(id) ? CS_ICONS.starFilled : CS_ICONS.star}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="mt-1 border-t border-[var(--tv3-hair)] px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)] mb-1.5">{t("cs.iv.custom")}</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={4320}
                  value={num}
                  onChange={(e) => setNum(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustom(close)}
                  placeholder="45"
                  className="h-8 w-16 rounded-[9px] border border-[#e5e5ea] dark:border-[#3a3a3c] bg-transparent px-2 text-[13px] outline-none focus:border-[var(--tv3-accent)]"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as "m" | "h")}
                  className="h-8 rounded-[9px] border border-[#e5e5ea] dark:border-[#3a3a3c] bg-[var(--tv3-card)] px-1.5 text-[13px] cursor-pointer"
                >
                  <option value="m">{t("cs.iv.unitMin")}</option>
                  <option value="h">{t("cs.iv.unitHour")}</option>
                </select>
                <button onClick={() => addCustom(close)} className="h-8 px-3 rounded-[9px] bg-[var(--tv3-accent)] text-white text-[13px] cursor-pointer hover:bg-[var(--tv3-accent-hover)]">
                  {t("cs.iv.add")}
                </button>
              </div>
            </div>
          </div>
        )}
      </MenuPopover>
    </div>
  );
}
