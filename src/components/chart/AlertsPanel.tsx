"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { alertLevel } from "@/lib/alerts/evaluate";
import { fmtPrice } from "@/lib/terminal-data";
import { useAlerts, type AlertItem, type AlertsApi } from "./useAlerts";

/** iOS-like switch (green when on). */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-[26px] w-[42px] shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-50 ${on ? "bg-[var(--tv3-on)]" : "bg-[var(--tv3-fill2)]"}`}
    >
      <span className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-[2px]"}`} style={{ boxShadow: "var(--tv3-shadow-tiny)" }} />
    </button>
  );
}

/** The ОПОВЕЩЕНИЯ tab of the right panel: «+ Создать», «Изменить», one row per alert with a switch. The create form is the alerts dialog. */
export function AlertsPanelView({ api, symbol, onCreate }: { api: AlertsApi; symbol: { source: string; dataTicker: string }; onCreate: () => void }) {
  const { t, locale } = useT();
  const [edit, setEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const rank: Record<string, number> = { active: 0, paused: 1, triggered: 2, expired: 3 };
    const here = (a: AlertItem) => (a.source === symbol.source && a.dataTicker === symbol.dataTicker ? 0 : 1);
    return [...api.alerts].sort((a, b) => here(a) - here(b) || rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
  }, [api.alerts, symbol.source, symbol.dataTicker]);

  if (api.guest) {
    return (
      <div className="px-2 py-3 text-[14px] leading-snug text-[var(--tv3-text2)]">
        <p>{t("alerts.signIn")}</p>
        <Link href="/login" className="mt-3 inline-block rounded-[10px] bg-[var(--tv3-accent)] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[var(--tv3-accent-hover)]">
          {t("nav.login")}
        </Link>
      </div>
    );
  }

  const act = async (p: Promise<{ ok: boolean } & { error?: string }>) => {
    const res = await p;
    setError(res.ok ? null : res.error === "limit" ? t("alerts.limit") : t("alerts.error"));
  };

  const describe = (a: AlertItem) => {
    const cond = t(`alerts.cond.${a.condition}`);
    if (a.kind === "line") {
      const lv = alertLevel(a, Date.now());
      return `${t("alerts.line", { tool: t(`alerts.tool.${a.line?.tool ?? "trend"}`) })}${lv.state === "ok" ? ` (${fmtPrice(lv.level, locale)})` : ""}`;
    }
    return `${cond} ${fmtPrice(a.price ?? 0, locale)}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-2 pt-0.5 text-[14px] font-semibold">
        <button type="button" onClick={onCreate} className="cursor-pointer text-[var(--tv3-accent)] hover:text-[var(--tv3-accent-hover)]">
          {t("p3.alerts.new")}
        </button>
        {rows.length > 0 && (
          <button type="button" onClick={() => setEdit((v) => !v)} className="cursor-pointer text-[var(--tv3-accent)] hover:text-[var(--tv3-accent-hover)]">
            {edit ? t("p3.alerts.done") : t("p3.alerts.edit")}
          </button>
        )}
      </div>
      {api.loading && rows.length === 0 && <p className="px-2 py-2.5 text-[14px] text-[var(--tv3-muted)]">{t("alerts.loading")}</p>}
      {!api.loading && rows.length === 0 && (
        <div className="px-2 py-2.5 text-[14px] leading-snug text-[var(--tv3-muted)]">
          <p>{t("alerts.empty")}</p>
          <p className="mt-1 text-[12px]">{t("alerts.emptyHint")}</p>
        </div>
      )}
      {rows.map((a) => (
        <div key={a.id} className="flex items-center gap-2.5 px-2 py-[9px]">
          {edit && (
            <button
              type="button"
              onClick={() => act(api.remove(a.id))}
              title={t("p3.alerts.remove")}
              aria-label={t("p3.alerts.remove")}
              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--tv3-red)]"
            >
              <span className="block h-[2px] w-[9px] bg-white" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-[var(--tv3-text)]">{a.ticker}</div>
            <div className="truncate text-[12px] text-[var(--tv3-muted)]">
              {describe(a)}
              {a.status !== "active" && a.status !== "paused" && <span> · {t(`alerts.status.${a.status}`)}</span>}
            </div>
          </div>
          <Switch on={a.status === "active"} label={t("p3.alerts.toggle")} onChange={() => act(api.update(a.id, { status: a.status === "active" ? "paused" : "active" }))} />
        </div>
      ))}
      {error && <p className="px-2 py-2 text-[12px] text-[var(--tv3-down)]">{error}</p>}
    </div>
  );
}

/** Own alerts state, for a host that does not share the dialog's one. */
export function OwnAlertsPanel({ symbol, onCreate }: { symbol: { source: string; dataTicker: string }; onCreate: () => void }) {
  const api = useAlerts();
  return <AlertsPanelView api={api} symbol={symbol} onCreate={onCreate} />;
}
