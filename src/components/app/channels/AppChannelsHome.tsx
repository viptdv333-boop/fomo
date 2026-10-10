"use client";

import { useLayoutEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useT } from "@/lib/i18n/client";
import {
  authorPath,
  authorPodium,
  authorSubline,
  channelEmoji,
  channelInstruments,
  channelPath,
  channelStatus,
  channelSubEnd,
  channelTags,
  channelsWithInstrument,
  endDateLabel,
  filterAuthors,
  filterChannels,
  ideasLabel,
  isSubscribedToAuthor,
  priceAndPeriod,
  ratingText,
  sortAuthors,
  sortChannels,
  specLabels,
  subscribersLabel,
  topChannelRanks,
  yearsOnExchangeText,
  type AuthorItem,
  type AuthorSort,
  type ChannelItem,
  type ChannelSort,
  type SortDir,
} from "@/lib/app-channels";
import { initials } from "@/lib/app-chat";
import AppIcon from "../AppIcon";
import AppSheet, { type SheetSection } from "../chat/AppSheet";
import "../chat/app-chat.css";
import "./app-channels.css";
import AppBuySheet from "./AppBuySheet";
import ChIcon from "./ChIcon";
import { useChNav, useChannelsChrome, useFlash } from "./chrome";
import { useAuthorList, useChannelList, useMySubs } from "./useChannelsData";
import { useUnreadByIdea } from "../useUnreadByIdea";
import { likeLabel, unreadLabel, unreadAccent } from "@/lib/app-unread";
import { UnreadStripView } from "../AppUnreadStrip";

/** the list scroll survives a visit to a channel / an author (the page is a route, so it unmounts while the detail is open) */
const savedScroll: Record<string, number> = {};

const onEnter = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/**
 * «Каналы» and «Авторы» of the app UI: the prototype's `on.channels` screen (big title, two-halves switch, channel cards / the grouped list of
 * authors) over the site's real channels, tariffs, authors and subscriptions. /channels and /authors are two routes of the same screen.
 */
