"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";
import { forceUpdate } from "@/lib/force-update";
import { switchLocale } from "@/lib/i18n/client";
import { APP_FONT_STEPS, type AppFontStep } from "@/lib/app-ui";
import { canOpenNativeSettings, nativeAppFeatures, openNativeSettings } from "@/lib/native-app";
import { clearSavedData, isOfflineModeEnabled, setOfflineModeEnabled, swStats } from "@/lib/offline/sw-bridge";
import { outboxCounts, purgeOutboxAll } from "@/lib/outbox/outbox";
import { getExistingPushSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { isTerminalSite } from "@/lib/site-mode";
import { DownloadAppsRow } from "@/components/shared/DownloadApps";
import AppIcon from "../AppIcon";
import { Sections, type SheetSection } from "../chat/AppSheet";
import { applyFontStep, readFontStep } from "../fontStep";
import { useProf } from "./ProfileCtx";
import { PickerSheet, ScreenFrame } from "./parts";

const TERMINAL = isTerminalSite();
const ico = (name: Parameters<typeof AppIcon>[0]["name"]) => <AppIcon name={name} size={18} stroke={1.8} />;

const FALLBACK_LANGS = [
  { code: "ru", name: "Русский" },
  { code: "en", name: "English" },
  { code: "cn", name: "中文" },
];

/** «Приложение» (the design's `app`): what is stored on this device: look, language, push of this device, version, update, legal links. */
export default function AppSettings() {
  const { t, locale, go, open } = useProf();
  const { theme, toggleTheme } = useTheme();
  const [fz, setFz] = useState<AppFontStep>("m");
  const [langs, setLangs] = useState(FALLBACK_LANGS);
  const [sheet, setSheet] = useState<"theme" | "fz" | "lang" | null>(null);
  const [native, setNative] = useState(false);
  const [version, setVersion] = useState("");
  const [pushOk, setPushOk] = useState(false);
  const [push, setPush] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState("");
  const [offlineOn, setOfflineOn] = useState(true);
  const [usedMb, setUsedMb] = useState("");
  const [cleared, setCleared] = useState(false);

  const refreshUsed = () =>
    void swStats().then((st) => {
      if (st && st.usage > 0) setUsedMb(String(Math.max(1, Math.round(st.usage / (1024 * 1024)))));
      else setUsedMb("");
    });

  useEffect(() => {
    setOfflineOn(isOfflineModeEnabled());
    refreshUsed();
    setFz(readFontStep());
    setNative(canOpenNativeSettings());
    setVersion(nativeAppFeatures()?.versionName || process.env.NEXT_PUBLIC_BUILD_ID || "");
    fetch("/api/languages")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && d.length > 1 && setLangs(d.map((l: { code: string; name: string }) => ({ code: l.code, name: l.name }))))
      .catch(() => {});
    if (isPushSupported()) {
      setPushOk(true);
      void getExistingPushSubscription().then((sub) => setPush(Boolean(sub)));
    }
  }, []);

  function toggleOffline() {
    const next = !offlineOn;
    setOfflineOn(next);
    setOfflineModeEnabled(next);
    setCleared(false);
    window.setTimeout(refreshUsed, 600);
  }

  async function clearOffline() {
    const n = outboxCounts().pending + outboxCounts().failed;
    if (n > 0 && !window.confirm(t("offline.clearConfirm", { n }))) return;
    await clearSavedData({ outbox: n > 0 });
    if (n > 0) await purgeOutboxAll();
    setCleared(true);
    refreshUsed();
  }

  const fzLabel: Record<AppFontStep, string> = { s: t("appui.fontS"), m: t("appui.fontM"), l: t("appui.fontL"), xl: t("appui.fontXl") };
  const themeLabel = theme === "dark" ? t("appprof.themeDark") : t("appprof.themeLight");
  const langName = langs.find((l) => l.code === locale)?.name || locale;

  async function togglePush() {
    setPushErr("");
    setPushBusy(true);
    try {
      if (push) {
        await unsubscribeFromPush();
        setPush(false);
      } else {
        const r = await subscribeToPush();
        if (r.ok) setPush(true);
        else if (r.error === "denied") setPushErr(t("profile2.pushBlocked"));
        else setPushErr(t("profile2.pushFailed", { error: r.error || t("profile2.errorUnknown") }));
      }
    } catch (e) {
      setPushErr(t("profile2.pushFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPushBusy(false);
    }
  }

  const sections: SheetSection[] = [
    {
      key: "look",
      title: t("appprof.look"),
      rows: [
        { key: "theme", label: t("appprof.theme"), icon: ico(theme === "dark" ? "moon" : "sun"), value: themeLabel, chev: true, onClick: () => setSheet("theme") },
        { key: "fz", label: t("appui.fontSize"), icon: ico("type"), value: fzLabel[fz], chev: true, onClick: () => setSheet("fz") },
      ],
    },
    {
      key: "lang",
      rows: [{ key: "lang", label: t("appprof.language"), icon: ico("globe"), value: langName, chev: true, onClick: () => setSheet("lang") }],
    },
    {
      key: "device",
      title: t("appprof.thisDevice"),
      footer: pushErr || undefined,
      rows: [
        ...(native ? [{ key: "native", label: t("app.settings"), sub: t("app.settings.cardDesc"), icon: ico("sliders"), chev: true, onClick: () => void openNativeSettings() }] : []),
        ...(pushOk ? [{ key: "push", label: t("profile.pushNotifications"), sub: t("profile.pushNotificationsDesc"), icon: ico("bell"), toggle: push, disabled: pushBusy, onClick: () => void togglePush() }] : []),
        { key: "notif", label: t("appprof.whatAndWhere"), icon: ico("sliders"), chev: true, onClick: () => go("notifications") },
      ],
    },
    {
      key: "offline",
      title: t("offline.mode"),
      footer: cleared ? t("offline.cleared") : undefined,
      rows: [
        { key: "offmode", label: t("offline.mode"), sub: t("offline.modeSub"), icon: ico("clock"), toggle: offlineOn, onClick: toggleOffline },
        { key: "offclear", label: t("offline.clear"), sub: usedMb ? t("offline.used", { mb: usedMb }) : t("offline.clearSub"), icon: ico("trash"), onClick: () => void clearOffline() },
      ],
    },
    {
      key: "about",
      title: t("appprof.about"),
      rows: [
        { key: "ver", label: t("appprof.version"), value: version },
        { key: "upd", label: t("common.updateApp.button"), sub: t("common.updateApp.hint"), icon: ico("refresh"), chev: true, onClick: () => void forceUpdate() },
        ...(TERMINAL ? [] : [{ key: "dl", label: "", node: <DownloadAppsRow variant="profile" /> }]),
        ...(TERMINAL ? [] : [{ key: "help", label: t("nav.help"), icon: ico("help"), chev: true, onClick: () => open("/help") }]),
        { key: "privacy", label: t("appprof.privacy"), chev: true, onClick: () => open("/privacy") },
        { key: "terms", label: t("appprof.terms"), chev: true, onClick: () => open("/terms") },
      ],
    },
  ];

  return (
    <ScreenFrame title={t("appprof.app")} intro={t("appprof.appIntro")}>
      <Sections sections={sections} />
      {sheet === "theme" && (
        <PickerSheet
          title={t("appprof.theme")}
          value={theme}
          options={[
            { key: "light", label: t("appprof.themeLight") },
            { key: "dark", label: t("appprof.themeDark") },
          ]}
          onPick={(k) => {
            if (k !== theme) toggleTheme();
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "fz" && (
        <PickerSheet
          title={t("appui.fontSize")}
          value={fz}
          options={APP_FONT_STEPS.map((s) => ({ key: s, label: fzLabel[s] }))}
          onPick={(k) => {
            setFz(k);
            applyFontStep(k, true);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "lang" && <PickerSheet title={t("appprof.language")} value={locale} options={langs.map((l) => ({ key: l.code, label: l.name }))} onPick={(k) => (k !== locale ? switchLocale(k) : undefined)} onClose={() => setSheet(null)} />}
    </ScreenFrame>
  );
}
