"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { addIndAlert, loadIndAlerts, removeIndAlert, stepIndAlert, subscribeIndAlerts, updateIndAlert, type IndAlert, type IndCondition } from "@/lib/chart/indicator-alerts";
import { useTerminalNotifyDefaults } from "@/lib/terminal-alert-defaults-client";
import ModalPortal from "./ModalPortal";

/* Alerts on indicator values (RSI = 20 ...): the terminal's own, checked here on the values this terminal computes (see lib/chart/indicator-alerts.ts). */

export interface Fired {
  key: string;
  alert: IndAlert;
  value: number;
}

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.start();
    setTimeout(() => {
      o.stop();
      void ctx.close();
    }, 320);
  } catch {
    /* no audio */
  }
}

/** The alerts of this device (all symbols) and the check of the ones of the symbol on the chart; `fired` collects what has just triggered. */
export function useIndicatorAlerts(controller: IndicatorsController, source: string, dataTicker: string, active: boolean) {
  const [all, setAll] = useState<IndAlert[]>([]);
  const [fired, setFired] = useState<Fired[]>([]);
  const td = useTerminalNotifyDefaults();
  const soundRef = useRef(td.sound);
  soundRef.current = td.sound;

  useEffect(() => {
    const read = () => setAll(loadIndAlerts());
    read();
    return subscribeIndAlerts(read);
  }, []);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const mine = loadIndAlerts().filter((a) => a.status === "active" && a.source === source && a.dataTicker === dataTicker);
      if (mine.length === 0) return;
      const values = controller.indicatorValues();
      const now = Date.now();
      for (const a of mine) {
        const hit = values.find((v) => v.id === a.indId)?.plots ?? [];
        const plot = hit.find((p) => p.name === a.plot) ?? (values.find((v) => v.id === a.indId)?.plots.find((p) => p.name.endsWith(a.plot)) ?? null);
        if (!plot) continue;
        const r = stepIndAlert(a, plot.value, now);
        if (r.patch) updateIndAlert(a.id, r.patch);
        if (r.triggered) {
          setFired((f) => [{ key: `${a.id}:${now}`, alert: a, value: plot.value }, ...f].slice(0, 5));
          if (soundRef.current) beep();
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(`${a.ticker} · ${a.plot}`, { body: a.message || `${a.plot} ${plot.value}` });
          } catch {
            /* not allowed */
          }
        }
      }
    };
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [controller, source, dataTicker, active]);

  const here = useMemo(() => all.filter((a) => a.source === source && a.dataTicker === dataTicker), [all, source, dataTicker]);
  const dismiss = useCallback((key: string) => setFired((f) => f.filter((x) => x.key !== key)), []);
  return { all, here, fired, dismiss };
}

/** What has just triggered: a card in the corner, closed by a tap (it also goes by itself). */
export function IndicatorAlertToasts({ fired, onDismiss }: { fired: Fired[]; onDismiss: (key: string) => void }) {
  useEffect(() => {
    if (fired.length === 0) return;
    const timers = fired.map((f) => setTimeout(() => onDismiss(f.key), 12_000));
    return () => timers.forEach(clearTimeout);
  }, [fired, onDismiss]);
  if (fired.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[300] flex w-[min(340px,calc(100vw-24px))] flex-col gap-2" role="status">
      {fired.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onDismiss(f.key)}
          className="pointer-events-auto rounded-2xl bg-[var(--tv3-card,#1c1c1e)] px-3.5 py-2.5 text-left text-[var(--tv3-text,#fff)] shadow-[0_8px_30px_rgba(0,0,0,.35)]"
          style={{ borderLeft: "4px solid #cc9446" }}
        >
          <div className="text-[13.5px] font-bold">
            {f.alert.ticker} · {f.alert.plot}
          </div>
          <div className="text-[13px] opacity-80">{f.alert.message || `${f.value}`}</div>
        </button>
      ))}
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  controller: IndicatorsController;
  source: string;
  dataTicker: string;
  ticker: string;
  /** an indicator of the chart picked from its row (the form starts on it) */
  presetUid?: string | null;
  /** an alert to edit (a double click on its line) */
  editId?: string | null;
}