export default function AppChannelsHome({ seg }: { seg: "channels" | "authors" }) {
  const { t, locale } = useT();
  useChannelsChrome();
  const nav = useChNav("/channels");
  const { flash, toast } = useFlash();
  const subs = useMySubs();
  const unread = useUnreadByIdea(seg === "channels"); // red count of unread comments / new posts per channel
  const chans = useChannelList(seg === "channels");
  const auths = useAuthorList(seg === "authors");
  const [query, setQuery] = useState("");
  const [cSort, setCSort] = useState<{ f: ChannelSort; d: SortDir }>({ f: "subscribers", d: "desc" });
  const [aSort, setASort] = useState<{ f: AuthorSort; d: SortDir }>({ f: "rating", d: "desc" });
  const [instrument, setInstrument] = useState("");
  const [cView, setCView] = useState<"cards" | "list">("cards");
  const [aView, setAView] = useState<"list" | "cards">("list");
  const [sheet, setSheet] = useState(false);
  const [buying, setBuying] = useState<ChannelItem | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const loaded = seg === "channels" ? chans.loaded : auths.loaded;
  const failed = seg === "channels" ? chans.failed : auths.failed;

  // back from a channel / an author: the list comes back where it was
  useLayoutEffect(() => {
    if (!loaded) return;
    document.querySelector("main")?.scrollTo({ top: savedScroll[seg] ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, seg]);

  const channelList = useMemo(() => {
    const all = chans.items ?? [];
    return sortChannels(channelsWithInstrument(filterChannels(all, query), instrument), cSort.f, cSort.d);
  }, [chans.items, query, instrument, cSort]);
  const topRanks = useMemo(() => topChannelRanks(chans.items ?? []), [chans.items]);
  const instruments = useMemo(() => channelInstruments(chans.items ?? []), [chans.items]);

  const authorList = useMemo(() => {
    const all = auths.items ?? [];
    return sortAuthors(filterAuthors(all, query, (a) => specLabels(a.specializations, t).join(" ")), aSort.f, aSort.d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auths.items, query, aSort, locale]);
  const podium = useMemo(() => authorPodium(auths.items ?? []), [auths.items]);

  const needLogin = () => {
    nav.go("/login");
  };
  // the scroll is taken at the tap: Next resets the page while it navigates
  const keepScroll = () => {
    savedScroll[seg] = document.querySelector("main")?.scrollTop ?? 0;
  };
  const openChannel = (c: ChannelItem) => {
    keepScroll();
    nav.go(channelPath(c), t("nav.channels"));
  };
  const openAuthor = (a: AuthorItem) => {
    keepScroll();
    nav.go(authorPath(a), t(seg === "authors" ? "nav.authors" : "nav.channels"));
  };

  async function toggleFollow(a: AuthorItem) {
    if (!subs.loggedIn) return needLogin();
    if (followBusy) return;
    setFollowBusy(a.id);
    const was = isSubscribedToAuthor(subs.index, a.id);
    // optimistic: the pill flips at once, the server's answer corrects it
    subs.setIndex((cur) => {
      const follows = new Set(cur.follows);
      if (was) follows.delete(a.id);
      else follows.add(a.id);
      return { ...cur, follows };
    });
    try {
      const r = await fetch(`/api/users/${a.id}/follow`, { method: "POST" });
      if (!r.ok) throw new Error("follow");
      const j = (await r.json()) as { following: boolean };
      subs.setIndex((cur) => {
        const follows = new Set(cur.follows);
        if (j.following) follows.add(a.id);
        else follows.delete(a.id);
        return { ...cur, follows };
      });
    } catch {
      subs.setIndex((cur) => {
        const follows = new Set(cur.follows);
        if (was) follows.add(a.id);
        else follows.delete(a.id);
        return { ...cur, follows };
      });
      flash(t("appch.actionFailed"));
    }
    setFollowBusy(null);
  }

  const filtersOn = seg === "channels" ? !!instrument || !!query || cSort.f !== "subscribers" || cSort.d !== "desc" || cView !== "cards" : aSort.f !== "rating" || aSort.d !== "desc" || aView !== "list";
  const resetFilters = () => {
    setQuery("");
    setInstrument("");
    setCSort({ f: "subscribers", d: "desc" });
    setASort({ f: "rating", d: "desc" });
    setCView("cards");
    setAView("list");
  };

  /* ---------- sheet with the old pages' sort / filter / view controls ---------- */
  const dirMark = (d: SortDir) => (d === "desc" ? "↓" : "↑");
  const sections: SheetSection[] = [];
  if (seg === "channels") {
    const sortRow = (f: ChannelSort, label: string) => ({
      key: `s-${f}`,
      label,
      check: cSort.f === f,
      value: cSort.f === f ? dirMark(cSort.d) : undefined,
      onClick: () => setCSort((cur) => (cur.f === f ? { f, d: cur.d === "desc" ? "asc" : "desc" } : { f, d: "desc" })),
    });
    sections.push({ key: "sort", title: t("appch.sort"), rows: [sortRow("subscribers", t("appch.sortSubscribers")), sortRow("rating", t("authors.rating")), sortRow("price", t("channels.price"))] });
    if (instruments.length) {
      sections.push({
        key: "inst",
        title: t("channels.instrument"),
        rows: [{ key: "i-all", label: t("channels.allInstruments"), check: !instrument, onClick: () => setInstrument("") }, ...instruments.map((i) => ({ key: `i-${i.id}`, label: `#${i.ticker || i.name}`, sub: i.ticker && i.ticker !== i.name ? i.name : undefined, check: instrument === i.id, onClick: () => setInstrument(i.id) }))],
      });
    }
    sections.push({
      key: "view",
      title: t("appch.view"),
      rows: [
        { key: "v-cards", label: t("channel2.viewCards"), check: cView === "cards", onClick: () => setCView("cards") },
        { key: "v-list", label: t("channel2.viewList"), check: cView === "list", onClick: () => setCView("list") },
      ],
    });
  } else {
    const sortRow = (f: AuthorSort, label: string) => ({
      key: `s-${f}`,
      label,
      check: aSort.f === f,
      value: aSort.f === f ? dirMark(aSort.d) : undefined,
      onClick: () => setASort((cur) => (cur.f === f ? { f, d: cur.d === "desc" ? "asc" : "desc" } : { f, d: "desc" })),
    });
    sections.push({ key: "sort", title: t("appch.sort"), rows: [sortRow("rating", t("authors.rating")), sortRow("createdAt", t("authors.byDate")), sortRow("subscribersCount", t("authors.popularity")), sortRow("ideasCount", t("appch.sortIdeas"))] });
    sections.push({
      key: "view",
      title: t("appch.view"),
      rows: [
        { key: "v-list", label: t("channel2.viewList"), check: aView === "list", onClick: () => setAView("list") },
        { key: "v-cards", label: t("channel2.viewCards"), check: aView === "cards", onClick: () => setAView("cards") },
      ],
    });
  }
  const more: SheetSection["rows"] = [{ key: "mysubs", label: t("profile.subscriptions"), icon: <AppIcon name="card" size={18} stroke={1.8} />, chev: true, onClick: () => nav.go("/subscriptions", t("nav.channels")) }];
  if (seg === "channels" && subs.loggedIn) more.unshift({ key: "create", label: t("channels.create"), icon: <AppIcon name="plus" size={18} stroke={1.8} />, chev: true, onClick: () => nav.go("/channels/create", t("nav.channels")) });
  sections.push({ key: "more", rows: more });

  /* ---------- pieces ---------- */
  const statusFor = (c: ChannelItem) => {
    const own = !!subs.myId && c.author.id === subs.myId;
    const end = channelSubEnd(subs.index, c);
    const st = channelStatus({ own, endDate: end, pending: subs.pending.has(c.id) });
    const label = st.kind === "own" ? t("appch.statusOwn") : st.kind === "active" ? (endDateLabel(st.endDate, locale) ? t("appch.statusUntil", { date: endDateLabel(st.endDate, locale) }) : t("channels.subscribed")) : st.kind === "pending" ? t("appch.statusPending") : t("appch.statusBuy");
    return { kind: st.kind, label };
  };
  const onPill = (e: { stopPropagation: () => void }, c: ChannelItem, kind: string) => {
    if (kind !== "buy") return; // own / active / pending: the pill is part of the card, the card opens the channel
    e.stopPropagation();
    if (!subs.loggedIn) return needLogin();
    setBuying(c);
  };

  // the «ТОП 1..3» / owner marks of the old pages: a small chip on the tile / avatar, so the lines of the design keep their width
  const topBadge = (rank: number | undefined) => (rank === undefined ? null : <span className="ach-chip">{rank === 0 ? "\u{1F451}" : t(`top.${rank}`)}</span>);

  const unreadPill = (c: ChannelItem) => {
    const n = unreadLabel(unread.byChannel[c.id]);
    const lk = likeLabel(unread.byChannel[c.id]);
    if (!n && !lk) return null;
    return (
      <>
        {n && (
          <span className="app-ubadge" role="status" aria-label={t("appui.unread", { n })}>
            {n}
          </span>
        )}
        {lk && (
          <span className="app-ulike" role="status" aria-label={t("appui.likesUnread", { n: lk })}>
            {"♥"} {lk}
          </span>
        )}
      </>
    );
  };

  const channelCard = (c: ChannelItem) => {
    const st = statusFor(c);
    const tags = channelTags(c);
    return (
      <div key={c.id} role="link" tabIndex={0} className="ach-card" data-unread={unreadAccent(unread.byChannel[c.id])} onClick={() => openChannel(c)} onKeyDown={onEnter(() => openChannel(c))}>
        <div className="ach-ctop">
          <div className="ach-tile">
            {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : channelEmoji(c.id)}
            {topBadge(topRanks.get(c.id))}
          </div>
          <div className="ach-ctxt">
            <div className="ach-cname">
              <span>{c.name}</span>
              {unreadPill(c)}
            </div>
            <div className="ach-csub">
              {c.author.displayName} · ★ {ratingText(c.author.rating)} · {subscribersLabel(c.subscribersCount, locale)}
            </div>
          </div>
        </div>
        {c.description ? <div className="ach-cdesc">{c.description}</div> : null}
        {tags.length > 0 && (
          <div className="ach-tags">
            {tags.map((tg) => (
              <span key={tg}>{tg}</span>
            ))}
          </div>
        )}
        <div className="ach-cfoot">
          <div className="ach-from">
            {c.price > 0 ? (
              <>
                {t("appch.from")} <b>{priceAndPeriod(c.price, c.durationDays, locale)}</b>
              </>
            ) : (
              <b>{t("appch.free")}</b>
            )}
          </div>
          <span className="ach-status" data-kind={st.kind} onClick={(e) => onPill(e, c, st.kind)}>
            {st.label}
          </span>
        </div>
      </div>
    );
  };

  const channelRow = (c: ChannelItem, last: boolean) => {
    const st = statusFor(c);
    return (
      <div key={c.id} role="link" tabIndex={0} className="ach-arow" data-unread={unreadAccent(unread.byChannel[c.id])} onClick={() => openChannel(c)} onKeyDown={onEnter(() => openChannel(c))}>
        <div className="ach-avatar ach-avatar-sq">
          {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : <span className="ach-emoji">{channelEmoji(c.id)}</span>}
          {topBadge(topRanks.get(c.id))}
        </div>
        <div className="ach-abody" data-last={last ? "1" : undefined}>
          <div className="ach-atxt">
            <div className="ach-aname">
              <span className="ach-ellip">{c.name}</span>
              {unreadPill(c)}
            </div>
            <div className="ach-asub">
              {c.author.displayName} · {c.price > 0 ? priceAndPeriod(c.price, c.durationDays, locale) : t("appch.free")}
            </div>
          </div>
          <span className="ach-status" data-kind={st.kind} onClick={(e) => onPill(e, c, st.kind)}>
            {st.kind === "active" ? t("channels.subscribed") : st.label}
          </span>
        </div>
      </div>
    );
  };

  const authorPill = (a: AuthorItem) => {
    const me = !!subs.myId && a.id === subs.myId;
    const on = isSubscribedToAuthor(subs.index, a.id);
    const kind = me ? "me" : on ? "on" : "off";
    return (
      <button
        type="button"
        className="ach-subpill"
        data-kind={kind}
        disabled={me}
        onClick={(e) => {
          e.stopPropagation();
          if (!me) void toggleFollow(a);
        }}
      >
        {me ? t("appch.you") : on ? t("channels.subscribed") : t("channels.subscribe")}
      </button>
    );
  };

  const authorSub = (a: AuthorItem) => authorSubline(specLabels(a.specializations, t), yearsOnExchangeText(a.exchangeExperience, locale)) || ideasLabel(a.ideasCount, locale);

  const authorRow = (a: AuthorItem, last: boolean) => (
    <div key={a.id} role="link" tabIndex={0} className="ach-arow" onClick={() => openAuthor(a)} onKeyDown={onEnter(() => openAuthor(a))}>
      <div className="ach-avatar">
        {a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : initials(a.displayName || "?")}
        {topBadge(podium.get(a.id))}
      </div>
      <div className="ach-abody" data-last={last ? "1" : undefined}>
        <div className="ach-atxt">
          <div className="ach-aname">
            <span className="ach-ellip">
              {a.displayName} <span className="ach-rate">★ {ratingText(a.rating)}</span>
            </span>
          </div>
          <div className="ach-asub">{authorSub(a)}</div>
        </div>
        {authorPill(a)}
      </div>
    </div>
  );

  const authorCard = (a: AuthorItem) => (
    <div key={a.id} role="link" tabIndex={0} className="ach-acard" onClick={() => openAuthor(a)} onKeyDown={onEnter(() => openAuthor(a))}>
      <div className="ach-avatar ach-avatar-lg">
        {a.avatarUrl ? <img src={a.avatarUrl} alt="" /> : initials(a.displayName || "?")}
        {topBadge(podium.get(a.id))}
      </div>
      <div className="ach-acname">
        <span className="ach-ellip">{a.displayName}</span>
      </div>
      {a.fomoId && <div className="ach-asub">#{a.fomoId}</div>}
      <div className="ach-astats">
        <div>
          <b>★ {ratingText(a.rating)}</b>
          <span>{t("authors.rating")}</span>
        </div>
        <div>
          <b>{a.ideasCount}</b>
          <span>{t("authors.ideasLabel")}</span>
        </div>
        <div>
          <b>{a.subscribersCount}</b>
          <span>{t("appch.subsShort")}</span>
        </div>
      </div>
      {authorPill(a)}
    </div>
  );

  const total = seg === "channels" ? (chans.items ?? []).length : (auths.items ?? []).length;
  const shown = seg === "channels" ? channelList.length : authorList.length;
  const searching = !!query.trim() || !!instrument;

  return (
    <div className="ach ach-list">
      <div className="ach-top">
        <div className="ach-title">{t(seg === "channels" ? "nav.channels" : "nav.authors")}</div>
        <div className="ach-topbtns">
          <button type="button" className="ach-pill ach-pill-ico" data-on={filtersOn ? "1" : undefined} aria-label={t("appch.filters")} onClick={() => setSheet(true)}>
            <ChIcon name="sliders" size={18} stroke={1.9} />
          </button>
          {seg === "channels" && subs.loggedIn && (
            <button type="button" className="ach-pill" onClick={() => nav.go("/channels/create", t("nav.channels"))}>
              <AppIcon name="plus" size={14} stroke={2} />
              {t("appch.create")}
            </button>
          )}
        </div>
      </div>

      <div className="ach-seg" role="tablist">
        {(["channels", "authors"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={seg === k} data-on={seg === k ? "1" : undefined} onClick={() => k !== seg && nav.router.replace(nav.href(`/${k}`))}>
            {t(k === "channels" ? "nav.channels" : "nav.authors")}
          </button>
        ))}
      </div>

      {/* everything the «Каналы» dock badge counts (new posts, comments, likes), one tap to the oldest unread post */}
      {seg === "channels" && <UnreadStripView bucket={unread.channels} scope="channels" />}

      {seg === "channels" ? <div className="ach-intro">{t("appch.intro")}</div> : (
        <div className="ach-search">
          <AppIcon name="search" size={18} stroke={1.8} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("appch.searchAuthors")} enterKeyHint="search" />
        </div>
      )}

      {!loaded ? (
        <div className="ach-empty">{t("common.loading")}</div>
      ) : shown === 0 ? (
        <div className="ach-empty">
          <div className="ach-empty-title">{failed && total === 0 ? t("appch.loadError") : searching ? t(seg === "channels" ? "channels.notFoundResult" : "authors.notFoundResult") : t(seg === "channels" ? "channels.empty" : "feed2.noAuthorsYet")}</div>
          <div>{searching ? t("authors.changeFilters") : t(seg === "channels" ? "channels.emptyHelp" : "authors.empty")}</div>
          {searching && (
            <button type="button" className="ach-linkbtn" onClick={resetFilters}>
              {t("channels.resetFilters")}
            </button>
          )}
          {failed && total === 0 && (
            <button type="button" className="ach-linkbtn" onClick={() => void (seg === "channels" ? chans.reload() : auths.reload())}>
              {t("appch.retry")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="ach-count">{shown === total ? `${t("channels.totalCount")} ${total}` : `${t("channels.foundCount")} ${shown} / ${total}`}</div>
          {seg === "channels" ? (
            cView === "cards" ? (
              channelList.map(channelCard)
            ) : (
              <div className="ach-group">{channelList.map((c, i) => channelRow(c, i === channelList.length - 1))}</div>
            )
          ) : aView === "list" ? (
            <div className="ach-group">{authorList.map((a, i) => authorRow(a, i === authorList.length - 1))}</div>
          ) : (
            <div className="ach-agrid">{authorList.map(authorCard)}</div>
          )}
        </>
      )}

      {sheet && (
        <AppSheet
          title={t("appch.filters")}
          onClose={() => setSheet(false)}
          left={{ label: t("appch.reset"), onClick: resetFilters }}
          doneLabel={t("appui.chat.done")}
          height="full"
          search={seg === "channels" ? { value: query, ph: t("appch.searchChannels"), onChange: setQuery } : undefined}
          sections={sections}
        />
      )}
      {buying && <AppBuySheet channel={buying} onClose={() => setBuying(null)} onDone={() => void subs.reload()} flash={flash} />}
      {toast}
    </div>
  );
}
