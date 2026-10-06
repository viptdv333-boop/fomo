"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { COUNTRY_CODES, G20, G7, countryName } from "@/lib/calendar/countries";
import Flag from "../Flag";
import CountrySheet from "./CountrySheet";
import FloatingPanel, { type Anchor } from "./FloatingPanel";
import { isPhoneNow, isTouchNow } from "./useViewport";

interface Props {
  anchor: Anchor;
  onClose: () => void;
  /** Selected codes; empty = all countries. */
  selected: string[];
  mine: string[];
  /** Codes present in the loaded data (added to the list when unknown). */
  seen: string[];
  onChange: (codes: string[]) => void;
  onSaveMine: (codes: string[]) => void;
}

export default function CountryPicker({ anchor, onClose, selected, mine, seen, onChange, onSaveMine }: Props) {
  const { t, locale } = useT();
  const [q, setQ] = useState("");
  // decided once, at mount (the picker is only mounted by a tap): a phone gets a bottom sheet, never an anchored popover
  const [phone] = useState(isPhoneNow);
  // the on-screen keyboard resizes the viewport and covers the list: on a touch device the search field is focused by a tap only
  const [autoFocus] = useState(() => !isTouchNow() && !isPhoneNow());
  const sel = useMemo(() => new Set(selected), [selected]);
  const all = selected.length === 0;

  // the order is frozen at opening: `seen` follows the filters (in the day modal it shrinks to the chosen countries), and rows
  // that jump under the finger while ticking boxes are unusable
  const [seenAtOpen] = useState(seen);
  const rows = useMemo(() => {
    const codes = [...new Set<string>([...COUNTRY_CODES, ...seenAtOpen])].filter((c) => c);
    const named = codes.map((c) => ({ code: c, name: countryName(c, locale, t) }));
    const ql = q.trim().toLowerCase();
    const list = ql ? named.filter((r) => r.name.toLowerCase().includes(ql) || r.code.toLowerCase() === ql) : named;
    const seenSet = new Set(seenAtOpen);
    // countries with events in the loaded range first, then alphabetical
    return list.sort((a, b) => Number(seenSet.has(b.code)) - Number(seenSet.has(a.code)) || a.name.localeCompare(b.name, locale));
  }, [q, seenAtOpen, locale, t]);

  const toggle = (c: string) => {
    const next = new Set(sel);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange([...next]);
  };

  const chip = "h-7 px-2 rounded-md text-[12px] cursor-pointer border border-[var(--tv3-hair)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)] disabled:opacity-40 disabled:cursor-default max-sm:h-9 max-sm:shrink-0 max-sm:whitespace-nowrap max-sm:px-3 max-sm:text-[13px]";

  const search = (
    <input
      autoFocus={autoFocus}
      value={q}
      onChange={(e) => setQ(e.target.value)}
      placeholder={t("ec.countrySearch")}
      enterKeyHint="search"
      autoComplete="off"
      className="h-8 w-full rounded-[10px] bg-[var(--tv3-fill)] px-2.5 text-[13px] outline-none focus:border-[var(--tv3-accent)] max-sm:h-10 max-sm:text-[16px]"
    />
  );
  // a preset is "on" when the current selection is exactly its set: filled with the accent colour, so the state is obvious
  const same = (codes: readonly string[]) => codes.length > 0 && codes.length === sel.size && codes.every((c) => sel.has(c));
  const activeCls = "bg-[var(--tv3-accent)]! border-[var(--tv3-accent)]! text-white! font-semibold hover:opacity-90";
  const presets = (
    <div className="mt-2 flex flex-wrap gap-1 max-sm:flex-nowrap max-sm:gap-1.5 max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden">
      <button type="button" aria-pressed={all} className={`${chip} ${all ? activeCls : ""}`} onClick={() => onChange([])}>
        {t("ec.allCountries")}
      </button>
      <button type="button" aria-pressed={same(G7)} className={`${chip} ${same(G7) ? activeCls : ""}`} onClick={() => onChange([...G7])}>G7</button>
      <button type="button" aria-pressed={same(G20)} className={`${chip} ${same(G20) ? activeCls : ""}`} onClick={() => onChange([...G20])}>G20</button>
      <button type="button" aria-pressed={same(mine)} className={`${chip} ${same(mine) ? activeCls : ""}`} disabled={mine.length === 0} title={mine.length ? undefined : t("ec.mineEmpty")} onClick={() => onChange(mine)}>
        {t("ec.mine")}
      </button>
      <button type="button" className={chip} disabled={selected.length === 0 || same(mine)} onClick={() => onSaveMine(selected)} title={t("ec.saveMineHint")}>
        {t("ec.saveMine")}
      </button>
    </div>
  );
  const list = (
    <ul className="py-1">
      {rows.map((r) => {
        const on = all || sel.has(r.code);
        return (
          <li key={r.code}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on && !all}
              onClick={() => {
                // from "all" the first click selects just that country
                if (all) onChange([r.code]);
                else toggle(r.code);
              }}
              className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] cursor-pointer hover:bg-[var(--tv3-fill)] max-sm:h-11 max-sm:gap-3 max-sm:text-[15px] max-sm:active:bg-[var(--tv3-fill)]"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border max-sm:h-5 max-sm:w-5 ${on && !all ? "border-[var(--tv3-accent)] bg-[var(--tv3-accent)] text-white" : "border-[var(--tv3-hair)]"}`}>
                {on && !all && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3 max-sm:h-3.5 max-sm:w-3.5" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                )}
              </span>
              <Flag code={r.code} width={20} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-[11px] text-[var(--tv3-muted)]">{r.code}</span>
            </button>
          </li>
        );
      })}
      {rows.length === 0 && <li className="px-3 py-4 text-center text-xs text-[var(--tv3-muted)]">{t("ec.noCountry")}</li>}
    </ul>
  );

  if (phone) {
    return (
      <CountrySheet
        title={t("ec.countries")}
        onClose={onClose}
        header={
          <>
            {search}
            {presets}
          </>
        }
        footer={
          <div className="flex gap-2">
            <button type="button" disabled={selected.length === 0} onClick={() => onChange([])} className="h-11 flex-1 cursor-pointer rounded-[12px] bg-[var(--tv3-fill)] text-[15px] font-semibold text-[var(--tv3-text)] disabled:opacity-40 disabled:cursor-default">
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
    <FloatingPanel anchor={anchor} onClose={onClose} width={300} label={t("ec.countries")}>
      <div className="sticky top-0 z-10 border-b border-[var(--tv3-hair2)] bg-[var(--tv3-card)] p-2">
        {search}
        {presets}
      </div>
      {list}
    </FloatingPanel>
  );
}
