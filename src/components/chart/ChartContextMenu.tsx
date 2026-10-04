"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { DrawingsController, ZOrderMode } from "@/lib/chart/drawings/controller";
import { ALERT_LINE_TOOLS } from "@/lib/alerts/evaluate";
import { DrawIcon } from "./icons";

/** Where and on what the menu was opened. Client coordinates place the menu; `local` is chart-local (for paste). */
export interface ChartMenuState {
  clientX: number;
  clientY: number;
  local: { x: number; y: number } | null;
  /** Drawing under the pointer (it is already selected), or null for empty chart space. */
  drawingId: string | null;
  /** Price and time under the pointer when it is over the main pane. */
  price: number | null;
  priceText: string;
  time: number | null;
}

interface Props {
  state: ChartMenuState | null;
  controller: DrawingsController;
  onClose: () => void;
  onResetView: () => void;
  /** Download the loaded candles as CSV. */
  onExportCsv?: () => void;
  onAlertAtPrice?: (price: number) => void;
  /** Alert that follows the selected line (same path as the style bar button). */
  onCreateAlertFromDrawing?: () => void;
  /** Provided by the chart settings work; the entry is hidden when absent. */
  onOpenChartSettings?: () => void;
  /** Economic calendar events on the chart: current state and the switch (entry hidden when absent). */
  eventsOn?: boolean;
  onToggleEvents?: () => void;
}

const ALERT_TOOLS = new Set<string>(ALERT_LINE_TOOLS);
const MARGIN = 8;

