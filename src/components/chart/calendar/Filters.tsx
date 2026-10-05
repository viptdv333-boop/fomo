"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { QUICK, countryName } from "@/lib/calendar/countries";
import { useCalPrefs } from "@/lib/calendar/prefs";
import Flag from "../Flag";
import { EC_ICONS } from "../icons-econ";
import CountryPicker from "./CountryPicker";
import { anchorOf, type Anchor } from "./FloatingPanel";

/** the pill of a quick filter: dark when on, soft grey when off (design) */
const chipCls = (on: boolean) =>
  `inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold cursor-pointer transition ${on ? "bg-[var(--tv3-text)] text-[var(--tv3-card)]" : "bg-[var(--tv3-fill)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)]"}`;

/* The filter controls shared by the side panel, the list, the month grid and the day modal. They all read and write the same
   calendar preferences, so a change in one place applies everywhere (grid squares, list, modal, chart). */

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

export function QuickChips({ wrap = false }: { wrap?: boolean }) {
  const { t, locale } = useT();
  const [prefs, update] = useCalPrefs();
  const toggle = (c: string) =>
    update((p) => {
      if (p.countries.length === 0) return { ...p, countries: [c] };
      return { ...p, countries: p.countries.includes(c) ? p.countries.filter((x) => x !== c) : [...p.countries, c] };
    });
  return (
    <div className={wrap ? "contents" : "flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}>
      {QUICK.map((c) => {
        const on = prefs.countries.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            title={countryName(c, locale, t)}
            onClick={() => toggle(c)}
            className={chipCls(on)}
          >
            <Flag code={c} width={14} />
            {c}
          </button>
        );
      })}
      {prefs.mine.length > 0 && (
        <button
          type="button"
          onClick={() => update((p) => ({ ...p, countries: p.mine }))}
          className={chipCls(false)}
        >
          {t("ec.mine")}
        </button>
      )}
    </div>
  );
}

/** The "Moscow Exchange" layer switch (default on). */
export function MoexChip() {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  return (
    <button
      type="button"
      aria-pressed={prefs.moex}
      title={t("ec.moex.hint")}
      onClick={() => update((p) => ({ ...p, moex: !p.moex }))}
      className={chipCls(prefs.moex)}
    >
      <span className="inline-block h-2 w-2 rotate-45 bg-sky-500" />
      {t("ec.moex")}
    </button>
  );
}

/** The «Commodities and agro» layer switch (default on): USDA, CONAB, cocoa grindings, MPOB ... report dates. */
export function CommodityChip() {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  return (
    <button
      type="button"
      aria-pressed={prefs.commodities}
      title={t("ec.commodity.hint")}
      onClick={() => update((p) => ({ ...p, commodities: !p.commodities }))}
      className={chipCls(prefs.commodities)}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-lime-600" />
      {t("ec.commodity")}
    </button>
  );
}

/** The «Russia» layer switch (default on): Bank of Russia key-rate meetings and releases, Rosstat schedule, Minfin OFZ auctions. */
export function RussiaChip() {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  return (
    <button
      type="button"
      aria-pressed={prefs.russia}
      title={t("ec.russia.hint")}
      onClick={() => update((p) => ({ ...p, russia: !p.russia }))}
      className={chipCls(prefs.russia)}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-teal-600" />
      {t("ec.russia")}
    </button>
  );
}

/** The «Dividends and reporting» layer switch (default on): dividends, bond coupons and company reporting dates of Russian issuers (T-Invest API). */
export function CorpChip() {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  return (
    <button
      type="button"
      aria-pressed={prefs.corp}
      title={t("ec.corp.hint")}
      onClick={() => update((p) => ({ ...p, corp: !p.corp }))}
      className={chipCls(prefs.corp)}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-violet-500" />
      {t("ec.corp")}
    </button>
  );
}

/** «Нефть и газ»: one click shows only oil / gas events (EIA / API inventories, Baker Hughes rigs, OPEC, IEA) from every country. */
export function EnergyChip() {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  return (
    <button
      type="button"
      aria-pressed={prefs.energy}
      title={t("ec.energy.hint")}
      onClick={() => update((p) => ({ ...p, energy: !p.energy }))}
      className={chipCls(prefs.energy)}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-amber-500" />
      {t("ec.energy")}
    </button>
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
