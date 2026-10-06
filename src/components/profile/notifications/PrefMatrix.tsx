"use client";

import { Fragment, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  CHANNEL_IDS,
  EVENTS,
  EVENT_GROUPS,
  channelAllowed,
  isEnabled,
  type ChannelId,
  type EventDef,
} from "@/lib/notification-events";
import type { SettingsResponse } from "@/lib/notify-settings-types";
import { ChannelIcon, Switch } from "./ui";

export interface Cell {
  event: string;
  channel: ChannelId;
  enabled: boolean;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  data: SettingsResponse;
  /** optimistic overrides (what the switches show) */
  overrides: Record<string, boolean>;
  onSetCells: (cells: Cell[]) => void;
  onReset: () => void;
  saveState: SaveState;
}

/** Is this channel able to receive anything right now? */
export function channelConnected(data: SettingsResponse, c: ChannelId): boolean {
  if (c === "inapp") return true;
  if (c === "webpush") return (data.webpush.configured && data.webpush.devices > 0) || (data.webpush.fcmConfigured && data.webpush.appDevices > 0);
  const st = data.channels.find((x) => x.channel === c);
  return Boolean(st && st.configured && st.verified && st.enabled);
}

export default function PrefMatrix({ data, overrides, onSetCells, onReset, saveState }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // The four everyday channels always have a column (site / app / e-mail / Telegram), even when not connected yet;
  // the rest appear once the admin has set them up (their card explains why otherwise).
  const columns = useMemo(
    () => CHANNEL_IDS.filter((c) => c === "inapp" || c === "webpush" || c === "email" || c === "telegram" || data.channels.find((x) => x.channel === c)?.configured),
    [data.channels]
  );
  const connected = useMemo(() => Object.fromEntries(columns.map((c) => [c, channelConnected(data, c)])) as Record<ChannelId, boolean>, [columns, data]);

  const chName = (c: ChannelId) => t(`ns.ch.${c}`);
  const evName = (e: EventDef) => t(e.labelKey);

  /** Editable = the event can use the channel, can be changed, and the channel is connected. */
  const editable = (e: EventDef, c: ChannelId) => !e.alwaysOn && channelAllowed(e.id, c) && connected[c];
  const value = (e: EventDef, c: ChannelId) => isEnabled(e.id, c, overrides);

  function rowCells(e: EventDef): ChannelId[] {
    return columns.filter((c) => editable(e, c));
  }
  function colEvents(c: ChannelId): EventDef[] {
    return EVENTS.filter((e) => editable(e, c));
  }
  function rowState(e: EventDef) {
    const cs = rowCells(e);
    const on = cs.filter((c) => value(e, c)).length;
    return { count: cs.length, checked: cs.length > 0 && on === cs.length, mixed: on > 0 && on < cs.length };
  }
  function colState(c: ChannelId) {
    const es = colEvents(c);
    const on = es.filter((e) => value(e, c)).length;
    return { count: es.length, checked: es.length > 0 && on === es.length, mixed: on > 0 && on < es.length };
  }
  function toggleRow(e: EventDef) {
    const s = rowState(e);
    onSetCells(rowCells(e).map((c) => ({ event: e.id, channel: c, enabled: !s.checked })));
  }
  function toggleCol(c: ChannelId) {
    const s = colState(c);
    onSetCells(colEvents(c).map((e) => ({ event: e.id, channel: c, enabled: !s.checked })));
  }

  const hint = (e: EventDef, c: ChannelId): string => {
    if (!channelAllowed(e.id, c)) return t("ns.matrix.notAvailable");
    if (e.alwaysOn && (c === "inapp" || c === "email")) return connected[c] ? t("ns.matrix.alwaysOn") : t("ns.matrix.notConnected");
    if (!connected[c]) return t("ns.matrix.notConnected");
    return t("ns.matrix.cell", { event: evName(e), channel: chName(c) });
  };

  const renderCell = (e: EventDef, c: ChannelId) => {
    if (!channelAllowed(e.id, c)) {
      return (
        <span className="text-gray-300 dark:text-gray-600" title={t("ns.matrix.notAvailable")} aria-label={t("ns.matrix.notAvailable")}>
          —
        </span>
      );
    }
    const label = t("ns.matrix.cell", { event: evName(e), channel: chName(c) });
    const can = editable(e, c);
    return (
      <Switch
        size="sm"
        checked={e.alwaysOn ? connected[c] : can ? value(e, c) : false}
        disabled={!can}
        label={label}
        title={hint(e, c)}
        onChange={(next) => onSetCells([{ event: e.id, channel: c, enabled: next }])}
      />
    );
  };

  const saveText =
    saveState === "saving" ? t("ns.matrix.saving") : saveState === "saved" ? t("ns.matrix.saved") : saveState === "error" ? t("ns.matrix.saveFailed") : "";

  return (
    <section className="rounded-xl bg-white p-4 shadow dark:bg-gray-900 sm:p-6" aria-labelledby="ns-matrix-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="ns-matrix-title" className="text-lg font-bold dark:text-gray-100">{t("ns.matrix.title")}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("ns.matrix.desc")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" aria-live="polite" className={`text-xs ${saveState === "error" ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
            {saveText}
          </span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t("ns.matrix.resetConfirm"))) onReset();
            }}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("ns.matrix.reset")}
          </button>
        </div>
      </div>

      {/* ≥ sm: the matrix */}
      <div className="hidden overflow-x-auto sm:block" data-testid="ns-matrix-table">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-white pb-2 pr-3 text-left text-xs font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <span className="sr-only">{t("ns.matrix.title")}</span>
              </th>
              <th scope="col" className="px-1 pb-2 text-center align-bottom">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">{t("ns.matrix.all")}</span>
              </th>
              {columns.map((c) => {
                const cs = colState(c);
                return (
                  <th key={c} scope="col" className="w-[52px] px-0.5 pb-2 text-center align-bottom">
                    <div className="flex flex-col items-center gap-1" title={chName(c)}>
                      <ChannelIcon channel={c} size={28} />
                      <span className="block max-w-[52px] truncate text-[10px] font-medium text-gray-600 dark:text-gray-300">{chName(c)}</span>
                      <Switch
                        size="sm"
                        checked={cs.checked}
                        mixed={cs.mixed}
                        disabled={cs.count === 0}
                        label={t("ns.matrix.masterCol", { channel: chName(c) })}
                        title={connected[c] ? t("ns.matrix.masterCol", { channel: chName(c) }) : t("ns.matrix.notConnected")}
                        onChange={() => toggleCol(c)}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {EVENT_GROUPS.map((g) => {
              const evs = EVENTS.filter((e) => e.group === g);
              return (
                <Fragment key={g}>
                  <tr>
                    <th colSpan={columns.length + 2} scope="colgroup" className="sticky left-0 border-t border-gray-100 pb-1 pt-4 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800">
                      {t(`ns.group.${g}`)}
                    </th>
                  </tr>
                  {evs.map((e) => {
                    const rs = rowState(e);
                    return (
                      <tr key={e.id} className="group">
                        <th scope="row" className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-normal dark:bg-gray-900">
                          <div className="font-medium text-gray-800 dark:text-gray-100">{evName(e)}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{t(e.descKey)}</div>
                        </th>
                        <td className="px-1 text-center">
                          {e.alwaysOn ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{t("ns.matrix.alwaysOn")}</span>
                          ) : (
                            <Switch
                              size="sm"
                              checked={rs.checked}
                              mixed={rs.mixed}
                              disabled={rs.count === 0}
                              label={t("ns.matrix.masterRow", { event: evName(e) })}
                              onChange={() => toggleRow(e)}
                            />
                          )}
                        </td>
                        {columns.map((c) => (
                          <td key={c} className="px-1 text-center">
                            <div className="flex justify-center">{renderCell(e, c)}</div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* < sm: one accordion per event, channels as chips */}
      <div className="sm:hidden" data-testid="ns-matrix-mobile">
        {EVENT_GROUPS.map((g) => (
          <div key={g} className="mb-3">
            <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t(`ns.group.${g}`)}</h4>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
              {EVENTS.filter((e) => e.group === g).map((e) => {
                const rs = rowState(e);
                const expanded = Boolean(open[e.id]);
                const panelId = `ns-ev-${e.id}`;
                const activeCount = columns.filter((c) => channelAllowed(e.id, c) && (e.alwaysOn ? connected[c] && (c === "inapp" || c === "email") : connected[c] && value(e, c))).length;
                return (
                  <li key={e.id} className="bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} fill="currentColor" aria-hidden="true">
                          <path d="M7 4l6 6-6 6V4Z" />
                        </svg>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{evName(e)}</span>
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400">{e.alwaysOn ? t("ns.matrix.alwaysOn") : `${activeCount} / ${columns.filter((c) => channelAllowed(e.id, c)).length}`}</span>
                        </span>
                      </button>
                      {!e.alwaysOn && (
                        <Switch
                          checked={rs.checked}
                          mixed={rs.mixed}
                          disabled={rs.count === 0}
                          label={t("ns.matrix.masterRow", { event: evName(e) })}
                          onChange={() => toggleRow(e)}
                        />
                      )}
                    </div>
                    {expanded && (
                      <div id={panelId} className="border-t border-gray-100 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-950/40">
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t(e.descKey)}</p>
                        <div className="flex flex-wrap gap-2">
                          {columns
                            .filter((c) => channelAllowed(e.id, c))
                            .map((c) => {
                              const can = editable(e, c);
                              const on = e.alwaysOn ? connected[c] : can ? value(e, c) : false;
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  role="switch"
                                  aria-checked={on}
                                  aria-label={t("ns.matrix.cell", { event: evName(e), channel: chName(c) })}
                                  title={hint(e, c)}
                                  disabled={!can}
                                  onClick={() => onSetCells([{ event: e.id, channel: c, enabled: !on }])}
                                  className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs transition ${
                                    on
                                      ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                                      : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                                  } ${can ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                                >
                                  <ChannelIcon channel={c} size={20} />
                                  <span className="max-w-[120px] truncate">{chName(c)}</span>
                                  <span aria-hidden="true" className={`ml-0.5 inline-block h-2 w-2 rounded-full ${on ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"}`} />
                                </button>
                              );
                            })}
                        </div>
                        {columns.some((c) => channelAllowed(e.id, c) && !connected[c]) && (
                          <p className="mt-2 text-[11px] text-gray-400">{t("ns.matrix.notConnected")}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
