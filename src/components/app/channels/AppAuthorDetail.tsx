"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { agoLabel } from "@/lib/app-ui";
import { initials } from "@/lib/app-chat";
import {
  SHARE_BASE,
  authorPath,
  authorSubline,
  channelEmoji,
  channelPath,
  channelStatus,
  channelSubEnd,
  endDateLabel,
  priceAndPeriod,
  priceLabel,
  ratingText,
  specLabels,
  subscribersLabel,
  yearsOnExchangeText,
} from "@/lib/app-channels";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetSection } from "../chat/AppSheet";
import "../chat/app-chat.css";
import "./app-channels.css";
import AppReportSheet from "./AppReportSheet";
import ChIcon from "./ChIcon";
import { ChNav, shareOrCopy, useChNav, useChannelsChrome, useFlash } from "./chrome";
import { useChannelList, useMySubs } from "./useChannelsData";

interface Profile {
  id: string;
  displayName: string;
  fomoId: string | null;
  bio: string | null;
  avatarUrl: string | null;
  rating: number;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  city: string | null;
  workplace: string | null;
  exchangeExperience: string | null;
  specializations: string[];
  dmEnabled: boolean;
  socialLinks: { telegram?: string; vk?: string; youtube?: string; whatsapp?: string; max?: string; website?: string } | null;
  education: { id: string; university: string; faculty: string | null; specialty: string | null; yearEnd: number | null }[];
  followerCount: number;
  ideaCount: number;
  isFollowing?: boolean;
}

interface IdeaRow {
  id: string;
  title: string;
  isPaid: boolean;
  price: number | null;
  voteScore: number;
  createdAt: string;
  channelId?: string | null;
}

interface WatchRow {
  id: string;
  asset: { id: string; name: string; ticker: string | null; category: { name: string } | null };
}

function calcAge(birthDate: string): number {
  const b = new Date(birthDate);
  const n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
  return age;
}

function linkOf(kind: string, v: string): string {
  const raw = v.trim();
  switch (kind) {
    case "telegram":
      return raw.startsWith("http") ? raw : `https://t.me/${raw.replace("@", "")}`;
    case "vk":
      return raw.startsWith("http") ? raw : `https://vk.com/${raw}`;
    case "youtube":
      return raw.startsWith("http") ? raw : `https://youtube.com/${raw}`;
    case "whatsapp":
      return `https://wa.me/${raw.replace(/[^0-9+]/g, "")}`;
    case "max":
      return raw.startsWith("http") ? raw : `https://max.ru/${raw}`;
    default:
      return raw.startsWith("http") ? raw : `https://${raw}`;
  }
}
const SOCIAL_NAMES: Record<string, string> = { telegram: "Telegram", vk: "VK", youtube: "YouTube", whatsapp: "WhatsApp", max: "MAX" };

/**
 * An author of the app UI: the prototype's author screen (bar with the name, the card with the round avatar, #id, specialization · city · experience,
 * three stat tiles, «Подписаться» / «Написать», the author's ideas) over the site's real profile, plus what the old profile page had:
 * the paid channels with the buy flow, the profile details, education, social links, the watchlist, share, report.
 */
