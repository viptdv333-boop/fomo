"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "@/lib/theme";
import { forceUpdate } from "@/lib/force-update";
import { unregisterNativePush } from "@/lib/native-push";
import { canOpenNativeSettings, nativeAppFeatures, openNativeSettings } from "@/lib/native-app";
import { isTerminalSite } from "@/lib/site-mode";
import { FOMO_COMMUNITY_URL } from "@/lib/fomo-ideas";
import { avatarInitial, countValue, heroLine, pendingSalesCount, ratingLabel, specLabels } from "@/lib/app-profile";
import { DownloadAppsRow } from "@/components/shared/DownloadApps";
import AppIcon from "../AppIcon";
import { Sections, type SheetRow, type SheetSection } from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";
import { PickerSheet } from "./parts";

// terminal.fomo.spot: the board site's sections (authors, calculator, ideas, finance, rooms ...) do not exist there
const TERMINAL = isTerminalSite();

const ico = (name: Parameters<typeof AppIcon>[0]["name"]) => <AppIcon name={name} size={18} stroke={1.8} />;

/** Counters shown at the right of the «Личный кабинет» rows: rooms and the sales that wait for a confirmation. */
function useCabinetCounters(userId: string | undefined) {
  const [rooms, setRooms] = useState(0);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!userId || TERMINAL) return;
    let alive = true;
    void fetch("/api/rooms")
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => alive && setRooms(Array.isArray(j) ? j.length : 0))
      .catch(() => {});
    void fetch(`/api/users/${userId}/finances`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setPending(pendingSalesCount(j?.sales)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);
  return { rooms, pending };
}

/** «Версия» of the «Обновить приложение» row: the app build inside the Android app, the site build elsewhere. */
function useVersionLabel(): string {
  const [v, setV] = useState("");
  useEffect(() => {
    const f = nativeAppFeatures();
    setV(f?.versionName || process.env.NEXT_PUBLIC_BUILD_ID || "");
  }, []);
  return v;
}

