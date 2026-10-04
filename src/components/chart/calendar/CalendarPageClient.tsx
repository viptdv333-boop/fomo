"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { TIME_ZONES, localZone } from "@/lib/chart/settings";
import WorldCalendar from "./WorldCalendar";

const TZ_LS = "fomo-calendar-tz";

/** The public /calendar page: the whole-page calendar under the site header, with a time zone picker. */
export default function CalendarPageClient() {
  const { t } = useT();
  const [top, setTop] = useState(56);
  const [zone, setZone] = useState("UTC");
  const local = useMemo(() => localZone(), []);

  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(TZ_LS) || "";
    } catch {}
    setZone(saved || local);
  }, [local]);

  // edge to edge from the bottom of the site header to the bottom of the viewport, like the terminal
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

  const zones = useMemo(() => {
    const ids = new Set<string>([local, "UTC", ...TIME_ZONES.map((z) => z.id)]);
    return [...ids];
  }, [local]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-white dark:bg-[#1e222d]" style={{ top }}>
      <WorldCalendar
        zone={zone}
        mode="page"
        zoneSlot={
          <select
            value={zone}
            aria-label={t("ec.tz")}
            onChange={(e) => {
              setZone(e.target.value);
              try {
                localStorage.setItem(TZ_LS, e.target.value);
              } catch {}
            }}
            className="h-7 max-w-[170px] rounded-md border border-gray-200 bg-transparent px-1.5 text-[12px] outline-none dark:border-[#363a45] dark:bg-[#1e222d]"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z === local ? `${z} (${t("ec.local")})` : z}
              </option>
            ))}
          </select>
        }
      />
    </div>
  );
}
