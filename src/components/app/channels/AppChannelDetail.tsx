"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { agoLabel } from "@/lib/app-ui";
import {
  SHARE_BASE,
  authorPath,
  channelEmoji,
  channelPath,
  channelSlugOrId,
  channelSubEnd,
  channelTags,
  daysLabel,
  endDateLabel,
  periodName,
  priceAndPeriod,
  priceLabel,
  ratingText,
  subscribersLabel,
  type ChannelItem,
} from "@/lib/app-channels";
import ChatRoom from "@/components/chat/ChatRoom";
import Watermark from "@/components/shared/Watermark";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetSection } from "../chat/AppSheet";
import "../chat/app-chat.css";
import "./app-channels.css";
import AppBuySheet from "./AppBuySheet";
import AppMembersSheet from "./AppMembersSheet";
import AppReportSheet from "./AppReportSheet";
import ChIcon from "./ChIcon";
import { ChNav, shareOrCopy, useChNav, useChannelsChrome, useFlash } from "./chrome";
import { useChannelList, useMySubs } from "./useChannelsData";
import { useUnreadByIdea } from "../useUnreadByIdea";
import { unreadAccent, unreadLabel, unreadOffList } from "@/lib/app-unread";
import { UnreadChip } from "../IdeaUnreadMarks";
import { useUnreadIdeaCards } from "../useUnreadIdeaCards";

interface PostItem {
  id: string;
  title: string;
  preview: string;
  /** only for those who may open the post: entry / stop / take */
  content?: string;
  isPaid: boolean;
  price: number | null;
  isPinned?: boolean;
  createdAt: string;
  voteScore: number;
  instruments: { id: string; name: string; slug: string }[];
}

