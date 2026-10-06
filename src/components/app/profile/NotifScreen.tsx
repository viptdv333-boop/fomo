"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHANNEL_IDS, EVENTS, EVENT_GROUPS, channelAllowed, isEnabled, type ChannelId, type EventDef } from "@/lib/notification-events";
import type { QuietState, SettingsResponse } from "@/lib/notify-settings-types";
import { isTerminalSite } from "@/lib/site-mode";
import { notifEventsFor, quietTimeOptions, minToTime, quietZones } from "@/lib/app-profile";
import { COOLDOWN_OPTIONS, EXPIRY_OPTIONS, REMINDER_LEAD_OPTIONS, type TerminalNotifyDefaults } from "@/lib/terminal-alert-defaults";
import { saveTerminalNotifyDefaults, useTerminalNotifyDefaults } from "@/lib/terminal-alert-defaults-client";
import { openNativeSettings } from "@/lib/native-app";
import { useNativeSettingsAvailable } from "@/components/shared/NativeSettingsLink";
import ChannelCards from "@/components/profile/notifications/ChannelCards";
import { ChannelIcon } from "@/components/profile/notifications/ui";
import LegacyTelegramBlock from "@/components/profile/LegacyTelegramBlock";
import { channelConnected } from "@/components/profile/notifications/PrefMatrix";
import { realApi } from "@/components/profile/notifications/api";
import { useNotifSettings } from "@/components/profile/notifications/useNotifSettings";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetRow, type SheetSection } from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";
import { Loading, PickerSheet, ScreenFrame } from "./parts";

const TERMINAL = isTerminalSite();
const ico = (name: Parameters<typeof AppIcon>[0]["name"]) => <AppIcon name={name} size={18} stroke={1.8} />;

type ChannelSheet = Exclude<ChannelId, "inapp">;
type PickerKey = "from" | "to" | "tz" | "repeat" | "cooldown" | "expiry" | "lead";

/**
 * «Настройки уведомлений» (the design's `notif`): the delivery channels (the site's own connection cards, skinned), the events with a chip
 * per channel, quiet hours, the terminal's alert defaults, the test and the reset. Same requests as the site's tab (useNotifSettings).
 */
