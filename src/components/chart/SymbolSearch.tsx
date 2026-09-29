"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  ALL_INSTRUMENTS,
  CATEGORY_I18N,
  TERMINAL_DATA,
  adHocInstrument,
  exchangeLabel,
  instName,
  type TerminalInstrument,
} from "@/lib/terminal-data";
import { InstIcon } from "./RightPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (inst: TerminalInstrument) => void;
  current?: { source: string; ticker: string };
}

interface Row {
  inst: TerminalInstrument;
  group: string;
  custom?: boolean;
}

export default function SymbolSearch({ open, onClose, onPick, current }: Props) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Row[] = [];
    for (const cat of TERMINAL_DATA) {
      const group = t(CATEGORY_I18N[cat.name] || cat.name);
      for (const inst of cat.instruments) {
        if (
          !needle ||
          inst.ticker.toLowerCase().includes(needle) ||
          inst.name.toLowerCase().includes(needle) ||
          instName(inst, t).toLowerCase().includes(needle)
        ) {
          out.push({ inst, group });
        }
      }
    }
    // Any other ticker can be opened directly on either exchange.
    const raw = q.trim();
    if (/^[A-Za-z0-9_.-]{2,20}$/.test(raw) && !ALL_INSTRUMENTS.some((i) => i.ticker.toLowerCase() === raw.toLowerCase())) {
      out.push({ inst: adHocInstrument("moex", raw), group: "MOEX", custom: true });
      out.push({ inst: adHocInstrument("bybit", raw.toUpperCase()), group: "Bybit", custom: true });
    }
    return out;
  }, [q, t]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;

  const pick = (r: Row | undefined) => {
    if (!r) return;
    onPick(r.inst);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(rows[idx]);
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] px-3 bg-black/40" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t("shell.symbol.searchTitle")}
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("shell.symbol.placeholder")}
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onClose} title={t("shell.close")} className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-400">{t("shell.symbol.empty")}</div>}
          {rows.map((r, i) => {
            const head = r.group !== lastGroup;
            lastGroup = r.group;
            const active = i === idx;
            const isCurrent = current && current.source === r.inst.source && current.ticker === r.inst.dataTicker;
            return (
              <div key={`${r.inst.source}:${r.inst.dataTicker}:${i}`}>
                {head && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{r.group}</div>
                )}
                <button
                  data-i={i}
                  onMouseMove={() => setIdx(i)}
                  onClick={() => pick(r)}
                  className={`w-full flex items-center gap-3 px-3 h-10 text-left ${active ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                >
                  <InstIcon inst={r.inst} size={24} />
                  <span className={`text-[13px] font-bold w-24 shrink-0 truncate ${isCurrent ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-gray-100"}`}>
                    {r.inst.ticker}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
                    {r.custom
                      ? t(r.inst.source === "moex" ? "shell.symbol.openMoex" : "shell.symbol.openBybit", { ticker: r.inst.ticker })
                      : instName(r.inst, t)}
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0">{exchangeLabel(r.inst.source)}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-3 h-8 flex items-center text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-800 shrink-0">
          {t("shell.symbol.hint")}
        </div>
      </div>
    </div>
  );
}
