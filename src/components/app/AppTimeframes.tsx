"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { formatInterval, intervalOrder, isSecondsInterval, isValidInterval, pickerIntervals, secondsSupported } from "@/lib/chart/intervals";
import { parseTypedInterval, timeframeById, type TfGroup } from "@/lib/chart/timeframes";
import AppIcon from "./AppIcon";
import { useBackLayer } from "./useBackLayer";

const GROUPS: { id: TfGroup; key: string }[] = [
  { id: "s", key: "cs.iv.seconds" },
  { id: "m", key: "cs.iv.minutes" },
  { id: "h", key: "cs.iv.hours" },
  { id: "d", key: "cs.iv.days" },
];

function groupOf(id: string): TfGroup {
  return timeframeById(id)?.group ?? (Number(id) >= 60 ? "h" : "m");
}

interface Props {
  /** the chart's interval id */
  interval: string;
  /** pinned interval ids (chart settings) */
  favs: string[];
  /** the chart's data source (seconds exist only for some) */
  source: string;
  onPick: (id: string) => void;
  onFavs: (list: string[]) => void;
}

/**
 * The timeframe row of the app terminal, TradingView style: the pinned timeframes as chips (the current one is always among them), a «▾» button that opens
 * the list of every timeframe grouped by seconds / minutes / hours / days with a star to pin or unpin each (a bottom sheet on a phone, a popover under the
 * button in a wide window). The row scrolls sideways when the pins do not fit.
 */
export default function AppTimeframes({ interval, favs, source, onPick, onFavs }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);

  const secOk = secondsSupported(source);
  const pinned = [...new Set(favs.filter(isValidInterval))].sort((a, b) => intervalOrder(a) - intervalOrder(b));
  // seconds pinned on another symbol stay pinned, but are not shown where they cannot be built
  const chips = pinned.filter((id) => secOk || !isSecondsInterval(id));
  const shown = chips.includes(interval) ? chips : [...chips, interval].sort((a, b) => intervalOrder(a) - intervalOrder(b));

  // keep the current chip in view when the row scrolls
  useEffect(() => {
    const on = rowRef.current?.querySelector<HTMLElement>('[data-on="1"]');
    try {
      on?.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {}
  }, [interval]);

  return (
    <div className="app-term-tfs" role="group" aria-label={t("appui.term.timeframe")}>
      {/* the chips scroll sideways, the «▾» stays in view */}
      <div className="app-term-tfscroll" ref={rowRef}>
        {shown.map((id) => (
          <button key={id} type="button" className="app-term-chip" data-on={interval === id ? "1" : undefined} data-tf={id} onClick={() => onPick(id)}>
            {formatInterval(id, t)}
          </button>
        ))}
      </div>
      <button type="button" ref={moreRef} className="app-term-chip app-term-tfmore" data-tf-more aria-label={t("appui.tf.more")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <AppIcon name="chevD" size={14} stroke={2} />
      </button>
      {open && (
        <TfPicker
          interval={interval}
          pinned={pinned}
          source={source}
          anchor={moreRef.current}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            onPick(id);
            setOpen(false);
          }}
          onFavs={onFavs}
        />
      )}
    </div>
  );
}

function TfPicker({
  interval,
  pinned,
  source,
  anchor,
  onClose,
  onPick,
  onFavs,
}: {
  interval: string;
  pinned: string[];
  source: string;
  anchor: HTMLElement | null;
  onClose: () => void;
  onPick: (id: string) => void;
  onFavs: (list: string[]) => void;
}) {
  const { t } = useT();
  useBackLayer(true, onClose);
  const [typed, setTyped] = useState("");
  const [wide, setWide] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  // a wide window gets a popover under the «▾» button, a phone a bottom sheet
  useLayoutEffect(() => {
    const isWide = window.matchMedia("(min-width: 768px)").matches;
    setWide(isWide);
    if (isWide && anchor) {
      const r = anchor.getBoundingClientRect();
      const width = 300;
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), maxHeight: Math.max(240, window.innerHeight - r.bottom - 24) });
    }
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ids = [...new Set([...pickerIntervals(source), ...pinned.filter((id) => secondsSupported(source) || !isSecondsInterval(id))])].sort((a, b) => intervalOrder(a) - intervalOrder(b));
  const toggle = (id: string) => onFavs(pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]);
  const typedId = typed ? parseTypedInterval(typed, source) : null;

  const node = (
    <div className="app-tf-wrap" data-wide={wide ? "1" : undefined} role="dialog" aria-modal="true" aria-label={t("appui.tf.title")} data-tf-picker>
      <div className="app-tf-back" onClick={onClose} />
      <div className="app-tf-sheet" style={wide && pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : undefined}>
        {!wide && (
          <div className="app-tf-grip">
            <div />
          </div>
        )}
        <div className="app-tf-bar">
          <div className="app-tf-title">{t("appui.tf.title")}</div>
          <button type="button" className="app-tf-done" onClick={onClose}>
            {t("appui.chat.done")}
          </button>
        </div>
        {wide && (
          <input
            className="app-tf-type"
            value={typed}
            autoFocus
            inputMode="text"
            autoComplete="off"
            placeholder="15, 2h, 30s, D"
            aria-label={t("appui.tf.title")}
            data-tf-type
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typedId) {
                e.preventDefault();
                onPick(typedId);
              }
            }}
          />
        )}
        <div className="app-tf-body">
          {typed && (
            <div className="app-tf-typed" data-ok={typedId ? "1" : undefined}>
              {typedId ? `↵ ${formatInterval(typedId, t)}` : "—"}
            </div>
          )}
          <div className="app-tf-hint">{t("appui.tf.hint")}</div>
          {GROUPS.map((g) => {
            const items = ids.filter((id) => groupOf(id) === g.id);
            if (items.length === 0) return null;
            return (
              <div key={g.id} className="app-tf-group" data-group={g.id}>
                <div className="app-tf-gt">{t(g.key)}</div>
                {g.id === "s" && <div className="app-tf-note">{t("appui.tf.secNote")}</div>}
                {items.map((id) => {
                  const on = pinned.includes(id);
                  return (
                    <div key={id} className="app-tf-row" data-cur={interval === id ? "1" : undefined}>
                      <button type="button" className="app-tf-pick" data-tf-pick={id} aria-current={interval === id ? "true" : undefined} onClick={() => onPick(id)}>
                        {formatInterval(id, t)}
                      </button>
                      <button type="button" className="app-tf-star" data-on={on ? "1" : undefined} data-tf-star={id} aria-pressed={on} aria-label={t(on ? "cs.iv.unfav" : "cs.iv.fav")} onClick={() => toggle(id)}>
                        {on ? "★" : "☆"}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(node, document.body);
}
