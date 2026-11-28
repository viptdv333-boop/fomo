"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalInstrument } from "@/lib/terminal-data";
import { PopupPortal } from "./ModalPortal";
import { useT } from "@/lib/i18n/client";
import { instaInstrument } from "@/lib/instaforex-meta";
import { instrumentFamily } from "@/lib/instrument-family";

type Choice = TerminalInstrument & { kind: string; expiry?: string | null };

/** The market pill keeps the selected ticker visible next to the underlying name. */
export default function AssetMarketPicker({ instrument, onPick, btn }: {
  instrument: TerminalInstrument; onPick: (i: TerminalInstrument) => void; btn: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Choice[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const { source, dataTicker } = instrument;

  useEffect(() => {
    setOpen(false); setItems([]); setFailed(false); setLoading(false); setPartial(false);
    return () => request.current?.abort();
  }, [source, dataTicker]);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); ref.current?.focus(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setFailed(false);
    try {
      const sp=new URLSearchParams({source,ticker:dataTicker});
      if(instrument.group==="stock" || instrumentFamily(instrument)?.stock) sp.set("group","stock");
      const r = await fetch(`/api/asset-markets?${sp}`, { signal: controller.signal });
      if (!r.ok) throw new Error();
      const d = await r.json();
      if (!controller.signal.aborted) { setItems(d.items ?? []); setPartial(!!d.unavailable); }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [source, dataTicker, instrument.group]);

  const info = source === "forex" || source === "instaforex" ? instaInstrument(dataTicker) : undefined;
  const spot = info?.kind === "spot";
  const stock = instrument.group === "stock" || info?.group === "stock" || !!instrumentFamily(instrument)?.stock && !/[12]!$|[FGHJKMNQUVXZ]\d{1,2}$|\.F$|F$/.test(dataTicker);
  const kind = spot ? "spot" : stock ? "stock" : /[12]!$/.test(dataTicker) ? "continuous" : "future";
  const kindLabel = (value: string) => t(value === "spot" ? "ct.spot" : value === "stock" ? "ms.tab.stock" : value === "continuous" ? "ct.b.continuous" : value === "perpetual" ? "ms.perpetual" : "ms.futures");

  return <>
    <button type="button" ref={ref} aria-label={`${t("ct.pick")}: ${instrument.ticker}`} aria-expanded={open} aria-haspopup="listbox"
      className={`${btn} gap-1.5 px-2 border border-[var(--tv3-hair)] !rounded-[9px]`}
      onClick={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - 364)) });
        if (!open && (!items.length || partial || failed)) void load();
        setOpen(!open);
      }}>
      <span className="max-w-32 truncate text-[12px] font-semibold">{instrument.ticker}</span>
      <span className="tb-ct-label rounded-md bg-[var(--tv3-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--tv3-accent)]">{kindLabel(kind)}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <PopupPortal>
      <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
      <div role="listbox" aria-label={t("ct.pick")} className="fixed z-[56] max-h-[65vh] overflow-y-auto rounded-2xl tv3-pop py-1.5 shadow-[var(--tv3-shadow-pop)]"
        style={{ ...pos, width: 360, maxWidth: "calc(100vw - 8px)" }}>
        {loading && <div className="p-3 text-sm text-[var(--tv3-muted)]">{t("ct.loading")}</div>}
        {!loading && (failed || partial) && <div className="px-3 py-2 text-[12px] text-[var(--tv3-muted)]">
          {t("ct.unavailable")} <button className="text-[var(--tv3-accent)] underline" onClick={() => void load()}>{t("ct.retry")}</button>
        </div>}
        {!loading && !failed && !partial && !items.length && <div className="p-3 text-sm text-[var(--tv3-muted)]">{t("ct.unavailable")}</div>}
        {items.map(i => {
          const selected = i.dataTicker === dataTicker && (i.source === source || spot && source === "forex" && i.source === "instaforex");
          return <button role="option" aria-selected={selected} type="button" key={`${i.source}:${i.dataTicker}`}
            onClick={() => { onPick(i); setOpen(false); ref.current?.focus(); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--tv3-fill)] ${selected ? "text-[var(--tv3-accent)]" : "text-[var(--tv3-text)]"}`}>
            <span className="w-20 shrink-0 rounded bg-[var(--tv3-fill)] px-1 text-center text-[10px]">{kindLabel(i.kind)}</span>
            <span className="min-w-0 flex-1"><b className="block truncate text-[12px]">{i.ticker}</b>
              <span className="block text-[10px] text-[var(--tv3-muted)]">{i.source === "moex" ? "MOEX" : "InstaForex"}{i.expiry ? ` · ${i.expiry}` : ""}</span>
            </span>
            {selected && <span>✓</span>}
          </button>;
        })}
      </div>
    </PopupPortal>}
  </>;
}
