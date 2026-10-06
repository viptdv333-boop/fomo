"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { EVENT_CATEGORIES, eventCategoryKey, type EventCategory } from "@/lib/calendar/categories";
import CountrySheet from "./CountrySheet";
import FloatingPanel, { type Anchor } from "./FloatingPanel";
import { isPhoneNow } from "./useViewport";

interface Props {
  anchor: Anchor;
  onClose: () => void;
  /** Selected categories; empty = all. */
  selected: EventCategory[];
  /** Events of the current range per category (country and search filters applied, the category filter not); omitted = no numbers. */
  counts?: Record<EventCategory, number>;
  onChange: (next: EventCategory[]) => void;
}

/**
 * The category picker: a checkbox list of the nine categories with a hint and the number of events of the current range. Empty
 * selection = all (the rows look unticked then, like in the country picker). Anchored popover on a desktop, bottom sheet with
 * 44 px rows and «Сбросить» / «Готово» on a phone.
 */
export default function CategoryPicker({ anchor, onClose, selected, counts, onChange }: Props) {
  const { t } = useT();
  // decided once, at mount (the picker is only mounted by a tap): a phone gets a bottom sheet, never an anchored popover
  const [phone] = useState(isPhoneNow);
  const sel = new Set<string>(selected);
  const all = selected.length === 0;

  const toggle = (c: EventCategory) => {
    const next = new Set(sel);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    // keep the picker order, and fall back to «all» when the last tick is removed
    onChange(EVENT_CATEGORIES.filter((x) => next.has(x)));
  };

  const list = (
    <ul className="py-1" role="group" aria-label={t("ec.categories")}>
      {EVENT_CATEGORIES.map((c) => {
        const on = sel.has(c);
        const n = counts?.[c];
        return (
          <li key={c}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              data-category={c}
              onClick={() => toggle(c)}
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1 text-left text-[13px] cursor-pointer hover:bg-[var(--tv3-fill)] max-sm:min-h-11 max-sm:gap-3 max-sm:text-[15px] max-sm:active:bg-[var(--tv3-fill)]"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border max-sm:h-5 max-sm:w-5 ${on ? "border-[var(--tv3-accent)] bg-[var(--tv3-accent)] text-white" : "border-[var(--tv3-hair)]"}`}>
                {on && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3 max-sm:h-3.5 max-sm:w-3.5" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t(eventCategoryKey(c))}</span>
                <span className="block truncate text-[11px] leading-tight text-[var(--tv3-muted)] max-sm:text-[12px]">{t(`${eventCategoryKey(c)}.d`)}</span>
              </span>
              {n !== undefined && <span className={`shrink-0 text-[12px] tabular-nums ${n === 0 ? "text-[var(--tv3-muted)] opacity-60" : "text-[var(--tv3-muted)]"}`}>{n}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (phone) {
    return (
      <CountrySheet
        title={t("ec.categories")}
        onClose={onClose}
        footer={
          <div className="flex gap-2">
            <button type="button" disabled={all} onClick={() => onChange([])} className="h-11 flex-1 cursor-pointer rounded-[12px] bg-[var(--tv3-fill)] text-[15px] font-semibold text-[var(--tv3-text)] disabled:opacity-40 disabled:cursor-default">
              {t("ec.sheet.reset")}
            </button>
            <button type="button" onClick={onClose} className="h-11 flex-1 cursor-pointer rounded-[12px] bg-[var(--tv3-accent)] text-[15px] font-semibold text-white">
              {t("ec.sheet.done")}
            </button>
          </div>
        }
      >
        {list}
      </CountrySheet>
    );
  }

  return (
    <FloatingPanel anchor={anchor} onClose={onClose} width={320} label={t("ec.categories")}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--tv3-hair2)] bg-[var(--tv3-card)] px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{all ? t("ec.allCategories") : t("ec.nCategories", { n: selected.length })}</span>
        <button type="button" disabled={all} onClick={() => onChange([])} className="h-7 shrink-0 cursor-pointer rounded-md border border-[var(--tv3-hair)] px-2 text-[12px] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)] disabled:cursor-default disabled:opacity-40">
          {t("ec.sheet.reset")}
        </button>
      </div>
      {list}
    </FloatingPanel>
  );
}
