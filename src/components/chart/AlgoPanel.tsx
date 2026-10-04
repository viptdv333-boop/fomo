"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { hi2Band } from "@/lib/algopack-parse";
import type { TerminalInstrument } from "@/lib/terminal-data";

/* ALGOPACK tab of the right panel: the instrument's Mega Alerts (type, direction, price) and the latest HI2 market
   concentration. MOEX ALGOPACK Promo data — the server serves them to entitled requesters only (admins unless
   ALGOPACK_PUBLIC=1); everyone else sees a note. Times are the exchange's Moscow wall clock. */

interface Alert {
  w: number;
  type: string;
  dir: 1 | -1 | 0;
  thr: number | null;
  val: number | null;
  price?: number | null;
  ref?: Partial<Record<"m5" | "m15" | "m30" | "h1", (number | null)[]>>;
}
interface Hi2 {
  metrics: string[];
  rows: [number, number, number][];
}
type St = "loading" | "ok" | "denied" | "unsupported" | "error";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (w: number) => {
  const d = new Date(w);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const ddmm = (w: number) => {
  const d = new Date(w);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`;
};
const isoDay = (w: number) => new Date(w).toISOString().slice(0, 10);
const fmtN = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}K`;
  return String(+v.toFixed(a < 10 ? 3 : 1));
};
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}`);
const mskFrom = (days: number) => new Date(Date.now() + 3 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);

async function getJson(url: string): Promise<{ status: number; j: any } | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return { status: res.status, j: await res.json().catch(() => null) };
  } catch {
    return null;
  }
}

function stateOf(r: { status: number; j: any } | null): St {
  if (!r) return "error";
  if (r.status === 403 || r.status === 404) return "denied";
  if (r.j?.ok) return "ok";
  if (/unsupported|unknown-instrument|eq-fo-only|bad-ticker/.test(String(r.j?.reason ?? ""))) return "unsupported";
  return "error";
}

export default function AlgoPanel({ inst, visible }: { inst: TerminalInstrument; visible: boolean }) {
  const { t } = useT();
  const { status: sessionStatus } = useSession();
  const isMoex = inst.source === "moex";
  const ticker = inst.dataTicker;
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [alertsSt, setAlertsSt] = useState<St>("loading");
  const [hi2, setHi2] = useState<Hi2 | null>(null);
  const [hi2St, setHi2St] = useState<St>("loading");

  useEffect(() => {
    setAlerts(null);
    setAlertsSt("loading");
    if (!visible || !isMoex) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped) return;
      let delay = 30_000;
      if (!document.hidden) {
        const r = await getJson(`/api/algopack/alerts?ticker=${encodeURIComponent(ticker)}&from=${mskFrom(5)}`);
        if (stopped) return;
        const st = stateOf(r);
        setAlertsSt(st);
        if (st === "ok") setAlerts(Array.isArray(r!.j.alerts) ? r!.j.alerts.slice().reverse() : []);
        else delay = st === "denied" || st === "unsupported" ? 120_000 : 60_000;
      }
      timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [visible, isMoex, ticker]);

  useEffect(() => {
    setHi2(null);
    setHi2St("loading");
    if (!visible || !isMoex) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped) return;
      let delay = 10 * 60_000;
      if (!document.hidden) {
        const r = await getJson(`/api/algopack/hi2?ticker=${encodeURIComponent(ticker)}&from=${mskFrom(10)}`);
        if (stopped) return;
        const st = stateOf(r);
        setHi2St(st);
        if (st === "ok") setHi2({ metrics: r!.j.metrics ?? [], rows: r!.j.rows ?? [] });
        else delay = st === "denied" || st === "unsupported" ? 10 * 60_000 : 2 * 60_000;
      }
      timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [visible, isMoex, ticker]);

  if (!isMoex) return <div className="flex-1 flex items-center justify-center px-6 text-center text-xs text-[var(--tv3-muted)]">{t("ap.panel.moexOnly")}</div>;
  if (alertsSt === "denied" || hi2St === "denied") return <div className="flex-1 flex items-center justify-center px-6 text-center text-xs text-[var(--tv3-muted)]" data-testid="algo-note">{t(sessionStatus === "unauthenticated" ? "dg.guestOnly" : "ap.panel.denied")}</div>;
  if (alertsSt === "unsupported" && hi2St === "unsupported") return <div className="flex-1 flex items-center justify-center px-6 text-center text-xs text-[var(--tv3-muted)]">{t("ap.panel.unsupported")}</div>;

  // HI2: the latest trading day, one row per metric
  let hiDay = "";
  const hiRows: { metric: string; value: number }[] = [];
  if (hi2 && hi2.rows.length) {
    const lastW = hi2.rows[hi2.rows.length - 1][0];
    hiDay = isoDay(lastW);
    for (const [w, mi, v] of hi2.rows) if (w === lastW) hiRows.push({ metric: hi2.metrics[mi], value: v });
  }
  const bandCls = { low: "bg-green-500/15 text-[var(--tv3-up)]", moderate: "bg-amber-500/15 text-amber-500", high: "bg-red-500/15 text-[var(--tv3-down)]" } as const;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" data-testid="algo-panel">
      {/* Mega Alerts */}
      <h3 className="px-3 pt-3 pb-1 text-[12px] font-semibold uppercase text-[var(--tv3-muted)]">{t("ap.panel.alerts")}</h3>
      {alertsSt === "loading" && <p className="px-3 py-2 text-xs text-[var(--tv3-muted)]">{t("ap.panel.loading")}</p>}
      {alertsSt === "error" && <p className="px-3 py-2 text-xs text-[var(--tv3-muted)]">{t("ap.panel.error")}</p>}
      {alertsSt === "unsupported" && <p className="px-3 py-2 text-xs text-[var(--tv3-muted)]">{t("ap.panel.unsupported")}</p>}
      {alertsSt === "ok" && alerts && alerts.length === 0 && <p className="px-3 py-2 text-xs text-[var(--tv3-muted)]">{t("ap.panel.alertsEmpty")}</p>}
      {alertsSt === "ok" && alerts && alerts.length > 0 && (
        <ul className="px-1" data-testid="algo-alerts">
          {alerts.slice(0, 60).map((a, i) => {
            const c = a.dir > 0 ? "text-[var(--tv3-up)]" : a.dir < 0 ? "text-[var(--tv3-down)]" : "text-amber-500";
            const r = a.ref;
            const tip = r?.m5 || r?.h1 ? t("ap.panel.ref", { m5: pct(r?.m5?.[4] ?? null), m15: pct(r?.m15?.[4] ?? null), h1: pct(r?.h1?.[4] ?? null) }) : undefined;
            const label = t(`ap.al.${a.type}`);
            return (
              <li key={`${a.w}${a.type}${i}`} title={tip} className="flex items-start gap-2 rounded-[10px] px-2 py-1.5 text-xs hover:bg-[var(--tv3-fill3)]">
                <span className={`mt-px w-3 shrink-0 text-center ${c}`}>{a.dir > 0 ? "▲" : a.dir < 0 ? "▼" : "◆"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug text-[var(--tv3-text)]">{label === `ap.al.${a.type}` ? a.type : label}</span>
                  <span className="block text-[10px] text-[var(--tv3-muted)]">
                    {ddmm(a.w)} {hhmm(a.w)}
                    {a.val !== null && ` · ${t("ap.panel.value")} ${fmtN(a.val)}`}
                    {a.thr !== null && ` · ${t("ap.panel.threshold")} ${fmtN(a.thr)}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-[var(--tv3-text2)]">{a.price != null ? fmtN(a.price) : ""}</span>
              </li>
            );
          })}
        </ul>
      )}

      {/* HI2 */}
      <h3 className="px-3 pt-4 pb-1 text-[12px] font-semibold uppercase text-[var(--tv3-muted)]">
        {t("ap.panel.hi2")}
        {hiDay && <span className="ml-2 font-normal normal-case text-[var(--tv3-muted)]">{t("ap.hi2.date", { date: hiDay })}</span>}
      </h3>
      {hi2St === "loading" && <p className="px-3 py-2 text-xs text-[var(--tv3-muted)]">{t("ap.panel.loading")}</p>}
      {hi2St === "error" && <p className="px-3 py-2 text-xs text-[var(--tv3-muted)]">{t("ap.panel.error")}</p>}
      {hi2St === "ok" && hiRows.length === 0 && <p className="px-3 py-2 text-xs text-[var(--tv3-muted)]">{t("ap.panel.hi2Empty")}</p>}
      {hiRows.length > 0 && (
        <table className="mb-3 w-full text-xs" data-testid="algo-hi2">
          <tbody>
            {hiRows.map((r) => {
              const band = hi2Band(r.value);
              return (
                <tr key={r.metric} className="border-t border-[var(--tv3-hair2)]">
                  <td className="px-3 py-1.5 text-[var(--tv3-text2)]">{r.metric}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-[var(--tv3-text)]">{Math.round(r.value)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${bandCls[band]}`}>{t(`ap.hi2.${band}`)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
