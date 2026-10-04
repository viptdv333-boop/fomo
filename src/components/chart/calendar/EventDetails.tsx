"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { countryName, intlLocale } from "@/lib/calendar/countries";
import { addReminder, removeReminder, useReminders } from "@/lib/calendar/reminders";
import { formatChange, formatValue, surprise } from "@/lib/calendar/surprise";
import { formatAgo, formatCountdown } from "@/lib/calendar/time";
import type { CalEvent } from "@/lib/calendar/types";
import Flag from "../Flag";
import { EC_ICONS } from "../icons-econ";
import FloatingPanel, { type Anchor } from "./FloatingPanel";
import { CommodityMark, ImpactDots, MoexMark, SURPRISE_CLASS, useNow } from "./parts";

/** descriptions are fetched on demand (the list answers carry only `hasDesc`) and remembered */
const descMemo = new Map<string, string>();

type Glossary = typeof import("@/lib/calendar/glossary");

const MINUTES = [5, 15, 30, 60];

export default function EventDetails({ ev, anchor, zone, onClose }: { ev: CalEvent; anchor: Anchor; zone: string; onClose: () => void }) {
  const { t, locale } = useT();
  const loc = intlLocale(locale);
  const now = useNow(1000);
  const reminders = useReminders();
  const existing = reminders.find((r) => r.id === ev.id);
  const [minutes, setMinutes] = useState(existing?.minutes ?? 15);
  const future = ev.ts > now && !ev.allDay;
  const [desc, setDesc] = useState<string>(ev.description ?? descMemo.get(ev.id) ?? "");
  useEffect(() => {
    if (desc || !ev.hasDesc) return;
    let off = false;
    const day = new Date(ev.ts).toISOString().slice(0, 10);
    const params = new URLSearchParams({ from: day, to: day, desc: "1", q: ev.eventEn ?? ev.event, lang: locale });
    if (ev.country) params.set("countries", ev.country);
    fetch(`/api/economic-calendar?${params}`)
      .then((r) => r.json())
      .then((rows: unknown) => {
        const hit = Array.isArray(rows) ? (rows as { id?: string; description?: string }[]).find((x) => x.id === ev.id) : null;
        if (hit?.description && !off) {
          descMemo.set(ev.id, hit.description);
          setDesc(hit.description);
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [ev, desc, locale]);
  // the glossary (Russian «что это» / «на что влияет», tag labels) is a separate chunk: loaded when the first popup opens
  const [gl, setGl] = useState<Glossary | null>(null);
  useEffect(() => {
    let off = false;
    void import("@/lib/calendar/glossary").then((m) => {
      if (!off) setGl(m);
    });
    return () => {
      off = true;
    };
  }, []);
  const explain = gl && ev.category !== "moex" ? gl.glossaryText(ev.gk ?? `~${ev.category}`, locale) : null;
  const s = surprise(ev);

  const when = (() => {
    try {
      return new Intl.DateTimeFormat(loc, { timeZone: zone, weekday: "short", day: "numeric", month: "long", ...(ev.allDay ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) }).format(new Date(ev.ts));
    } catch {
      return new Date(ev.ts).toISOString();
    }
  })();

  const remind = () => {
    // the reminder is stored at once; the permission prompt (user gesture) must not hold it up
    addReminder(ev, minutes);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    } catch {}
  };

  const cell = (label: string, value: string, cls = "") => (
    <div className="rounded-[10px] bg-[var(--tv3-fill3)] px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--tv3-muted)]">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${cls || "text-[var(--tv3-text)]"}`}>{value || "—"}</div>
    </div>
  );

  return (
    <FloatingPanel anchor={anchor} onClose={onClose} width={320} label={ev.event}>
      <div className="p-3">
        <div className="flex items-start gap-2">
          <Flag code={ev.country} width={24} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-[var(--tv3-muted)]">
              {countryName(ev.country, locale, t)}
              {ev.currency ? ` · ${ev.currency}` : ""}
            </div>
            <div className="text-[15px] font-semibold leading-snug">{ev.event}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("shell.close")} className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] cursor-pointer">
            <span className="scale-75">{EC_ICONS.close}</span>
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--tv3-text2)]">
          <span className="inline-flex items-center gap-1.5">
            <ImpactDots level={ev.impact} />
            {t(`ec.impact.${ev.impact}`)}
          </span>
          {ev.category === "moex" ? <MoexMark title={t("ec.moex")} /> : ev.category === "commodity" ? <CommodityMark title={t("ec.commodity")} /> : <span className="rounded-full bg-[var(--tv3-fill)] px-2 py-0.5 text-[11px]">{t(`ec.cat.${ev.category}`)}</span>}
          {ev.period && <span className="text-[11px] text-[var(--tv3-muted)]">{ev.period}</span>}
        </div>
        {ev.eventEn && ev.eventEn !== ev.event && (
          <div className="mt-1 text-[11px] leading-snug text-[var(--tv3-muted)]" title={t("ec.originalName")}>
            {ev.eventEn}
          </div>
        )}
        {gl && ev.tags && ev.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {ev.tags.map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-1.5 py-0.5 text-[10.5px] ${tag === "oil" || tag === "gas" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-[var(--tv3-fill)] text-[var(--tv3-text2)]"}`}
              >
                {gl.tagLabel(tag, locale)}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 text-xs text-[var(--tv3-text2)]">
          <div>{when}{ev.allDay ? ` · ${t("ec.allDay")}` : ""}</div>
          {!ev.allDay && (
            <div className="mt-0.5 tabular-nums text-[var(--tv3-muted)]">
              {future ? t("ec.rem.in", { time: formatCountdown(ev.ts - now) }) : t("ec.ago", { time: formatAgo(now - ev.ts) })}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {cell(t("ec.actual"), formatValue(ev.actual, ev.unit, loc), s ? SURPRISE_CLASS[s] : "")}
          {cell(t("ec.forecast"), formatValue(ev.forecast, ev.unit, loc))}
          {cell(t("ec.previous"), formatValue(ev.previous, ev.unit, loc))}
          {cell(t("ec.change"), formatChange(ev.change ?? (ev.actual !== null && ev.previous !== null ? ev.actual - ev.previous : null), ev.unit, loc))}
        </div>
        {s && <div className={`mt-2 text-xs font-medium ${SURPRISE_CLASS[s]}`}>{t(`ec.surprise.${s}`)}</div>}
        {explain && (
          <div className="mt-3 space-y-2 text-xs leading-relaxed">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{t("ec.about")}</div>
              <p className="mt-0.5 text-[var(--tv3-text2)]">{explain.about}</p>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{t("ec.affects")}</div>
              <p className="mt-0.5 text-[var(--tv3-text2)]">{explain.affects}</p>
            </div>
          </div>
        )}
        {ev.hasDesc &&
          (explain ? (
            // the English text of the source stays available, but folded away: the Russian explanation above is the main one
            <details className="mt-2 rounded-[10px] bg-[var(--tv3-fill3)] p-2.5 text-xs text-[var(--tv3-text2)]">
              <summary className="cursor-pointer select-none text-[11px] text-[var(--tv3-muted)]">{t("ec.original")}</summary>
              <div className="mt-1.5 max-h-40 overflow-y-auto leading-relaxed">
                {desc || <span className="text-[var(--tv3-muted)]">…</span>}
                {ev.origin && desc && <div className="mt-1.5 text-[11px] text-[var(--tv3-muted)]">{t("ec.origin")}: {ev.origin}</div>}
              </div>
            </details>
          ) : (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-[10px] bg-[var(--tv3-fill3)] p-2.5 text-xs leading-relaxed text-[var(--tv3-text2)]">
              {desc || <span className="text-[var(--tv3-muted)]">…</span>}
              {ev.origin && desc && <div className="mt-1.5 text-[11px] text-[var(--tv3-muted)]">{t("ec.origin")}: {ev.origin}</div>}
            </div>
          ))}

        {future && (
          <div className="mt-3 border-t border-[var(--tv3-hair2)] pt-3">
            {existing ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-[var(--tv3-text2)]">{t("ec.rem.set", { min: existing.minutes })}</span>
                <button type="button" onClick={() => removeReminder(ev.id)} className="h-8 rounded-[10px] bg-[var(--tv3-fill)] px-2.5 text-xs font-semibold cursor-pointer hover:bg-[var(--tv3-fill2)]">
                  {t("ec.rem.remove")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(+e.target.value)}
                  aria-label={t("ec.rem.before")}
                  className="h-8 rounded-[10px] bg-[var(--tv3-fill)] px-1.5 text-xs text-[var(--tv3-text)] outline-none"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {t("ec.rem.opt", { min: m })}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={remind} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--tv3-accent)] px-3 text-xs font-semibold text-white cursor-pointer hover:bg-[var(--tv3-accent-hover)]">
                  <span className="scale-[0.72]">{EC_ICONS.bell}</span>
                  {t("ec.rem.add")}
                </button>
              </div>
            )}
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--tv3-muted)]">{t("ec.rem.note")}</p>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