/** The Профиль tab: the design's `me` screen. */
export default function ProfileHome() {
  const { t, user, me, go, open, flash } = useProf();
  const { theme, toggleTheme } = useTheme();
  const [themeSheet, setThemeSheet] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => setNative(canOpenNativeSettings()), []);
  const { rooms, pending } = useCabinetCounters(user?.id);
  const version = useVersionLabel();
  const isAdmin = user?.role === "ADMIN" || user?.role === "OWNER";

  if (!user) {
    return (
      <div className="ac-page">
        <div className="ac-large">{t("profile.profile")}</div>
        <div className="ap-guest">
          <div className="ap-guest-t">{t("appprof.guest")}</div>
          <button type="button" className="ap-primary" style={{ margin: 0 }} onClick={() => open("/login")}>
            {t("nav.login")}
          </button>
        </div>
        {!TERMINAL && (
          <button type="button" className="ap-cta" onClick={() => open("/help")}>
            <AppIcon name="help" size={22} />
            <span>{t("nav.help")}</span>
            <AppIcon name="chevR" size={18} />
          </button>
        )}
      </div>
    );
  }

  const name = me?.displayName || user.name || "";
  const avatar = me?.avatarUrl || user.image || null;
  const handle = me?.fomoId || user.fomoId ? `#${me?.fomoId || user.fomoId}` : user.email || "";
  const line = heroLine([specLabels(me?.specializations, t).join(", "), me?.city, me?.exchangeExperience]);
  const themeLabel = theme === "dark" ? t("appprof.themeDark") : t("appprof.themeLight");

  const sections: SheetSection[] = [];
  // the risk calculator is a pushed screen (src/components/app/calculator): Android Back returns to this list
  const calcRow: SheetRow = { key: "calc", label: t("nav.calculator"), icon: ico("calc"), sub: t("appprof.calcSub"), chev: true, onClick: () => open("/calculator") };
  // terminal site: no sections of the board site; the calendar is a segment of the terminal screen, the calculator is a tool, and one quiet row invites to fomo.spot
  if (TERMINAL) {
    sections.push({ key: "tools", rows: [calcRow] });
    sections.push({
      key: "community",
      rows: [
        {
          key: "fomo",
          label: t("termsite.community"),
          sub: t("termsite.community.sub"),
          icon: ico("users"),
          chev: true,
          // outside the app: a new tab; in the Android app the system browser takes over (fomo.spot is not the app's own host)
          onClick: () => void window.open(FOMO_COMMUNITY_URL, "_blank", "noopener"),
        },
      ],
    });
  } else
    sections.push({
      key: "sections",
      title: t("appprof.sections"),
      rows: [
        { key: "authors", label: t("nav.authors"), icon: ico("users"), chev: true, onClick: () => open("/authors") },
        { key: "calendar", label: t("nav.calendar"), icon: ico("cal"), chev: true, onClick: () => open("/calendar") },
        calcRow,
      ],
    });
  if (!TERMINAL)
    sections.push({
      key: "cabinet",
      title: t("profile.cabinet"),
      rows: [
        { key: "create", label: t("profile.createIdea"), icon: ico("plus"), tileBg: "var(--app-green)", tileFg: "#fff", onClick: () => open("/ideas/new") },
        { key: "ideas", label: t("profile.ideas"), icon: ico("bulb"), value: countValue(me?.ideaCount), chev: true, onClick: () => go("ideas") },
        { key: "subs", label: t("profile.subscriptions"), icon: ico("channels"), chev: true, onClick: () => go("subs") },
        { key: "finance", label: t("profile.finance"), icon: ico("wallet"), badge: pending || undefined, chev: true, onClick: () => go("finance") },
        { key: "rooms", label: t("profile2.tabRooms"), icon: ico("home"), value: countValue(rooms), chev: true, onClick: () => go("rooms") },
      ],
    });
  sections.push({
    key: "service",
    title: t("appprof.serviceSettings"),
    footer: t("appprof.serviceFoot"),
    rows: [
      { key: "edit", label: t("profile.profile"), icon: ico("user"), chev: true, onClick: () => go("edit") },
      { key: "notif", label: t("profile.notifications"), icon: ico("bell"), chev: true, onClick: () => go("notifications") },
      { key: "security", label: t("profile.security"), icon: ico("shield"), chev: true, onClick: () => go("security") },
    ],
  });
  sections.push({
    key: "app",
    title: t("appprof.appSettings"),
    footer: t("appprof.appFoot"),
    rows: [
      { key: "theme", label: t("appprof.theme"), icon: ico(theme === "dark" ? "moon" : "sun"), value: themeLabel, chev: true, onClick: () => setThemeSheet(true) },
      ...(native ? [{ key: "native", label: t("app.settings"), icon: ico("sliders"), chev: true, onClick: () => void openNativeSettings() }] : []),
      { key: "allapp", label: t("appprof.allAppSettings"), icon: ico("phone"), chev: true, onClick: () => go("app") },
    ],
  });
  if (isAdmin && !TERMINAL)
    sections.push({
      key: "admin",
      rows: [{ key: "admin", label: t("profile.admin"), icon: ico("shield"), chev: true, onClick: () => open("/admin") }],
    });
  sections.push({
    key: "last",
    rows: [
      { key: "update", label: t("common.updateApp.button"), icon: ico("refresh"), value: version, onClick: () => void forceUpdate() },
      ...(TERMINAL ? [] : [{ key: "download", label: "", node: <DownloadAppsRow variant="profile" /> }]),
      {
        key: "logout",
        label: t("profile.logout"),
        icon: ico("logout"),
        color: "var(--app-red)",
        onClick: () => {
          flash(t("appprof.signingOut"));
          void unregisterNativePush().finally(() => signOut({ callbackUrl: "/" }));
        },
      },
    ],
  });

  return (
    <div className="ac-page" data-home="1">
      <div className="ac-large">{t("profile.profile")}</div>
      <div className="ap-hero">
        <div className="ap-hero-top">
          <div className="ap-ava">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" />
            ) : (
              avatarInitial(name)
            )}
          </div>
          <div className="ap-hero-txt">
            <div className="ap-hero-name">{name}</div>
            <div className="ap-hero-handle">{handle}</div>
            {line && <div className="ap-hero-line">{line}</div>}
          </div>
        </div>
        {!TERMINAL && (
          <div className="ap-stats">
            <div className="ap-stat">
              <div className="ap-stat-v">{ratingLabel(me?.rating)}</div>
              <div className="ap-stat-l">{t("appprof.rating")}</div>
            </div>
            <div className="ap-stat">
              <div className="ap-stat-v">{me?.followerCount ?? 0}</div>
              <div className="ap-stat-l">{t("appprof.subscribers")}</div>
            </div>
            <div className="ap-stat">
              <div className="ap-stat-v">{me?.ideaCount ?? 0}</div>
              <div className="ap-stat-l">{t("appprof.ideasStat")}</div>
            </div>
          </div>
        )}
        <div className="ap-hero-btns">
          <button type="button" className="ap-hero-btn" onClick={() => go("edit")}>
            {t("appprof.editProfile")}
          </button>
        </div>
      </div>
      {!TERMINAL && (
        <button type="button" className="ap-cta" onClick={() => open("/help")}>
          <AppIcon name="help" size={22} />
          <span>{t("nav.help")}</span>
          <AppIcon name="chevR" size={18} />
        </button>
      )}
      <Sections sections={sections} />
      {themeSheet && (
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
          onClose={() => setThemeSheet(false)}
        />
      )}
    </div>
  );
}
