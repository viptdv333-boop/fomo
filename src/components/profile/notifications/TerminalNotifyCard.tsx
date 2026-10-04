"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { COOLDOWN_OPTIONS, EXPIRY_OPTIONS, REMINDER_LEAD_OPTIONS, type TerminalNotifyDefaults } from "@/lib/terminal-alert-defaults";
import { saveTerminalNotifyDefaults, useTerminalNotifyDefaults } from "@/lib/terminal-alert-defaults-client";
import { Switch } from "./ui";

const fieldCls = "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

/**
 * Profile → Notifications → «Терминал»: what NEW terminal alerts start from (frequency, cooldown, lifetime), whether the
 * terminal beeps / pops up when an alert fires while it is open, and the default lead time of a calendar reminder.
 * Saved on change (per account, with the other terminal data). Where the alerts are DELIVERED (bell, push, e-mail,
 * Telegram ...) is the matrix above: rows «Достижение цены», «Касание линий и уровней», «Напоминания о событиях календаря».
 */
export default function TerminalNotifyCard() {
  const { t } = useT();
  const d = useTerminalNotifyDefaults();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function change(patch: Partial<TerminalNotifyDefaults>) {
    setState("saving");
    const ok = await saveTerminalNotifyDefaults(patch);
    if (alive.current) setState(ok ? "saved" : "error");
  }

  const cd = (m: number) => (m >= 60 ? t("alerts.cd.hour") : t("alerts.cd.min", { min: m }));
  const lead = (m: number) => (m === 0 ? t("calrem.lead.0") : m === 60 ? t("calrem.lead.60") : t("calrem.lead.n", { min: m }));
  const exp = (days: number) => t(days === 0 ? "alerts.exp.none" : `alerts.exp.${days}d`);

  const row = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3";
  const label = "min-w-0 flex-1 basis-56";

  return (
    <section className="rounded-xl bg-white p-4 shadow dark:bg-gray-900 sm:p-6" aria-labelledby="ns-term-title" data-testid="ns-terminal-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="ns-term-title" className="text-lg font-bold dark:text-gray-100">{t("ns.term.title")}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("ns.term.desc")}</p>
        </div>
        <span role="status" aria-live="polite" className={`pt-1 text-xs ${state === "error" ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
          {state === "saving" ? t("ns.matrix.saving") : state === "saved" ? t("ns.matrix.saved") : state === "error" ? t("ns.matrix.saveFailed") : ""}
        </span>
      </div>

      <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
        <div className={row}>
          <div className={label}>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t("ns.term.trigger")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("ns.term.trigger.d")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={t("ns.term.trigger")} className={fieldCls} value={d.repeat ? "repeat" : "once"} onChange={(e) => void change({ repeat: e.target.value === "repeat" })}>
              <option value="once">{t("alerts.once")}</option>
              <option value="repeat">{t("alerts.repeat")}</option>
            </select>
            {d.repeat && (
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {t("alerts.cooldown")}
                <select className={fieldCls} value={d.cooldownMin} onChange={(e) => void change({ cooldownMin: Number(e.target.value) })}>
                  {COOLDOWN_OPTIONS.map((m) => (
                    <option key={m} value={m}>{cd(m)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className={row}>
          <div className={label}>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t("ns.term.expiry")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("ns.term.expiry.d")}</div>
          </div>
          <select aria-label={t("ns.term.expiry")} className={fieldCls} value={d.expiryDays} onChange={(e) => void change({ expiryDays: Number(e.target.value) })}>
            {EXPIRY_OPTIONS.map((days) => (
              <option key={days} value={days}>{exp(days)}</option>
            ))}
          </select>
        </div>

        <div className={row}>
          <div className={label}>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t("ns.term.sound")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("ns.term.sound.d")}</div>
          </div>
          <Switch checked={d.sound} label={t("ns.term.sound")} onChange={(v) => void change({ sound: v })} />
        </div>

        <div className={row}>
          <div className={label}>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t("ns.term.popup")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("ns.term.popup.d")}</div>
          </div>
          <Switch checked={d.popup} label={t("ns.term.popup")} onChange={(v) => void change({ popup: v })} />
        </div>

        <div className={row}>
          <div className={label}>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t("ns.term.lead")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("ns.term.lead.d")}</div>
          </div>
          <select aria-label={t("ns.term.lead")} className={fieldCls} value={d.reminderLeadMin} onChange={(e) => void change({ reminderLeadMin: Number(e.target.value) })}>
            {REMINDER_LEAD_OPTIONS.map((m) => (
              <option key={m} value={m}>{lead(m)}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t("ns.term.foot")}</p>
    </section>
  );
}
