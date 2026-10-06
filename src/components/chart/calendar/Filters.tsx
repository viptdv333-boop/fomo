"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { categoryCounts, eventCategoryKey } from "@/lib/calendar/categories";
import { countryName } from "@/lib/calendar/countries";
import { useCalPrefs } from "@/lib/calendar/prefs";
import type { CalEvent } from "@/lib/calendar/types";
import Flag from "../Flag";
import { EC_ICONS } from "../icons-econ";
import CategoryPicker from "./CategoryPicker";
import CountryPicker from "./CountryPicker";
import { anchorOf, type Anchor } from "./FloatingPanel";

/* The filter controls shared by the side panel, the list, the month grid and the day modal, always in this order: countries,
   categories, search. They all read and write the same calendar preferences, so a change in one place applies everywhere
   (grid squares, list, modal). */

export function CountryFilter({ seen = [], className = "" }: { seen?: string[]; className?: string }) {
  const { t, locale } = useT();
  const [prefs, update] = useCalPrefs();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
        className={`inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-[var(--tv3-fill)] px-2.5 text-[13px] font-semibold text-[var(--tv3-text)] cursor-pointer hover:bg-[var(--tv3-fill2)] ${className}`}
      >
        {prefs.countries.length === 0 ? (
          <>
            <Flag code="" width={16} />
            <span className="truncate">{t("ec.allCountries")}</span>
          </>
        ) : (
          <>
            <span className="flex -space-x-1">
              {prefs.countries.slice(0, 3).map((c) => (
                <Flag key={c} code={c} width={15} />
              ))}
            </span>
            <span className="truncate">{prefs.countries.length === 1 ? countryName(prefs.countries[0], locale, t) : t("ec.nCountries", { n: prefs.countries.length })}</span>
          </>
        )}
        <span className="ml-auto text-[var(--tv3-muted)]">{EC_ICONS.chevron}</span>
      </button>
      {anchor && (
        <CountryPicker
          anchor={anchor}
          onClose={() => setAnchor(null)}
          selected={prefs.countries}
          mine={prefs.mine}
          seen={seen}
          onChange={(codes) => update((p) => ({ ...p, countries: codes }))}
          onSaveMine={(codes) => update((p) => ({ ...p, mine: codes }))}
        />
      )}
    </>
  );
}

/**
 * The category dropdown (Центробанки, Экономика, Энергетика, Металлы ...): multi-select, empty = all categories. `events` are the
 * events of the current range that already passed the country and search filters (not the category one): the picker shows how many
 * of them each category holds.
 */
export function CategoryFilter({ events = [], className = "" }: { events?: readonly CalEvent[]; className?: string }) {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const n = prefs.categories.length;
  const counts = useMemo(() => (anchor ? categoryCounts(events) : undefined), [anchor, events]);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        data-category-filter
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
        className={`inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-[var(--tv3-fill)] px-2.5 text-[13px] font-semibold text-[var(--tv3-text)] cursor-pointer hover:bg-[var(--tv3-fill2)] ${className}`}
      >
        <span className="truncate">{n === 0 ? t("ec.allCategories") : n === 1 ? t(eventCategoryKey(prefs.categories[0])) : t("ec.categories")}</span>
        {n > 0 && (
          <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--tv3-accent)] px-1 text-[11px] font-bold leading-none text-white" aria-label={t("ec.nCategories", { n })}>
            {n}
          </span>
        )}
        <span className="ml-auto text-[var(--tv3-muted)]">{EC_ICONS.chevron}</span>
      </button>
      {anchor && <CategoryPicker anchor={anchor} onClose={() => setAnchor(null)} selected={prefs.categories} counts={counts} onChange={(categories) => update((p) => ({ ...p, categories }))} />}
    </>
  );
}

export function SearchBox({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const { t } = useT();
  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--tv3-muted)]">{EC_ICONS.search}</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("ec.search")}
        aria-label={t("ec.search")}
        className="h-8 w-full rounded-[10px] bg-[var(--tv3-fill)] pl-7 pr-2 text-[14px] text-[var(--tv3-text)] outline-none max-sm:text-[16px]"
      />
    </div>
  );
}
