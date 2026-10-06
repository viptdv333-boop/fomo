"use client";

import { useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { useT } from "@/lib/i18n/client";
import {
  CAT_I18N,
  badgeLabel,
  buildRoomGroups,
  dialogPreviewLine,
  dmUnreadTotal,
  initials,
  listTimeLabel,
  roomPreviewLine,
  sortFilterDialogs,
  type ChatSeg,
  type RoomRowModel,
} from "@/lib/app-chat";
import AppIcon from "../AppIcon";
import type { DmsData, RoomsData } from "./useAppChatData";

interface Props {
  seg: ChatSeg;
  onSeg: (s: ChatSeg) => void;
  rooms: RoomsData;
  dms: DmsData;
  query: string;
  onQuery: (q: string) => void;
  openCats: Set<string>;
  onToggleCat: (slug: string) => void;
  myId: string | undefined;
  onOpenRoom: (id: string) => void;
  onOpenDm: (id: string) => void;
  onCreate: () => void;
  onNewChat: () => void;
}

const press = (fn: () => void) => ({
  role: "button" as const,
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
      e.preventDefault();
      fn();
    }
  },
});

/** The Болталка / Личные list of the app UI: the prototype's `on.chat` screen filled with the site's real rooms and dialogs. */
export default function AppChatList(p: Props) {
  const { t, locale } = useT();
  const { rooms, dms } = p;
  const youWord = t("chat2.youPrefix").replace(/[:\s]+$/, "");
  const fileWord = t("chat2.file");

  const groups = useMemo(
    () =>
      buildRoomGroups({
        categories: rooms.categories,
        privateRooms: rooms.privateRooms,
        favorites: rooms.favorites,
        generalRoomId: rooms.generalRoomId,
        unread: rooms.unread,
        notify: rooms.notify,
        openCats: p.openCats,
        query: p.query,
        labels: { general: t("chat.generalChat"), favorites: t("msg.favorites"), privateGroups: t("chat2.privateGroups"), other: t("chat2.otherCategory") },
        catTitle: (slug, name) => (CAT_I18N[slug] ? t(CAT_I18N[slug]) : name),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms.categories, rooms.privateRooms, rooms.favorites, rooms.generalRoomId, rooms.unread, rooms.notify, p.openCats, p.query, locale],
  );

  const dialogs = useMemo(() => sortFilterDialogs(dms.conversations, p.query, t("msg.deletedUser")), [dms.conversations, p.query]); // eslint-disable-line react-hooks/exhaustive-deps
  const dmBadge = badgeLabel(dmUnreadTotal(dms.conversations));

  const roomRow = (r: RoomRowModel, key: string) => {
    const pv = rooms.previews[r.id];
    const bell = (e: MouseEvent) => {
      e.stopPropagation();
      rooms.toggleNotify(r.id);
    };
    const star = (e: MouseEvent) => {
      e.stopPropagation();
      rooms.toggleFavorite({ roomId: r.id, name: r.name, isPrivate: r.isPrivate, assetSlug: r.assetSlug });
    };
    return (
      <div key={key} className="ac-row" {...press(() => p.onOpenRoom(r.id))}>
        <div className="ac-tile">{r.tile}</div>
        <div className="ac-rbody">
          <div className="ac-rtxt">
            <div className="ac-rline">
              <span className="ac-rname">{r.name}</span>
              <span className="ac-rtime">{pv ? listTimeLabel(pv.createdAt, locale) : ""}</span>
            </div>
            <div className="ac-rlast">{roomPreviewLine(pv, p.myId, youWord, fileWord)}</div>
          </div>
          {r.unread > 0 && <div className="ac-badge">{badgeLabel(r.unread)}</div>}
          <div className="ac-rbtns">
            <button type="button" className="ac-rbtn ac-star" data-on={r.fav ? "1" : undefined} aria-pressed={r.fav} aria-label={t(r.fav ? "msg.removeFav" : "msg.addFav")} onClick={star}>
              {r.fav ? "★" : "☆"}
            </button>
            <button type="button" className="ac-rbtn" data-on={r.bell ? "1" : undefined} aria-pressed={r.bell} aria-label={t(r.bell ? "chat2.notifOn" : "chat2.notifOff")} onClick={bell}>
              <AppIcon name="bell" size={14} stroke={2} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const createLabel = p.seg === "rooms" ? t("chat2.create") : t("appui.chat.newShort");
  const loading = p.seg === "rooms" ? !rooms.loaded : !dms.loaded;

  return (
    <div className="ac ac-list">
      <div className="ac-top">
        <div className="ac-title">{t("msg.title")}</div>
        <button type="button" className="ac-create" onClick={p.seg === "rooms" ? p.onCreate : p.onNewChat}>
          <AppIcon name="plus" size={14} stroke={2} />
          {createLabel}
        </button>
      </div>
      <div className="ac-seg" role="tablist">
        <button type="button" role="tab" aria-selected={p.seg === "rooms"} data-on={p.seg === "rooms" ? "1" : undefined} onClick={() => p.onSeg("rooms")}>
          {t("nav.chat")}
        </button>
        <button type="button" role="tab" aria-selected={p.seg === "dms"} data-on={p.seg === "dms" ? "1" : undefined} onClick={() => p.onSeg("dms")}>
          {t("chat.personal")}
          {dmBadge && <span className="ac-segbadge">{dmBadge}</span>}
        </button>
      </div>
      <div className="ac-search">
        <AppIcon name="search" size={18} stroke={1.8} />
        <input value={p.query} onChange={(e) => p.onQuery(e.target.value)} placeholder={t("appui.chat.search")} aria-label={t("appui.chat.search")} />
      </div>

      {p.seg === "rooms" ? (
        <>
          {groups.map((g) => (
            <div key={g.key} className="ac-group">
              {g.title &&
                (g.collapsible ? (
                  <button type="button" className="ac-gtitle ac-gtitle-btn" aria-expanded={g.open} onClick={() => p.onToggleCat(g.key.slice(4))}>
                    <AppIcon name="chevR" size={14} stroke={2} />
                    <span className="ac-gname">{g.title}</span>
                    {!g.open && g.unread > 0 && <span className="ac-badge">{badgeLabel(g.unread)}</span>}
                    <span className="ac-gcount">{g.count}</span>
                  </button>
                ) : (
                  <div className="ac-gtitle">{g.title}</div>
                ))}
              {g.open && <div className="ac-card">{g.rows.map((r) => roomRow(r, `${g.key}:${r.id}`))}</div>}
            </div>
          ))}
          {loading && <div className="ac-empty">{t("common.loading")}</div>}
          {!loading && rooms.failed && groups.length <= 1 && <div className="ac-empty">{t("appui.chat.loadError")}</div>}
          {!loading && p.query.trim() && groups.length === 0 && <div className="ac-empty">{t("appui.chat.nothing")}</div>}
        </>
      ) : (
        <>
          <div className="ac-group">
            <div className="ac-card">
              <div className="ac-row" {...press(p.onNewChat)}>
                <div className="ac-tile">{"✏️"}</div>
                <div className="ac-rbody">
                  <div className="ac-rtxt">
                    <div className="ac-rline">
                      <span className="ac-rname">{t("msg.newChat")}</span>
                    </div>
                    <div className="ac-rlast">{t("appui.chat.newChatSub")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {dialogs.length > 0 && (
            <div className="ac-group">
              <div className="ac-gtitle">{t("appui.chat.dialogs")}</div>
              <div className="ac-card">
                {dialogs.map((c) => {
                  const name = c.otherUser?.displayName || t("msg.deletedUser");
                  const count = typeof c.unreadCount === "number" ? c.unreadCount : c.unread ? 1 : 0;
                  return (
                    <div key={c.id} className="ac-row" {...press(() => p.onOpenDm(c.id))}>
                      <div className="ac-tile">
                        {c.otherUser?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.otherUser.avatarUrl} alt="" />
                        ) : (
                          initials(name)
                        )}
                      </div>
                      <div className="ac-rbody">
                        <div className="ac-rtxt">
                          <div className="ac-rline">
                            <span className="ac-rname">{name}</span>
                            <span className="ac-rtime">{c.lastMessage ? listTimeLabel(c.lastMessage.createdAt, locale) : ""}</span>
                          </div>
                          <div className="ac-rlast">{dialogPreviewLine(c.lastMessage, p.myId, t("chat2.youPrefix"), fileWord)}</div>
                        </div>
                        {count > 0 && <div className="ac-badge">{badgeLabel(count)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {loading && <div className="ac-empty">{t("common.loading")}</div>}
          {!loading && p.query.trim() && dialogs.length === 0 && <div className="ac-empty">{t("appui.chat.nothing")}</div>}
          {!loading && !p.query.trim() && dialogs.length === 0 && <div className="ac-empty">{t("msg.noDialogs")}</div>}
        </>
      )}
    </div>
  );
}
