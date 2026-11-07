"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { AlertItem, AlertPatch, AlertResult } from "./useAlerts";

interface Props {
  alert: AlertItem;
  /** where the double click was (viewport px): the pop-up opens next to it */
  x: number;
  y: number;
  locked: boolean;
  onLock: (v: boolean) => void;
  onSave: (id: string, patch: AlertPatch) => Promise<AlertResult>;
  onDelete: (id: string) => Promise<AlertResult>;
  onClose: () => void;
}

const W = 280;

/** The pop-up of a double click on an alert's line: level, condition, message, repeat, the lock (a locked line cannot be dragged by mistake), delete. */
export default function AlertQuickEdit({ alert, x, y, locked, onLock, onSave, onDelete, onClose }: Props) {
  const { t } = useT();
  const [price, setPrice] = useState(alert.price !== null ? String(alert.price) : "");
  const [condition, setCondition] = useState(alert.condition);
  const [message, setMessage] = useState(alert.message ?? "");
  const [repeat, setRepeat] = useState(alert.repeat);
  const [lock, setLock] = useState(locked);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const isLine = alert.kind === "line";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.max(8, Math.min(x + 12, (typeof window !== "undefined" ? window.innerWidth : 1200) - W - 8));
  const top = Math.max(8, Math.min(y - 20, (typeof window !== "undefined" ? window.innerHeight : 800) - 360));

  const save = async () => {
    const patch: AlertPatch = {};
    if (!isLine) {
      const p = Number(price.replace(",", "."));
      if (!Number.isFinite(p) || p <= 0) {
        setErr(true);
        return;
      }
      if (p !== alert.price) patch.price = p;
    }
    if (condition !== alert.condition) patch.condition = condition;
    if (message !== (alert.message ?? "")) patch.message = message;
    if (repeat !== alert.repeat) patch.repeat = repeat;
    onLock(lock);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    const r = await onSave(alert.id, patch);
    setBusy(false);
    if (r.ok) onClose();
    else setErr(true);
  };

  const field = "h-8 w-full rounded-lg bg-[var(--tv3-fill)] px-2.5 text-[13px] text-[var(--tv3-text)] outline-none focus:ring-2 focus:ring-[var(--tv3-accent)]";
  const lbl = "mb-1 block text-[11.5px] font-semibold text-[var(--tv3-muted)]";
  const btn = "tv3-press h-8 rounded-lg px-3 text-[13px] font-semibold cursor-pointer disabled:opacity-50";

  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        ref={box}
        role="dialog"
        aria-label={t("alerts.title")}
        className="tv3 tv3-pop fixed z-[71] rounded-2xl p-3.5 text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
        style={{ left, top, width: W }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA" && void save()}
      >
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-bold">
            {alert.ticker} · {t("alerts.title")}
          </span>
          <button
            type="button"
            onClick={() => setLock((v) => !v)}
            aria-pressed={lock}
            title={t("alerts.qe.lock")}
            className={`tv3-press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold cursor-pointer ${lock ? "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]" : "bg-[var(--tv3-fill)] text-[var(--tv3-text2)]"}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              {lock ? <path d="M8 11V8a4 4 0 018 0v3" /> : <path d="M8 11V8a4 4 0 017.5-2" />}
            </svg>
            {t("alerts.qe.lockShort")}
          </button>
        </div>

        {!isLine && (
          <label className="mb-2 block">
            <span className={lbl}>{t("alerts.price")}</span>
            <input className={field} inputMode="decimal" value={price} onChange={(e) => (setPrice(e.target.value), setErr(false))} autoFocus />
          </label>
        )}
        <label className="mb-2 block">
          <span className={lbl}>{t("alerts.cond.cross")}</span>
          <select className={field} value={condition} onChange={(e) => setCondition(e.target.value as AlertItem["condition"])}>
            <option value="cross">{t("alerts.cond.cross")}</option>
            <option value="up">{t("alerts.cond.up")}</option>
            <option value="down">{t("alerts.cond.down")}</option>
          </select>
        </label>
        <label className="mb-2 block">
          <span className={lbl}>{t("alerts.message")}</span>
          <input className={field} value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="mb-3 flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          {t("alerts.repeat")}
        </label>

        {err && <div className="mb-2 text-[12px] text-red-500">{t("alerts.qe.failed")}</div>}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy}
            className={`${btn} text-red-500 hover:bg-[var(--tv3-fill)]`}
            onClick={async () => {
              setBusy(true);
              const r = await onDelete(alert.id);
              setBusy(false);
              if (r.ok) onClose();
              else setErr(true);
            }}
          >
            {t("alerts.delete")}
          </button>
          <div className="flex gap-2">
            <button type="button" className={`${btn} bg-[var(--tv3-fill)]`} onClick={onClose}>
              {t("alerts.qe.cancel")}
            </button>
            <button type="button" disabled={busy} className={`${btn} bg-[var(--tv3-accent)] text-white`} onClick={() => void save()}>
              {t("alerts.qe.save")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
