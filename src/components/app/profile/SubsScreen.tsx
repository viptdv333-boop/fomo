"use client";

import { useCallback, useEffect, useState } from "react";
import { avatarInitial } from "@/lib/app-profile";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetSection } from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";
import { Loading, ScreenFrame } from "./parts";

interface SubItem {
  id: string;
  type: "paid" | "free";
  tariffId: string | null;
  telegramNotify: boolean;
  monthlyPrice: number;
  endDate: string | null;
  author: { id: string; displayName: string; rating: number | string; avatarUrl?: string | null };
}
interface ChannelItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  durationDays?: number;
  avatarUrl?: string | null;
  subscriberCount?: number;
}
interface FollowerItem {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  followedAt: string;
}
interface ChannelSubscriber {
  id: string;
  subscriberId: string;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  endDate: string;
}

const tile = (name: string, src?: string | null) => (
  <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 8, fontWeight: 700, fontSize: 13 }}>
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : (
      avatarInitial(name)
    )}
  </span>
);

/** «Каналы и подписки» (the design's `finance` with part «subs»): my channels with their subscribers, the channels and authors I follow, my followers. The old /subscriptions page. */
export default function SubsScreen() {
  const { t, user, me, locale, open } = useProf();
  const uid = user?.id;
  const dateLocale = locale === "cn" ? "zh-CN" : locale === "en" ? "en-US" : "ru";
  const [subs, setSubs] = useState<SubItem[] | null>(null);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [followers, setFollowers] = useState<FollowerItem[]>([]);
  const [tgVerified, setTgVerified] = useState(false);
  const [people, setPeople] = useState<{ channel: ChannelItem; list: ChannelSubscriber[] | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [s, c, f, tg] = await Promise.all([j("/api/subscriptions"), j(`/api/users/${uid}/tariffs`), j(`/api/users/${uid}/followers`), j("/api/telegram/account")]);
    setSubs(Array.isArray(s) ? s : []);
    setChannels(Array.isArray(c) ? c : []);
    setFollowers(Array.isArray(f) ? f : []);
    setTgVerified(Boolean(tg?.verified));
  }, [uid]);
  useEffect(() => {
    void load();
  }, [load]);

  async function showPeople(ch: ChannelItem) {
    setPeople({ channel: ch, list: null });
    const res = await fetch(`/api/users/${uid}/tariffs/${ch.id}/subscribers`).catch(() => null);
    const data = res && res.ok ? await res.json().catch(() => []) : [];
    setPeople({ channel: ch, list: Array.isArray(data) ? data : [] });
  }

  async function toggleTelegram(sub: SubItem) {
    if (!sub.tariffId) return;
    if (!tgVerified && !sub.telegramNotify) {
      window.alert(t("feed2.connectTelegramFirst"));
      return;
    }
    setBusy(sub.id);
    const enabled = !sub.telegramNotify;
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/telegram`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) window.alert(data.error || t("feed2.settingChangeFailed"));
      else setSubs((prev) => (prev ? prev.map((s) => (s.id === sub.id ? { ...s, telegramNotify: enabled } : s)) : prev));
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe(sub: SubItem) {
    if (!window.confirm(t("pay.confirmUnsubscribe"))) return;
    setBusy(sub.id);
    try {
      const res = await fetch("/api/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sub.id }) });
      if (res.ok) await load();
      else window.alert(t("pay.unsubscribeFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (subs === null) return <ScreenFrame title={t("profile.subscriptions")}><Loading label={t("common.loading")} /></ScreenFrame>;

  const rating = Number(me?.rating) || 0;
  const authorSubs = subs.filter((s) => s.type === "free");
  const channelSubs = subs.filter((s) => s.type === "paid");
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(dateLocale) : "");

  const sections: SheetSection[] = [];
  sections.push({
    key: "mine",
    title: t("subs.myChannels"),
    footer: t("subs.createToMonetize"),
    rows: [
      ...channels.map((ch) => ({
        key: ch.id,
        label: ch.name,
        sub: [t("feed2.pricePerDays", { price: Number(ch.price), days: ch.durationDays || 30 }), typeof ch.subscriberCount === "number" ? t("pay.subscribersCount", { count: ch.subscriberCount }) : ""].filter(Boolean).join(" · "),
        icon: tile(ch.name, ch.avatarUrl),
        chev: true,
        onClick: () => open(`/channels/${ch.id}`),
        actions: [
          { label: t("subs.channelSubscribers"), onClick: () => void showPeople(ch) },
          { label: t("subs.settings"), onClick: () => open(`/channels/edit/${ch.id}`) },
        ],
      })),
      {
        key: "create",
        label: t("channels.create"),
        sub: rating < 5 ? t("profile2.tariffRatingRequired", { rating: rating.toFixed(1) }) : undefined,
        icon: <AppIcon name="plus" size={18} stroke={1.8} />,
        color: "var(--app-green-tx)",
        onClick: () => open("/channels/create"),
      },
    ],
  });

  sections.push({
    key: "authors",
    title: t("subs.authors"),
    footer: authorSubs.length === 0 ? t("subs.noAuthorSubs") : undefined,
    rows: [
      ...authorSubs.map((s) => ({
        key: s.id,
        label: s.author.displayName,
        sub: `${t("idea.rating")} ${Number(s.author.rating).toFixed(1)}`,
        icon: tile(s.author.displayName, s.author.avatarUrl),
        chev: true,
        onClick: () => open(`/profile/${s.author.id}`),
        actions: [{ label: busy === s.id ? "…" : t("channels.unsubscribe"), tone: "danger" as const, onClick: () => void unsubscribe(s) }],
      })),
      { key: "find", label: t("subs.findAuthors"), icon: <AppIcon name="users" size={18} stroke={1.8} />, color: "var(--app-green-tx)", onClick: () => open("/authors") },
    ],
  });
  sections.push({
    key: "subs",
    title: t("appprof.mySubs"),
    footer: channelSubs.length === 0 ? t("subs.noChannelSubs") : undefined,
    rows: channelSubs.map((s) => ({
      key: s.id,
      label: s.author.displayName,
      sub: [t("feed2.pricePerMonth", { price: Number(s.monthlyPrice) }), s.endDate ? t("feed2.untilDate", { date: date(s.endDate) }) : ""].filter(Boolean).join(" · "),
      icon: tile(s.author.displayName, s.author.avatarUrl),
      chev: true,
      onClick: () => open(`/profile/${s.author.id}`),
      actions: [
        { label: `Telegram: ${s.telegramNotify ? t("appprof.on") : t("appprof.off")}`, onClick: () => void toggleTelegram(s) },
        { label: busy === s.id ? "…" : t("channels.unsubscribe"), tone: "danger" as const, onClick: () => void unsubscribe(s) },
      ],
    })),
  });

  sections.push({
    key: "followers",
    title: t("subs.myFollowers"),
    footer: followers.length === 0 ? t("subs.noFollowers") : undefined,
    rows: followers.map((f) => ({
      key: f.id,
      label: f.displayName,
      sub: `${t("subs.followedSince")} ${date(f.followedAt)}`,
      icon: tile(f.displayName, f.avatarUrl),
      chev: true,
      onClick: () => open(`/profile/${f.id}`),
    })),
  });

  return (
    <ScreenFrame title={t("profile.subscriptions")}>
      <Sections sections={sections.filter((s) => s.rows.length > 0 || s.footer)} />
      {people && (
        <AppSheet
          title={people.channel.name}
          onClose={() => setPeople(null)}
          doneLabel={t("appui.chat.done")}
          height="full"
          sections={[
            {
              key: "p",
              rows:
                people.list === null
                  ? [{ key: "l", label: t("common.loading") }]
                  : people.list.length === 0
                    ? [{ key: "e", label: t("subs.noChannelSubscribers") }]
                    : people.list.map((s) => ({
                        key: s.id,
                        label: s.displayName,
                        sub: s.isActive ? `${t("subs.subscriberUntil")} ${date(s.endDate)}` : t("subs.subscriberInactive"),
                        icon: tile(s.displayName, s.avatarUrl),
                        chev: true,
                        onClick: () => {
                          setPeople(null);
                          open(`/profile/${s.subscriberId}`);
                        },
                      })),
            },
          ]}
        />
      )}
    </ScreenFrame>
  );
}