/** The channel's closed chat as a pushed thread of the chat screens (the same component the Болталка uses). */
function ChannelChat({ channel, onBack }: { channel: ChannelItem; onBack: () => void }) {
  const { t } = useT();
  const [state, setState] = useState<{ roomId: string } | "denied" | "loading" | "failed">("loading");
  useEffect(() => {
    // the thread is a full-height column of the chat screens: it needs the chat's page chrome, not the channel page's
    const root = document.documentElement;
    const had = root.classList.contains("app-ch-on");
    root.classList.remove("app-ch-on");
    root.classList.add("app-chat-on", "app-thread-on");
    return () => {
      root.classList.remove("app-chat-on", "app-thread-on");
      if (had) root.classList.add("app-ch-on");
    };
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(`/api/channels/${channel.id}/chat`);
        if (r.status === 403) return alive && setState("denied");
        const j = r.ok ? await r.json() : null;
        if (alive) setState(j?.roomId ? { roomId: j.roomId } : "failed");
      } catch {
        if (alive) setState("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [channel.id]);
  if (typeof state === "object") return <ChatRoom key={state.roomId} appVariant roomId={state.roomId} roomName={channel.name} onBack={onBack} />;
  return (
    <div className="ac ac-thread">
      <div className="ac-tbar">
        <button type="button" className="ac-tback" onClick={onBack}>
          <AppIcon name="chevL" size={22} stroke={2} />
          <span>{t("common.back")}</span>
        </button>
        <div className="ac-tcenter">
          <div className="ac-tname">{channel.name}</div>
        </div>
        <div />
      </div>
      <div className="ac-msgs">
        <div className="ac-empty">{state === "loading" ? t("common.loading") : state === "denied" ? t("appch.chatDenied") : t("appch.chatFailed")}</div>
      </div>
    </div>
  );
}

/**
 * A channel of the app UI: the prototype's `on.channel` screen (tile, name, author, subscribers, description, tags, «Тарифы», the big button,
 * the note, the pinned post) over the site's real channel, plus what the old channel page had: the posts feed with the owner's pin / edit /
 * delete, the closed chat, Telegram switches, other channels of the author, the owner's subscribers tools, share, report.
 */
export default function AppChannelDetail({ idParam }: { idParam: string }) {
  const { t, locale } = useT();
  useChannelsChrome();
  const nav = useChNav("/channels");
  const { flash, toast } = useFlash();
  const params = useSearchParams();
  const chatOpen = params.get("chat") === "1";
  const list = useChannelList();
  const subs = useMySubs();
  const unread = useUnreadByIdea(); // red count of unread comments under each post

  const channel = useMemo(() => (list.items ?? []).find((c) => c.id === idParam || c.slug === idParam) ?? null, [list.items, idParam]);
  const others = useMemo(() => (channel ? (list.items ?? []).filter((c) => c.author.id === channel.author.id && c.id !== channel.id) : []), [list.items, channel]);

  const [posts, setPosts] = useState<PostItem[] | null>(null);
  const [tgVerified, setTgVerified] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const [authorTg, setAuthorTg] = useState<boolean | null>(null);
  const [myTg, setMyTg] = useState<boolean | null>(null);
  const [busyPost, setBusyPost] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [sheet, setSheet] = useState<null | "more" | "owner" | "report" | "members">(null);

  const isOwner = !!channel && !!subs.myId && subs.myId === channel.author.id;
  const endDate = channel && !isOwner ? channelSubEnd(subs.index, channel) : "";
  const subscribed = !!endDate;
  const pending = !!channel && subs.pending.has(channel.id) && !subscribed;
  const canView = isOwner || subscribed;
  const mySub = channel ? subs.index.subByChannel.get(channel.id) : undefined;

  // a post of this channel with something new (a comment, a reply, a like) that is not among the loaded ones goes on top as a highlighted post
  // (the dock badge of «Каналы» counts it, so it has to be found here); at most 5
  const offIds = useMemo(
    () => (canView && posts ? unreadOffList(channel ? unread.byChannel[channel.id]?.ideas ?? [] : [], posts.map((p) => p.id), 5) : []),
    [canView, posts, channel, unread.byChannel],
  );
  const fetchedPosts = useUnreadIdeaCards(offIds);
  const shownPosts = useMemo(() => [...offIds.map((id) => fetchedPosts[id] as PostItem | undefined).filter((p): p is PostItem => !!p), ...(posts ?? [])], [offIds, fetchedPosts, posts]);

  const loadPosts = useCallback(async () => {
    if (!channel) return;
    try {
      const r = await fetch(`/api/ideas?channelId=${channel.id}&limit=50`, { cache: "no-store" });
      const j = await r.json();
      const arr = j.data || j.ideas || (Array.isArray(j) ? j : []);
      setPosts(Array.isArray(arr) ? arr : []);
    } catch {
      setPosts([]);
    }
  }, [channel]);
  // the feed depends on who looks: reload when the subscription state is known / changes
  useEffect(() => {
    if (!subs.loaded && !subs.authLoading) return;
    void loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, canView, subs.loaded]);
  useEffect(() => {
    if (!subs.loggedIn) return;
    fetch("/api/telegram/account")
      .then((r) => r.json())
      .then((d) => setTgVerified(Boolean(d?.verified)))
      .catch(() => {});
  }, [subs.loggedIn]);

  // a viewer without access cannot open the posts, so nothing could clear their notifications: read them here
  useEffect(() => {
    if (!channel || !subs.loaded || !subs.loggedIn || canView) return;
    if (!unread.byChannel[channel.id]) return;
    void fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: channel.id }) })
      .then(() => window.dispatchEvent(new Event("fomo:unread-changed")))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id, subs.loaded, subs.loggedIn, canView, !!unread.byChannel[channel?.id ?? ""]]);

  const needLogin = () => nav.go("/login");
  const chatUrl = channel ? `${channelPath(channel)}?chat=1` : "";
  const shareUrl = channel ? `${SHARE_BASE}${channelPath(channel)}` : "";
  const doShare = () => channel && void shareOrCopy(shareUrl, t("channel2.shareText", { name: channel.name }), () => flash(t("appch.linkCopied")));

  async function toggleAuthorTelegram() {
    if (!channel) return;
    const cur = authorTg ?? !!channel.authorTelegramNotify;
    if (!tgVerified && !cur) return flash(t("channel2.connectTelegramFirst"));
    setTgBusy(true);
    try {
      const r = await fetch(`/api/channels/${channel.id}/telegram`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !cur }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) flash(j.error || t("channel2.settingFailed"));
      else setAuthorTg(!cur);
    } finally {
      setTgBusy(false);
    }
  }
  async function toggleMyTelegram() {
    if (!mySub) return;
    const cur = myTg ?? mySub.telegramNotify;
    if (!tgVerified && !cur) return flash(t("channel2.connectTelegramFirst"));
    setTgBusy(true);
    try {
      const r = await fetch(`/api/subscriptions/${mySub.id}/telegram`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !cur }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) flash(j.error || t("channel2.settingFailed"));
      else setMyTg(!cur);
    } finally {
      setTgBusy(false);
    }
  }
  async function togglePin(p: PostItem) {
    setBusyPost(p.id);
    const next = !p.isPinned;
    try {
      const r = await fetch(`/api/ideas/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned: next }) });
      if (!r.ok) throw new Error("pin");
      // the same order the API returns: pinned first
      setPosts((cur) => (cur ? [...cur.map((i) => (i.id === p.id ? { ...i, isPinned: next } : i))].sort((a, b) => (a.isPinned === b.isPinned ? 0 : a.isPinned ? -1 : 1)) : cur));
    } catch {
      flash(t("channel2.pinFailed"));
    }
    setBusyPost(null);
  }
  async function deletePost(p: PostItem) {
    if (!window.confirm(t("channel2.deleteIdeaConfirm"))) return;
    setBusyPost(p.id);
    try {
      const r = await fetch(`/api/ideas/${p.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("del");
      setPosts((cur) => (cur ? cur.filter((i) => i.id !== p.id) : cur));
    } catch {
      flash(t("channel2.deleteIdeaFailed"));
    }
    setBusyPost(null);
  }

  /* ---------- states without a channel ---------- */
  if (chatOpen && channel) return <ChannelChat channel={channel} onBack={nav.back} />;

  const bar = (title: string, right?: Parameters<typeof ChNav>[0]["right"]) => <ChNav back={nav.back} backLabel={nav.backLabel} title={title} right={right} />;
  if (!list.loaded) {
    return (
      <div className="ach">
        {bar(t("appch.channel"))}
        <div className="ach-ebox">{t("common.loading")}</div>
      </div>
    );
  }
  if (!channel) {
    return (
      <div className="ach">
        {bar(t("appch.channel"))}
        <div className="ach-ebox">
          <div style={{ fontSize: 40 }}>{"\u{1F4E1}"}</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--app-tx)" }}>{t(list.failed ? "appch.loadError" : "channels.notFound")}</div>
          <button type="button" className="ach-linkbtn" onClick={() => (list.failed ? void list.reload() : nav.go("/channels"))}>
            {list.failed ? t("appch.retry") : t("channels.backToChannels")}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- the channel ---------- */
  const tags = channelTags(channel);
  const tgOn = authorTg ?? !!channel.authorTelegramNotify;
  const myTgOn = myTg ?? mySub?.telegramNotify ?? false;
  const subsCount = subscribersLabel(channel.subscribersCount, locale);

  const ctaLabel = isOwner ? t("channels.settings") : `${t("appch.buyFor")} ${priceLabel(channel.price, locale)}`;
  const onCta = () => {
    if (isOwner) return setSheet("owner");
    if (!subs.loggedIn) return needLogin();
    setBuying(true);
  };

  const rows: SheetSection[] = [];
  if (canView) {
    rows.push({
      key: "chat",
      rows: [{ key: "chat", label: t("appch.closedChat"), sub: t("appch.closedChatSub"), icon: <AppIcon name="chat" size={17} stroke={1.8} />, chev: true, onClick: () => nav.go(chatUrl) }],
    });
  }
  if (subscribed && mySub) {
    rows.push({
      key: "tg",
      rows: [{ key: "tg", label: t("appch.tgReceive"), sub: tgVerified ? t("channel2.tgMyTitle") : t("appch.tgConnect"), icon: <AppIcon name="send" size={17} stroke={1.8} />, toggle: myTgOn, onClick: tgBusy ? undefined : () => (!tgVerified && !myTgOn ? nav.go("/profile?tab=notifications") : void toggleMyTelegram()) }],
    });
  }
  if (others.length) {
    rows.push({
      key: "others",
      title: t("channels.otherAuthor"),
      rows: others.map((o) => ({ key: o.id, label: o.name, sub: priceAndPeriod(o.price, o.durationDays, locale), icon: <span>{o.avatarUrl ? <img src={o.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : channelEmoji(o.id)}</span>, chev: true, onClick: () => nav.go(channelPath(o), channel.name) })),
    });
  }
  rows.push({
    key: "id",
    rows: [{ key: "id", label: t("appch.channelId"), value: <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 14 }}>{channelSlugOrId(channel).slice(0, 18)}</span>, icon: <AppIcon name="link" size={17} stroke={1.8} />, onClick: doShare }],
    footer: `fomo.spot/channels/${channelSlugOrId(channel)}`,
  });

  const moreSections: SheetSection[] = [
    {
      key: "m",
      rows: [
        { key: "share", label: t("appch.share"), icon: <ChIcon name="share" size={18} />, onClick: () => (setSheet(null), doShare()) },
        { key: "author", label: channel.author.displayName, sub: t("appch.openAuthor"), icon: <AppIcon name="user" size={18} stroke={1.8} />, chev: true, onClick: () => (setSheet(null), nav.go(authorPath({ id: channel.author.id }), channel.name)) },
        ...(!isOwner ? [{ key: "report", label: t("report.button"), icon: <ChIcon name="flag" size={18} />, color: "var(--app-red)", onClick: () => (subs.loggedIn ? setSheet("report") : needLogin()) }] : []),
        ...(isOwner ? [{ key: "settings", label: t("appch.channelSettings"), icon: <ChIcon name="gear" size={18} />, chev: true, onClick: () => setSheet("owner") }] : []),
      ],
    },
  ];
  const ownerSections: SheetSection[] = [
    {
      key: "o1",
      rows: [
        { key: "edit", label: t("appch.editChannel"), sub: t("appch.editChannelSub"), icon: <AppIcon name="pen" size={17} stroke={1.8} />, chev: true, onClick: () => (setSheet(null), nav.go(`/channels/edit/${channel.id}`, channel.name)) },
        { key: "publish", label: t("channels.publish").replace(/^\+\s*/, ""), icon: <AppIcon name="plus" size={17} stroke={1.8} />, chev: true, onClick: () => (setSheet(null), nav.go(`/ideas/new?channelId=${channel.id}`, channel.name)) },
        { key: "members", label: t("subs.channelSubscribers"), value: String(channel.subscribersCount), icon: <AppIcon name="users" size={17} stroke={1.8} />, chev: true, onClick: () => setSheet("members") },
      ],
    },
    {
      key: "o2",
      rows: [{ key: "tg", label: "Telegram", sub: tgVerified ? t("channel2.tgOwnerTitle") : t("channel2.connectBotFirst"), icon: <AppIcon name="send" size={17} stroke={1.8} />, toggle: tgOn, onClick: tgBusy ? undefined : () => (!tgVerified && !tgOn ? nav.go("/profile?tab=notifications") : void toggleAuthorTelegram()) }],
    },
  ];

  return (
    <div className="ach">
      {bar(t("appch.channel"), [
        { key: "share", label: t("appch.share"), icon: <ChIcon name="share" size={22} />, color: "var(--app-green-tx)", onClick: doShare },
        { key: "more", label: t("appch.more"), icon: <AppIcon name="dots" size={22} stroke={2} />, onClick: () => setSheet("more") },
      ])}
      <div className="ach-chan">
        <div className="ach-chead">
          <div className="ach-bigtile">{channel.avatarUrl ? <img src={channel.avatarUrl} alt="" /> : channelEmoji(channel.id)}</div>
          <div className="ach-cname2">{channel.name}</div>
          <button type="button" className="ach-authorlink" onClick={() => nav.go(authorPath({ id: channel.author.id }), channel.name)}>
            {channel.author.displayName} · ★ {ratingText(channel.author.rating)}
          </button>
          {isOwner ? (
            <button type="button" className="ach-subsline" onClick={() => setSheet("members")}>
              {subsCount}
            </button>
          ) : (
            <div className="ach-subsline">{subsCount}</div>
          )}
        </div>
        {channel.description ? <div className="ach-cdesc2">{channel.description}</div> : null}
        {tags.length > 0 && (
          <div className="ach-tags2">
            {tags.map((tg) => (
              <span key={tg}>{tg}</span>
            ))}
          </div>
        )}
        {subscribed && (
          <div className="ach-banner">
            <AppIcon name="check" size={18} stroke={2} />
            {t("appch.activeBanner", { date: endDateLabel(endDate, locale) || "—" })}
          </div>
        )}
        {pending && (
          <div className="ach-banner" data-tone="wait">
            <ChIcon name="clock" size={18} />
            {t("appch.pendingBanner")}
          </div>
        )}
        {isOwner && <div className="ach-banner">{t("channel2.yourChannel")}</div>}

        <div className="ach-caps">{t("channels.tariffs")}</div>
        <div className="ach-tariffs">
          <div className="ach-tariff">
            <div className="ach-radio">
              <div />
            </div>
            <div className="ach-tariff-txt">
              <div className="ach-tariff-name">{periodName(channel.durationDays, locale)}</div>
              <div className="ach-tariff-days">{daysLabel(channel.durationDays, locale)}</div>
            </div>
            <div className="ach-tariff-price">{priceLabel(channel.price, locale)}</div>
          </div>
        </div>
        {(isOwner || !subscribed) && (
          <button type="button" className="ach-cta" onClick={onCta}>
            {ctaLabel}
          </button>
        )}
        <div className="ach-note">{t("appch.note")}</div>

        <Sections sections={rows} />

        <div className="ach-caps" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>
            {t("channels.publications")}
            {posts && posts.length > 0 ? ` · ${posts.length}` : ""}
          </span>
          {isOwner && (
            <button type="button" className="ach-pill" onClick={() => nav.go(`/ideas/new?channelId=${channel.id}`, channel.name)}>
              <AppIcon name="plus" size={14} stroke={2} />
              {t("appch.publish")}
            </button>
          )}
        </div>
        {posts === null ? (
          <div className="ach-note">{t("common.loading")}</div>
        ) : posts.length === 0 ? (
          <div className="ach-note">{t("channels.noPublications")}</div>
        ) : (
          <div className="ach-posts">
            {shownPosts.map((p) => (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {isOwner && (
                  <div className="ach-postacts">
                    <button type="button" disabled={busyPost === p.id} onClick={() => void togglePin(p)}>
                      {p.isPinned ? t("appch.unpin") : t("appch.pin")}
                    </button>
                    <button type="button" onClick={() => nav.go(`/ideas/${p.id}/edit`, channel.name)}>
                      {t("common.edit")}
                    </button>
                    <button type="button" data-tone="danger" disabled={busyPost === p.id} onClick={() => void deletePost(p)}>
                      {t("common.delete")}
                    </button>
                  </div>
                )}
                <div
                  role="link"
                  tabIndex={0}
                  className="ach-post"
                  data-unread={canView ? unreadAccent(unread.byIdea[p.id]) : undefined}
                  data-pinned={p.isPinned ? "1" : undefined}
                  onClick={() => (canView ? nav.go(`/ideas/${p.id}`, channel.name) : subs.loggedIn ? setBuying(true) : needLogin())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLElement).click();
                  }}
                  onCopy={canView ? (e) => e.preventDefault() : undefined}
                  onContextMenu={canView ? (e) => e.preventDefault() : undefined}
                >
                  {canView && <Watermark variant="card" />}
                  <div className="ach-post-title">
                    {p.isPinned && <span className="ach-rank">{"\u{1F4CC}"}</span>}
                    <span>{p.title}</span>
                    {canView && unreadLabel(unread.byIdea[p.id]) && (
                      <span className="app-ubadge" role="status" aria-label={t("appui.unread", { n: unreadLabel(unread.byIdea[p.id]) })}>
                        {unreadLabel(unread.byIdea[p.id])}
                      </span>
                    )}
                  </div>
                  {canView && <UnreadChip entry={unread.byIdea[p.id]} />}
                  {(p.content || p.preview) && (
                    <div className="ach-post-body" data-open={p.content ? "1" : undefined} data-locked={canView ? undefined : "1"}>
                      {p.content || p.preview}
                    </div>
                  )}
                  <div className="ach-post-meta">
                    <span>
                      {[agoLabel(p.createdAt, locale), p.instruments.map((i) => i.name).join(", ")].filter(Boolean).join(" · ")}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                      {!canView && (
                        <span className="ach-lock">
                          <AppIcon name="lock" size={14} stroke={2} />
                          {p.price ? priceLabel(Number(p.price), locale) : t("appch.bySubscription")}
                        </span>
                      )}
                      {canView && p.price ? <span className="ach-lock">{priceLabel(Number(p.price), locale)}</span> : null}
                      <span>{"❤️"} {p.voteScore}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {sheet === "more" && <AppSheet title={channel.name} onClose={() => setSheet(null)} doneLabel={t("appui.chat.done")} sections={moreSections} />}
      {sheet === "owner" && <AppSheet title={t("appch.channelSettings")} onClose={() => setSheet(null)} doneLabel={t("appui.chat.done")} sections={ownerSections} />}
      {sheet === "report" && <AppReportSheet target={{ type: "channel", id: channel.id }} onClose={() => setSheet(null)} flash={flash} />}
      {sheet === "members" && <AppMembersSheet channel={channel} onClose={() => setSheet(null)} onChanged={() => void list.reload()} flash={flash} />}
      {buying && <AppBuySheet channel={channel} onClose={() => setBuying(false)} onDone={() => void subs.reload()} flash={flash} />}
      {toast}
    </div>
  );
}
