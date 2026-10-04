"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { QuietState } from "@/lib/notify-settings-types";
import { Switch } from "./ui";

const FALLBACK_ZONES = ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka", "Europe/Kyiv", "Europe/Minsk", "Europe/London", "Europe/Berlin", "Asia/Almaty", "Asia/Tashkent", "Asia/Dubai", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"];

function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function timeToMin(v: string): number | null {
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const n = Number(m[1]) * 60 + Number(m[2]);
  return n >= 0 && n < 1440 ? n : null;
}

/** Quiet hours: auto-saved (debounced), only the on-site bell during the window. */
export default function QuietHours({ value, onSave }: { value: QuietState; onSave: (q: QuietState) => Promise<void> }) {
  const { t } = useT();
  const [q, setQ] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Pick up server values (first load / reset) unless the user is mid-edit.
  useEffect(() => {
    if (!dirty.current) setQ(value);
  }, [value]);

  const zones = useMemo(() => {
    let all: string[] = FALLBACK_ZONES;
    try {
      const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      if (sv) all = sv("timeZone");
    } catch {
      /* old browser: curated list */
    }
    return all.includes(q.timezone) ? all : [q.timezone, ...all];
  }, [q.timezone]);

  function change(next: QuietState) {
    setQ(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        await onSave(next);
        dirty.current = false;
        setState("saved");
      } catch {
        setState("error");
      }
    }, 700);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fieldCls = "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
  return (
    <section className="rounded-xl bg-white p-4 shadow dark:bg-gray-900 sm:p-6" aria-labelledby="ns-quiet-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="ns-quiet-title" className="text-lg font-bold dark:text-gray-100">{t("ns.quiet.title")}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("ns.quiet.desc")}</p>
        </div>
        <Switch checked={q.enabled} label={t("ns.quiet.enable")} onChange={(v) => change({ ...q, enabled: v })} />
      </div>
      <div className={`mt-4 flex flex-wrap items-end gap-3 ${q.enabled ? "" : "opacity-60"}`}>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("ns.quiet.from")}
          <input type="time" className={fieldCls} disabled={!q.enabled} value={minToTime(q.startMin)} onChange={(e) => { const m = timeToMin(e.target.value); if (m !== null) change({ ...q, startMin: m }); }} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("ns.quiet.to")}
          <input type="time" className={fieldCls} disabled={!q.enabled} value={minToTime(q.endMin)} onChange={(e) => { const m = timeToMin(e.target.value); if (m !== null) change({ ...q, endMin: m }); }} />
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("ns.quiet.tz")}
          <select className={fieldCls} disabled={!q.enabled} value={q.timezone} onChange={(e) => change({ ...q, timezone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <span role="status" aria-live="polite" className={`pb-2 text-xs ${state === "error" ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
          {state === "saving" ? t("ns.matrix.saving") : state === "saved" ? t("ns.matrix.saved") : state === "error" ? t("ns.matrix.saveFailed") : ""}
        </span>
      </div>
    </section>
  );
}