export default function NotifScreen() {
  const { t, flash } = useProf();
  const n = useNotifSettings(realApi);
  const native = useNativeSettingsAvailable();
  const td = useTerminalNotifyDefaults();
  const [picker, setPicker] = useState<PickerKey | null>(null);
  const [channelSheet, setChannelSheet] = useState<ChannelSheet | null>(null);

  // quiet hours: edited locally, saved shortly after the last change (as the site's card does)
  const [q, setQ] = useState<QuietState | null>(null);
  const qDirty = useRef(false);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (n.data && !qDirty.current) setQ(n.data.quiet);
  }, [n.data]);
  useEffect(() => () => void (qTimer.current && clearTimeout(qTimer.current)), []);
  function changeQuiet(next: QuietState) {
    setQ(next);
    qDirty.current = true;
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(async () => {
      try {
        await n.saveQuiet(next);
        qDirty.current = false;
        flash(t("ns.matrix.saved"));
      } catch {
        flash(t("ns.matrix.saveFailed"));
      }
    }, 600);
  }
  async function changeTerm(patch: Partial<TerminalNotifyDefaults>) {
    const ok = await saveTerminalNotifyDefaults(patch);
    flash(ok ? t("ns.matrix.saved") : t("ns.matrix.saveFailed"));
  }

  const zones = useMemo(() => quietZones(q?.timezone), [q?.timezone]);

  if (!n.data || !q) {
    return (
      <ScreenFrame title={t("appprof.notifTitle")}>
        {n.loadError ? (
          <div className="ac-empty">
            <p>{t("ns.loadFailed")}</p>
            <button type="button" className="ap-hero-btn" style={{ marginTop: 12 }} onClick={() => void n.reload()}>
              {t("ns.retry")}
            </button>
          </div>
        ) : (
          <Loading label={t("ns.loading")} />
        )}
      </ScreenFrame>
    );
  }
  const data: SettingsResponse = n.data;

  // channels that can take part in the matrix: the four everyday ones always, the others once the admin has set them up
  const columns = CHANNEL_IDS.filter((c) => c === "inapp" || c === "webpush" || c === "email" || c === "telegram" || data.channels.find((x) => x.channel === c)?.configured);
  const connected = Object.fromEntries(columns.map((c) => [c, channelConnected(data, c)])) as Record<ChannelId, boolean>;
  const chName = (c: ChannelId) => t(`ns.ch.${c}`);
  const events = notifEventsFor(TERMINAL, EVENTS);
  const groups = EVENT_GROUPS.filter((g) => events.some((e) => e.group === g));

  const chipsFor = (e: EventDef): SheetRow["chips"] =>
    columns
      .filter((c) => channelAllowed(e.id, c))
      .map((c) => {
        const can = !e.alwaysOn && connected[c];
        const on = e.alwaysOn ? connected[c] : can ? isEnabled(e.id, c, n.overrides) : false;
        return {
          key: c,
          label: chName(c),
          on,
          locked: !can,
          onClick: () => n.onSetCells([{ event: e.id, channel: c, enabled: !on }]),
        };
      });

  const sections: SheetSection[] = [];

  sections.push({
    key: "intro",
    rows: native
      ? [
          {
            key: "native",
            label: t("app.settings"),
            sub: t("app.settings.cardDesc"),
            icon: ico("sliders"),
            chev: true,
            onClick: () => void openNativeSettings(),
          },
        ]
      : [],
  });

  // delivery channels: one row each (status), the channel's own connection card opens in a sheet
  const chRow = (c: ChannelId): SheetRow => {
    if (c === "inapp") return { key: c, label: chName(c), sub: t("ns.ch.inapp.d"), icon: ico("bell"), value: t("appprof.always") };
    const isPush = c === "webpush";
    const cs = data.channels.find((x) => x.channel === c);
    const pushOn = data.webpush.configured && data.webpush.devices > 0 ? true : data.webpush.fcmConfigured && data.webpush.appDevices > 0;
    const configured = isPush ? data.webpush.configured || data.webpush.fcmConfigured : !!cs?.configured;
    const status = isPush ? (!configured ? "not_configured" : pushOn ? "connected" : "not_connected") : cs?.status || "not_connected";
    const sub = isPush ? t("ns.ch.webpush.d") : cs?.label || cs?.address || t(`ns.ch.${c}.d`);
    return {
      key: c,
      label: chName(c),
      sub: status === "not_configured" ? t("ns.status.not_configured") : sub,
      icon: <ChannelIcon channel={c} size={30} />,
      tileBg: "transparent",
      value: status === "not_configured" ? undefined : t(`ns.status.${status}`, { reason: cs?.lastError ?? "" }),
      valueColor: status === "connected" ? "var(--app-green-tx)" : status === "error" ? "var(--app-red)" : undefined,
      chev: status !== "not_configured",
      disabled: status === "not_configured",
      onClick: () => setChannelSheet(c as ChannelSheet),
    };
  };
  sections.push({ key: "channels", title: t("ns.channels.title"), rows: CHANNEL_IDS.map(chRow) });

  for (const g of groups)
    sections.push({
      key: `g-${g}`,
      title: t(`ns.group.${g}`),
      rows: events
        .filter((e) => e.group === g)
        .map((e) => ({ key: e.id, label: t(e.labelKey), sub: t(e.descKey), chips: chipsFor(e) })),
    });

  sections.push({
    key: "quiet",
    title: t("ns.quiet.title"),
    footer: t("ns.quiet.desc"),
    rows: [
      { key: "q-on", label: t("ns.quiet.enable"), icon: ico("clock"), toggle: q.enabled, onClick: () => changeQuiet({ ...q, enabled: !q.enabled }) },
      ...(q.enabled
        ? [
            { key: "q-from", label: t("ns.quiet.from"), value: minToTime(q.startMin), chev: true, onClick: () => setPicker("from") },
            { key: "q-to", label: t("ns.quiet.to"), value: minToTime(q.endMin), chev: true, onClick: () => setPicker("to") },
            { key: "q-tz", label: t("ns.quiet.tz"), value: q.timezone, chev: true, onClick: () => setPicker("tz") },
          ]
        : []),
    ],
  });

  const cd = (m: number) => (m >= 60 ? t("alerts.cd.hour") : t("alerts.cd.min", { min: m }));
  const lead = (m: number) => (m === 0 ? t("calrem.lead.0") : m === 60 ? t("calrem.lead.60") : t("calrem.lead.n", { min: m }));
  const exp = (days: number) => t(days === 0 ? "alerts.exp.none" : `alerts.exp.${days}d`);
  sections.push({
    key: "term",
    title: t("ns.term.title"),
    footer: t("ns.term.foot"),
    rows: [
      { key: "t-rep", label: t("ns.term.trigger"), icon: ico("bell"), value: td.repeat ? t("alerts.repeat") : t("alerts.once"), chev: true, onClick: () => setPicker("repeat") },
      ...(td.repeat ? [{ key: "t-cd", label: t("alerts.cooldown"), value: cd(td.cooldownMin), chev: true, onClick: () => setPicker("cooldown") }] : []),
      { key: "t-exp", label: t("ns.term.expiry"), icon: ico("clock"), value: exp(td.expiryDays), chev: true, onClick: () => setPicker("expiry") },
      { key: "t-snd", label: t("ns.term.sound"), icon: ico("vol"), toggle: td.sound, onClick: () => void changeTerm({ sound: !td.sound }) },
      { key: "t-pop", label: t("ns.term.popup"), icon: ico("info"), toggle: td.popup, onClick: () => void changeTerm({ popup: !td.popup }) },
      { key: "t-lead", label: t("ns.term.lead"), icon: ico("cal"), value: lead(td.reminderLeadMin), chev: true, onClick: () => setPicker("lead") },
    ],
  });

  sections.push({
    key: "foot",
    rows: [
      {
        key: "test",
        label: t("ns.btn.test"),
        color: "var(--app-green-tx)",
        onClick: () =>
          void realApi.test("webpush").then((r) => flash(r.ok ? t("ns.sent") : t("ns.testFailed", { reason: r.error ?? "" }))),
      },
      {
        key: "reset",
        label: t("ns.matrix.reset"),
        color: "var(--app-red)",
        onClick: () => {
          if (window.confirm(t("ns.matrix.resetConfirm"))) void n.onReset();
        },
      },
    ],
  });

  const saveNote = n.saveState === "saving" ? t("ns.matrix.saving") : n.saveState === "saved" ? t("ns.matrix.saved") : n.saveState === "error" ? t("ns.matrix.saveFailed") : "";

  return (
    <ScreenFrame title={t("appprof.notifTitle")} intro={t("appprof.notifIntro")}>
      <Sections sections={sections.filter((s) => s.rows.length > 0)} />
      {saveNote && (
        <div className="ap-msg" data-err={n.saveState === "error" ? "1" : undefined} role="status" style={{ marginTop: -8 }}>
          {saveNote}
        </div>
      )}

      {channelSheet && (
        <AppSheet title={chName(channelSheet)} onClose={() => setChannelSheet(null)} doneLabel={t("appui.chat.done")} height="full">
          <div className="ap-skin">
            <ChannelCards data={data} api={realApi} reload={n.reload} ownBot={<LegacyTelegramBlock />} only={channelSheet} />
          </div>
        </AppSheet>
      )}

      {picker === "from" && (
        <PickerSheet
          title={t("ns.quiet.from")}
          value={String(q.startMin)}
          options={quietTimeOptions(q.startMin).map((m) => ({ key: String(m), label: minToTime(m) }))}
          onPick={(k) => changeQuiet({ ...q, startMin: Number(k) })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "to" && (
        <PickerSheet
          title={t("ns.quiet.to")}
          value={String(q.endMin)}
          options={quietTimeOptions(q.endMin).map((m) => ({ key: String(m), label: minToTime(m) }))}
          onPick={(k) => changeQuiet({ ...q, endMin: Number(k) })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "tz" && (
        <PickerSheet
          title={t("ns.quiet.tz")}
          value={q.timezone}
          options={zones.map((z) => ({ key: z, label: z }))}
          onPick={(k) => changeQuiet({ ...q, timezone: k })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "repeat" && (
        <PickerSheet
          title={t("ns.term.trigger")}
          value={td.repeat ? "repeat" : "once"}
          options={[
            { key: "once", label: t("alerts.once") },
            { key: "repeat", label: t("alerts.repeat") },
          ]}
          onPick={(k) => void changeTerm({ repeat: k === "repeat" })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "cooldown" && (
        <PickerSheet title={t("alerts.cooldown")} value={String(td.cooldownMin)} options={COOLDOWN_OPTIONS.map((m) => ({ key: String(m), label: cd(m) }))} onPick={(k) => void changeTerm({ cooldownMin: Number(k) })} onClose={() => setPicker(null)} />
      )}
      {picker === "expiry" && (
        <PickerSheet title={t("ns.term.expiry")} value={String(td.expiryDays)} options={EXPIRY_OPTIONS.map((d) => ({ key: String(d), label: exp(d) }))} onPick={(k) => void changeTerm({ expiryDays: Number(k) })} onClose={() => setPicker(null)} />
      )}
      {picker === "lead" && (
        <PickerSheet title={t("ns.term.lead")} value={String(td.reminderLeadMin)} options={REMINDER_LEAD_OPTIONS.map((m) => ({ key: String(m), label: lead(m) }))} onPick={(k) => void changeTerm({ reminderLeadMin: Number(k) })} onClose={() => setPicker(null)} />
      )}
    </ScreenFrame>
  );
}