export default function AppAuthorDetail({ idParam }: { idParam: string }) {
  const { t, locale } = useT();
  useChannelsChrome();
  const nav = useChNav("/authors");
  const { flash, toast } = useFlash();
  const subs = useMySubs();
  const list = useChannelList();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "failed">("loading");
  const [ideas, setIdeas] = useState<IdeaRow[] | null>(null);
  const [watch, setWatch] = useState<WatchRow[]>([]);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | "more" | "report">(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(idParam)}`, { cache: "no-store" });
      if (r.status === 404) return setState("missing");
      if (!r.ok) return setState("failed");
      const p = (await r.json()) as Profile;
      setProfile(p);
      setFollowing(!!p.isFollowing);
      setFollowers(p.followerCount ?? 0);
      setState("ok");
    } catch {
      setState("failed");
    }
  }, [idParam]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    fetch(`/api/ideas?authorId=${profile.id}&limit=50`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const arr = j.data || j.ideas || (Array.isArray(j) ? j : []);
        if (alive) setIdeas(Array.isArray(arr) ? arr : []);
      })
      .catch(() => alive && setIdeas([]));
    fetch(`/api/watchlist?userId=${profile.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => alive && setWatch(Array.isArray(j) ? j : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [profile]);

  const channels = useMemo(() => (profile ? (list.items ?? []).filter((c) => c.author.id === profile.id) : []), [list.items, profile]);
  const isMe = !!profile && !!subs.myId && subs.myId === profile.id;

  async function toggleFollow() {
    if (!profile) return;
    if (!subs.loggedIn) return nav.go("/login");
    if (busy) return;
    setBusy(true);
    const was = following;
    setFollowing(!was);
    setFollowers((n) => Math.max(0, n + (was ? -1 : 1)));
    try {
      const r = await fetch(`/api/users/${profile.id}/follow`, { method: "POST" });
      if (!r.ok) throw new Error("follow");
      const j = (await r.json()) as { following: boolean; followerCount: number };
      setFollowing(j.following);
      setFollowers(j.followerCount);
    } catch {
      setFollowing(was);
      setFollowers((n) => Math.max(0, n + (was ? 1 : -1)));
      flash(t("appch.actionFailed"));
    }
    setBusy(false);
  }

  const shareUrl = profile ? `${SHARE_BASE}${authorPath(profile)}` : "";
  const doShare = () => profile && void shareOrCopy(shareUrl, profile.displayName, () => flash(t("appch.linkCopied")));
  const bar = (title: string, right?: Parameters<typeof ChNav>[0]["right"]) => <ChNav back={nav.back} backLabel={nav.backLabel} title={title} right={right} />;

  if (state === "loading") {
    return (
      <div className="ach">
        {bar(t("appch.author"))}
        <div className="ach-ebox">{t("common.loading")}</div>
      </div>
    );
  }
  if (state !== "ok" || !profile) {
    return (
      <div className="ach">
        {bar(t("appch.author"))}
        <div className="ach-ebox">
          <div style={{ fontSize: 40 }}>{"\u{1F464}"}</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--app-tx)" }}>{t(state === "failed" ? "appch.loadError" : "authors.notFound")}</div>
          <button type="button" className="ach-linkbtn" onClick={() => (state === "failed" ? void load() : nav.go("/authors"))}>
            {state === "failed" ? t("appch.retry") : t("appch.toAuthors")}
          </button>
        </div>
      </div>
    );
  }

  const specs = specLabels(profile.specializations, t);
  const exp = yearsOnExchangeText(profile.exchangeExperience, locale);
  const line = authorSubline(specs, exp, profile.city || "");
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const social = Object.entries(profile.socialLinks ?? {}).filter(([, v]) => typeof v === "string" && v.trim());
  const sections: SheetSection[] = [];

  if (channels.length) {
    sections.push({
      key: "ch",
      title: t("authors.channels"),
      rows: channels.map((c) => {
        const st = channelStatus({ own: isMe, endDate: channelSubEnd(subs.index, c), pending: subs.pending.has(c.id) });
        return {
          key: c.id,
          label: c.name,
          sub: `${c.price > 0 ? priceAndPeriod(c.price, c.durationDays, locale) : t("appch.free")} · ${subscribersLabel(c.subscribersCount, locale)}`,
          icon: <span>{c.avatarUrl ? <img src={c.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : channelEmoji(c.id)}</span>,
          value: st.kind === "active" ? <span style={{ color: "var(--app-green-tx)", fontSize: 13, fontWeight: 600 }}>{t("channels.subscribed")}</span> : st.kind === "pending" ? <span style={{ fontSize: 13 }}>{t("appch.statusPending")}</span> : undefined,
          chev: true,
          onClick: () => nav.go(channelPath(c), profile.displayName),
        };
      }),
    });
  }

  sections.push({
    key: "ideas",
    title: t("appch.authorIdeas"),
    rows:
      ideas === null
        ? [{ key: "load", label: t("common.loading") }]
        : ideas.length === 0
          ? [{ key: "none", label: t("authors.empty") }]
          : ideas.map((i) => ({
              key: i.id,
              label: i.title,
              sub: `${i.isPaid && i.price ? `\u{1F512} ${priceLabel(Number(i.price), locale)} · ` : ""}❤️ ${i.voteScore} · ${agoLabel(i.createdAt, locale)}`,
              chev: true,
              onClick: () => nav.go(`/ideas/${i.id}`, profile.displayName),
            })),
  });

  const detail: SheetSection["rows"] = [];
  if (fullName && fullName !== profile.displayName) detail.push({ key: "name", label: t("appch.name"), value: fullName });
  if (profile.city) detail.push({ key: "city", label: t("profile.city"), value: profile.city });
  if (profile.birthDate) detail.push({ key: "age", label: t("profile.age"), value: t("feed2.ageYears", { age: calcAge(profile.birthDate) }) });
  if (profile.workplace) detail.push({ key: "work", label: t("profile.workLabel").replace(/:$/, ""), value: profile.workplace });
  if (profile.exchangeExperience) detail.push({ key: "exp", label: t("profile.exchangeExp"), value: exp || profile.exchangeExperience });
  if (detail.length) sections.push({ key: "detail", title: t("appch.about"), rows: detail });

  if (profile.education?.length) {
    sections.push({
      key: "edu",
      title: t("profile.education"),
      rows: profile.education.map((e) => ({ key: e.id, label: e.university, sub: [e.faculty, e.specialty, e.yearEnd ? t("feed2.graduationYear", { year: e.yearEnd }) : ""].filter(Boolean).join(" · ") || undefined })),
    });
  }
  if (social.length) {
    sections.push({
      key: "social",
      title: t("profile.socials"),
      rows: social.map(([k, v]) => ({ key: k, label: SOCIAL_NAMES[k] || t("profile.website"), icon: <AppIcon name="link" size={17} stroke={1.8} />, chev: true, onClick: () => window.open(linkOf(k, v as string), "_blank", "noopener,noreferrer") })),
    });
  }
  if (watch.length) {
    sections.push({
      key: "watch",
      title: t("watch.title"),
      rows: watch.map((w) => ({ key: w.id, label: w.asset.name, sub: [w.asset.ticker, w.asset.category?.name].filter(Boolean).join(" · ") || undefined })),
    });
  }

  const moreSections: SheetSection[] = [
    {
      key: "m",
      rows: [
        { key: "share", label: t("appch.share"), icon: <ChIcon name="share" size={18} />, onClick: () => (setSheet(null), doShare()) },
        ...(isMe ? [{ key: "edit", label: t("appch.editProfile"), icon: <AppIcon name="pen" size={18} stroke={1.8} />, chev: true, onClick: () => (setSheet(null), nav.go("/profile", profile.displayName)) }] : [{ key: "report", label: t("report.button"), icon: <ChIcon name="flag" size={18} />, color: "var(--app-red)", onClick: () => (subs.loggedIn ? setSheet("report") : nav.go("/login")) }]),
      ],
    },
  ];

  return (
    <div className="ach">
      {bar(profile.displayName, [
        { key: "share", label: t("appch.share"), icon: <ChIcon name="share" size={22} />, color: "var(--app-green-tx)", onClick: doShare },
        { key: "more", label: t("appch.more"), icon: <AppIcon name="dots" size={22} stroke={2} />, onClick: () => setSheet("more") },
      ])}
      <div className="ach-page">
        <div className="ach-hdr">
          <div className="ach-hdr-top">
            <div className="ach-hdr-ava">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials(profile.displayName || "?")}</div>
            <div className="ach-hdr-txt">
              <div className="ach-hdr-name">{profile.displayName}</div>
              {profile.fomoId && <div className="ach-hdr-handle">#{profile.fomoId}</div>}
              {line && <div className="ach-hdr-line">{line}</div>}
            </div>
          </div>
          <div className="ach-stats">
            <div>
              <b>★ {ratingText(profile.rating)}</b>
              <span>{t("appch.statRating")}</span>
            </div>
            <div>
              <b>{followers}</b>
              <span>{t("channels.subscribers")}</span>
            </div>
            <div>
              <b>{profile.ideaCount}</b>
              <span>{t("authors.ideas")}</span>
            </div>
          </div>
          {!isMe && (
            <div className="ach-btns">
              <button type="button" data-tone={following ? undefined : "green"} disabled={busy} onClick={() => void toggleFollow()}>
                {following ? t("appch.youFollow") : t("channels.subscribe")}
              </button>
              {profile.dmEnabled && (
                <button type="button" onClick={() => (subs.loggedIn ? nav.go(`/chat?with=${profile.id}`, profile.displayName) : nav.go("/login"))}>
                  {t("profile.contactUser")}
                </button>
              )}
            </div>
          )}
        </div>
        {profile.bio ? <div className="ach-bio">{profile.bio}</div> : null}
        {specs.length > 0 && (
          <div className="ach-chips">
            {specs.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        )}
        <Sections sections={sections} />
      </div>

      {sheet === "more" && <AppSheet title={profile.displayName} onClose={() => setSheet(null)} doneLabel={t("appui.chat.done")} sections={moreSections} />}
      {sheet === "report" && <AppReportSheet target={{ type: "author", id: profile.id }} onClose={() => setSheet(null)} flash={flash} />}
      {toast}
    </div>
  );
}