function Item({
  label,
  shortcut,
  onClick,
  disabled,
  danger,
  icon,
  arrow,
  onEnter,
  active,
}: {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  arrow?: boolean;
  onEnter?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onEnter}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] leading-none outline-none transition-colors disabled:cursor-default disabled:opacity-40 ${
        danger ? "text-[var(--tv3-down)]" : "text-[var(--tv3-text)]"
      } ${active ? "bg-[var(--tv3-fill)]" : ""} enabled:hover:bg-[var(--tv3-fill)] enabled:focus-visible:bg-[var(--tv3-fill)]`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--tv3-muted)]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && <span className="shrink-0 pl-4 text-[11px] text-[var(--tv3-muted)]">{shortcut}</span>}
      {arrow && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[var(--tv3-muted)]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}

const Sep = () => <div role="separator" className="my-1 h-px bg-[var(--tv3-hair)]" />;

export default function ChartContextMenu({ state, controller, onClose, onResetView, onExportCsv, onAlertAtPrice, onCreateAlertFromDrawing, onOpenChartSettings, eventsOn, onToggleEvents }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [flip, setFlip] = useState(false);

  // place inside the viewport once the size is known
  useLayoutEffect(() => {
    setOrderOpen(false);
    if (!state) {
      setPos(null);
      return;
    }
    const el = ref.current;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 300;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = state.clientX;
    let top = state.clientY;
    if (left + w + MARGIN > vw) left = Math.max(MARGIN, vw - w - MARGIN);
    if (top + h + MARGIN > vh) top = Math.max(MARGIN, state.clientY - h);
    if (top < MARGIN) top = MARGIN;
    setPos({ left, top });
    setFlip(left + w + 230 > vw);
  }, [state]);

  // close on outside press, Escape, scroll, resize
  useEffect(() => {
    if (!state) return;
    const inside = (e: Event) => !!ref.current && e.target instanceof Node && ref.current.contains(e.target);
    const onDown = (e: Event) => {
      if (!inside(e)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const onScroll = (e: Event) => {
      if (!inside(e)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("wheel", onScroll, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("wheel", onScroll, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [state, onClose]);

  // keyboard: arrows move between entries
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  const info = useMemo(() => {
    if (!state) return null;
    const sel = controller.getSelection();
    const ids = controller.getSelectedIds();
    return { sel, count: ids.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, controller]);

  if (!state) return null;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const onDrawing = !!state.drawingId && !!info?.sel;
  const sel = info?.sel ?? null;
  const many = (info?.count ?? 0) > 1;
  const canPaste = controller.hasClipboard();
  const pasteAt = state.local;
  const hasHidden = controller.hasHiddenDrawings();

  const orderItems: [ZOrderMode, string][] = [
    ["front", "cm.front"],
    ["forward", "cm.forward"],
    ["backward", "cm.backward"],
    ["back", "cm.back"],
  ];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("cm.menu")}
      onKeyDown={onMenuKey}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", left: pos?.left ?? state.clientX, top: pos?.top ?? state.clientY, visibility: pos ? "visible" : "hidden" }}
      className="z-[80] min-w-[230px] max-w-[92vw] select-none rounded-xl bg-[var(--tv3-card)] p-1 text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
    >
      {onDrawing && sel ? (
        <>
          {many && <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)]">{t("cm.selectedN", { n: info?.count ?? 0 })}</div>}
          {!many && (
            <Item label={t("cm.settings")} onClick={run(() => controller.openSettings(sel.id))} />
          )}
          <Item label={t("cm.clone")} shortcut="Ctrl+D" icon={<DrawIcon id="clone" size={16} />} onClick={run(() => controller.cloneSelected())} />
          <Item label={t("cm.copy")} shortcut="Ctrl+C" onClick={run(() => controller.copySelected())} />
          <Item label={t("cm.paste")} shortcut="Ctrl+V" disabled={!canPaste} onClick={run(() => controller.paste(pasteAt))} />
          <Sep />
          <Item
            label={sel.locked ? t("cm.unlock") : t("cm.lock")}
            icon={<DrawIcon id={sel.locked ? "unlock" : "lock"} size={16} />}
            onClick={run(() => controller.toggleSelectedLock())}
          />
          <Item label={t("cm.hide")} icon={<DrawIcon id="eyeOff" size={16} />} onClick={run(() => controller.toggleSelectedHidden())} />
          <div className="relative">
            <Item label={t("cm.order")} arrow active={orderOpen} onClick={() => setOrderOpen(true)} onEnter={() => setOrderOpen(true)} />
            {orderOpen && (
              <div
                role="menu"
                className={`absolute top-[-5px] z-10 min-w-[200px] rounded-xl bg-[var(--tv3-card)] p-1 shadow-[var(--tv3-shadow-pop)] ${flip ? "right-full mr-1" : "left-full ml-1"}`}
              >
                {orderItems.map(([mode, key]) => (
                  <Item key={mode} label={t(key)} onClick={run(() => controller.zOrder(sel.id, mode))} />
                ))}
              </div>
            )}
          </div>
          {!many && onCreateAlertFromDrawing && ALERT_TOOLS.has(sel.tool) && (
            <>
              <Sep />
              <Item label={t("cm.createAlert")} onClick={run(onCreateAlertFromDrawing)} />
            </>
          )}
          <Sep />
          <Item
            label={many ? t("cm.deleteN", { n: info?.count ?? 0 }) : t("cm.delete")}
            shortcut="Del"
            danger
            icon={<DrawIcon id="trash" size={16} />}
            onClick={run(() => controller.removeSelected())}
          />
        </>
      ) : (
        <>
          <Item label={t("cm.resetView")} onClick={run(onResetView)} />
          {onExportCsv && <Item label={t("cm.exportCsv")} onClick={run(onExportCsv)} />}
          {state.price !== null && onAlertAtPrice && (
            <Item label={t("cm.alertAt", { price: state.priceText })} shortcut="Alt+A" onClick={run(() => onAlertAtPrice(state.price as number))} />
          )}
          {state.price !== null && state.time !== null && (
            <Item
              label={t("cm.hlineAt", { price: state.priceText })}
              onClick={run(() => {
                controller.addDrawing("hline", [{ t: state.time as number, p: state.price as number }]);
              })}
            />
          )}
          <Sep />
          <Item label={t("cm.paste")} shortcut="Ctrl+V" disabled={!canPaste} onClick={run(() => controller.paste(pasteAt))} />
          <Sep />
          <Item
            label={controller.isHidden() ? t("cm.showAll") : t("cm.hideAll")}
            icon={<DrawIcon id={controller.isHidden() ? "eye" : "eyeOff"} size={16} />}
            disabled={controller.getDrawingsCount() === 0}
            onClick={run(() => controller.setHidden(!controller.isHidden()))}
          />
          {hasHidden && <Item label={t("cm.showHidden")} icon={<DrawIcon id="eye" size={16} />} onClick={run(() => controller.showAllHidden())} />}
          <Item
            label={t("cm.removeAll")}
            danger
            icon={<DrawIcon id="trash" size={16} />}
            disabled={controller.getDrawingsCount() === 0}
            onClick={run(() => {
              if (window.confirm(t("cm.removeAllConfirm"))) controller.removeAll();
            })}
          />
          {onToggleEvents && (
            <>
              <Sep />
              <Item
                label={t("ec.chart.show")}
                icon={eventsOn ? <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--tv3-accent)]" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : undefined}
                onClick={run(onToggleEvents)}
              />
            </>
          )}
          {onOpenChartSettings && (
            <>
              <Sep />
              <Item label={t("cm.chartSettings")} onClick={run(onOpenChartSettings)} />
            </>
          )}
        </>
      )}
    </div>
  );
}