/** Create / edit / delete the alerts on indicator values of the symbol on the chart. */
export function IndicatorAlertDialog({ open, onClose, controller, source, dataTicker, ticker, presetUid, editId }: DialogProps) {
  const { t } = useT();
  const [alerts, setAlerts] = useState<IndAlert[]>([]);
  useEffect(() => {
    if (!open) return;
    const read = () => setAlerts(loadIndAlerts().filter((a) => a.source === source && a.dataTicker === dataTicker));
    read();
    return subscribeIndAlerts(read);
  }, [open, source, dataTicker]);

  const values = open ? controller.indicatorValues() : [];
  const editing = editId ? alerts.find((a) => a.id === editId) ?? null : null;

  const [uid, setUid] = useState("");
  const [plotName, setPlotName] = useState("");
  const [cond, setCond] = useState<IndCondition>("cross");
  const [level, setLevel] = useState("");
  const [message, setMessage] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [err, setErr] = useState(false);

  // the form starts on the picked indicator (or the one of the alert that is edited, or the first one that has a number)
  useEffect(() => {
    if (!open) return;
    setErr(false);
    if (editing) {
      const inst = values.find((v) => v.id === editing.indId);
      setUid(inst?.uid ?? "");
      setPlotName(editing.plot);
      setCond(editing.condition);
      setLevel(String(editing.level));
      setMessage(editing.message);
      setRepeat(editing.repeat);
      return;
    }
    const first = values.find((v) => v.uid === presetUid) ?? values[0];
    setUid(first?.uid ?? "");
    setPlotName(first?.plots[0]?.name ?? "");
    setCond("cross");
    setLevel(first?.plots[0] ? String(Number(first.plots[0].value.toPrecision(4))) : "");
    setMessage("");
    setRepeat(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetUid, editId]);

  if (!open) return null;
  const inst = values.find((v) => v.uid === uid);
  const plots = inst?.plots ?? [];

  const save = () => {
    const lv = Number(level.replace(",", "."));
    if (!inst || !Number.isFinite(lv) || !plotName) {
      setErr(true);
      return;
    }
    if (editing) {
      updateIndAlert(editing.id, { level: lv, condition: cond, message, repeat, plot: plotName, indId: inst.id, title: inst.title, status: "active", lastSide: 0 });
    } else {
      addIndAlert({ source, dataTicker, ticker, indId: inst.id, plot: plotName, title: inst.title, level: lv, condition: cond, message, repeat });
    }
    onClose();
  };

  const field = "h-9 w-full rounded-lg bg-[var(--tv3-fill)] px-2.5 text-[14px] text-[var(--tv3-text)] outline-none focus:ring-2 focus:ring-[var(--tv3-accent)]";
  const lbl = "mb-1 block text-[12px] font-semibold text-[var(--tv3-muted)]";
  const btn = "tv3-press h-9 rounded-lg px-3.5 text-[14px] font-semibold cursor-pointer";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-3 bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-label={t("indal.title")} className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--tv3-hair)] px-4 py-3">
            <h2 className="text-[15px] font-bold">
              {t("indal.title")} · {ticker}
            </h2>
            <button type="button" onClick={onClose} className={`${btn} bg-[var(--tv3-fill)]`}>
              {t("alerts.qe.cancel")}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {values.length === 0 ? (
              <div className="py-6 text-center text-[13.5px] text-[var(--tv3-muted)]">{t("indal.noInd")}</div>
            ) : (
              <>
                <label className="mb-2.5 block">
                  <span className={lbl}>{t("indal.indicator")}</span>
                  <select
                    className={field}
                    value={uid}
                    onChange={(e) => {
                      setUid(e.target.value);
                      const v = values.find((x) => x.uid === e.target.value);
                      setPlotName(v?.plots[0]?.name ?? "");
                      if (v?.plots[0]) setLevel(String(Number(v.plots[0].value.toPrecision(4))));
                    }}
                  >
                    {values.map((v) => (
                      <option key={v.uid} value={v.uid}>
                        {v.title}
                      </option>
                    ))}
                  </select>
                </label>
                {plots.length > 1 && (
                  <label className="mb-2.5 block">
                    <span className={lbl}>{t("indal.line")}</span>
                    <select className={field} value={plotName} onChange={(e) => setPlotName(e.target.value)}>
                      {plots.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} · {Number(p.value.toPrecision(5))}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="mb-2.5 grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className={lbl}>{t("alerts.cond.cross")}</span>
                    <select className={field} value={cond} onChange={(e) => setCond(e.target.value as IndCondition)}>
                      <option value="cross">{t("alerts.cond.cross")}</option>
                      <option value="up">{t("alerts.cond.up")}</option>
                      <option value="down">{t("alerts.cond.down")}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={lbl}>{t("indal.level")}</span>
                    <input className={field} inputMode="decimal" value={level} onChange={(e) => (setLevel(e.target.value), setErr(false))} />
                  </label>
                </div>
                <label className="mb-2.5 block">
                  <span className={lbl}>{t("alerts.message")}</span>
                  <input className={field} value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} />
                </label>
                <label className="mb-3 flex items-center gap-2 text-[14px]">
                  <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                  {t("alerts.repeat")}
                </label>
                {err && <div className="mb-2 text-[12.5px] text-red-500">{t("alerts.qe.failed")}</div>}
                <div className="mb-1 flex justify-end gap-2">
                  {editing && (
                    <button
                      type="button"
                      className={`${btn} mr-auto text-red-500 hover:bg-[var(--tv3-fill)]`}
                      onClick={() => {
                        removeIndAlert(editing.id);
                        onClose();
                      }}
                    >
                      {t("alerts.delete")}
                    </button>
                  )}
                  <button type="button" className={`${btn} bg-[var(--tv3-accent)] text-white`} onClick={save}>
                    {editing ? t("alerts.qe.save") : t("alerts.save")}
                  </button>
                </div>
                <div className="mt-1 text-[12px] text-[var(--tv3-muted)]">{t("indal.hint")}</div>
              </>
            )}

            {alerts.length > 0 && (
              <div className="mt-4 border-t border-[var(--tv3-hair)] pt-3">
                <div className={lbl}>{t("indal.list")}</div>
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 py-1.5 text-[13.5px]">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${a.status === "active" ? "bg-[#4f9a74]" : "bg-[var(--tv3-muted)]"}`} />
                    <span className="min-w-0 flex-1 truncate">
                      {a.plot} · {a.condition === "up" ? "↑" : a.condition === "down" ? "↓" : "↕"} {a.level}
                    </span>
                    {a.status !== "active" && (
                      <button type="button" className="text-[var(--tv3-accent)] font-semibold" onClick={() => updateIndAlert(a.id, { status: "active", lastSide: 0 })}>
                        {t("indal.rearm")}
                      </button>
                    )}
                    <button type="button" className="text-red-500 font-semibold" onClick={() => removeIndAlert(a.id)}>
                      {t("alerts.delete")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
