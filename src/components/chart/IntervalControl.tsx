"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import MenuPopover from "./MenuPopover";
import { CS_ICONS } from "./icons-cs";
import { MENU_INTERVALS, formatInterval, intervalOrder, isValidInterval } from "@/lib/chart/intervals";

interface Props {
  interval: string;
  onInterval: (id: string) => void;
  favorites: string[];
  onFavorites: (list: string[]) => void;
  btn: string;
  btnOn: string;
}

function group(id: string): "m" | "h" | "d" {
  if (id === "D" || id === "W" || id === "M") return "d";
  return Number(id) >= 60 ? "h" : "m";
}

/** Favourite intervals as buttons plus a dropdown with every interval, stars and a custom interval form. */
export default function IntervalControl({ interval, onInterval, favorites, onFavorites, btn, btnOn }: Props) {
  const { t } = useT();
  const [num, setNum] = useState("");
  const [unit, setUnit] = useState<"m" | "h">("m");

  const favs = [...new Set(favorites.filter(isValidInterval))].sort((a, b) => intervalOrder(a) - intervalOrder(b));
  const shown = favs.includes(interval) ? favs : [...favs, interval];
  const all = [...new Set([...MENU_INTERVALS, ...favs])].sort((a, b) => intervalOrder(a) - intervalOrder(b));

  const toggleFav = (id: string) => onFavorites(favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]);

  const addCustom = (close: () => void) => {
    const n = Math.floor(Number(num));
    if (!isFinite(n) || n < 1) return;
    const minutes = unit === "h" ? n * 60 : n;
    // whole days are the D interval
    const id = minutes === 1440 ? "D" : String(minutes);
    if (!isValidInterval(id)) return;
    if (!favs.includes(id)) onFavorites([...favs, id]);
    onInterval(id);
    setNum("");
    close();
  };

  const sections: { id: "m" | "h" | "d"; key: string }[] = [
    { id: "m", key: "cs.iv.minutes" },
    { id: "h", key: "cs.iv.hours" },
    { id: "d", key: "cs.iv.days" },
  ];

  return (
    <>
      {shown.map((id) => (
        <button key={id} onClick={() => onInterval(id)} aria-pressed={interval === id} className={`${btn} px-2.5 ${interval === id ? btnOn : ""}`}>
          {formatInterval(id, t)}
        </button>
      ))}
      <MenuPopover title={t("cs.iv.all")} className={`${btn} px-1`} width={230} trigger={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>}>
        {(close) => (
          <div className="text-[13px]">
            {sections.map((sec) => {
              const items = all.filter((id) => group(id) === sec.id);
              if (items.length === 0) return null;
              return (
                <div key={sec.id}>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">{t(sec.key)}</div>
                  {items.map((id) => (
                    <div key={id} className={`group flex items-center h-8 pl-3 pr-1 hover:bg-gray-100 dark:hover:bg-[#2a2e39] ${interval === id ? "text-[#2962ff] dark:text-[#6f95ff] font-medium" : "text-gray-800 dark:text-gray-200"}`}>
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
                        className={`w-7 h-7 inline-flex items-center justify-center rounded cursor-pointer ${favs.includes(id) ? "text-amber-400" : "text-gray-400 sm:opacity-0 group-hover:opacity-100"}`}
                      >
                        {favs.includes(id) ? CS_ICONS.starFilled : CS_ICONS.star}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="mt-1 border-t border-gray-200 dark:border-[#2a2e39] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">{t("cs.iv.custom")}</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={4320}
                  value={num}
                  onChange={(e) => setNum(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustom(close)}
                  placeholder="45"
                  className="h-8 w-16 rounded border border-gray-300 dark:border-[#363a45] bg-transparent px-2 text-[13px] outline-none focus:border-[#2962ff]"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as "m" | "h")}
                  className="h-8 rounded border border-gray-300 dark:border-[#363a45] bg-white dark:bg-[#131722] px-1.5 text-[13px] cursor-pointer"
                >
                  <option value="m">{t("cs.iv.unitMin")}</option>
                  <option value="h">{t("cs.iv.unitHour")}</option>
                </select>
                <button onClick={() => addCustom(close)} className="h-8 px-3 rounded bg-[#2962ff] text-white text-[13px] cursor-pointer hover:bg-[#1e53e5]">
                  {t("cs.iv.add")}
                </button>
              </div>
            </div>
          </div>
        )}
      </MenuPopover>
    </>
  );
}
