"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";
import { chatQuery, parseChatRoute, type ChatRoute, type ChatSeg } from "@/lib/app-chat";
import ChatRoom from "@/components/chat/ChatRoom";
import AppChatList from "./AppChatList";
import AppDmThread from "./AppDmThread";
import AppGroupsScreen from "./AppGroupsScreen";
import AppNewChatSheet from "./AppNewChatSheet";
import AppDialogSheet from "./AppDialogSheet";
import { useDmMarks } from "./useChatPrefs";
import type { Conversation } from "./useAppChatData";
import { deleteGroup, inviteGroup, leaveGroup } from "./groupActions";
import type { RoomInfo as RoomSheetInfo } from "./AppRoomThread";
import { ThreadBar } from "./AppThreadParts";
import { useAppDms, useAppRooms } from "./useAppChatData";
import "./app-chat.css";

const CATS_KEY = "fomo-app-chat-cats";
/** the list scroll position survives a visit to a thread (the list unmounts while a thread is open) */
let savedScroll = 0;

function readCats(): Set<string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(CATS_KEY) || "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

type RoomInfo = ReturnType<ReturnType<typeof useAppRooms>["findRoom"]>;

/**
 * Name and flags of the opened room. A public room the list already knows needs no request; a private group is asked for its
 * closed / archived flags (the list does not carry them); a room the list does not know (deep link, link from a notification) is looked up.
 */
function useRoomMeta(roomId: string | null, listed: RoomInfo, listLoaded: boolean) {
  const [fetched, setFetched] = useState<{ id: string; name: string; isClosed: boolean; isArchived: boolean; description?: string | null; isOwner?: boolean; inviteToken?: string; membersCount?: number } | null>(null);
  const [fail, setFail] = useState<{ id: string; state: "denied" | "missing" } | null>(null);
  const needFetch = !!roomId && (listed ? listed.isPrivate : listLoaded);
  useEffect(() => {
    if (!roomId || !needFetch) return;
    let alive = true;
    void (async () => {
      try {
        const priv = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`);
        if (priv.ok) {
          const j = await priv.json();
          if (alive) setFetched({ id: roomId, name: j.name, isClosed: !!j.isClosed, isArchived: !!j.isArchived, description: j.description, isOwner: !!j.isOwner, inviteToken: j.inviteToken, membersCount: j.membersCount });
          return;
        }
        if (priv.status === 403) {
          if (alive) setFail({ id: roomId, state: "denied" });
          return;
        }
        if (listed) return; // a private group of the list that the server no longer answers for keeps the list's data
        const pub = await fetch("/api/chat/rooms");
        const list = pub.ok ? ((await pub.json()) as { id: string; name: string; isClosed?: boolean; isArchived?: boolean }[]) : [];
        const f = Array.isArray(list) ? list.find((r) => r.id === roomId) : null;
        if (!alive) return;
        if (f) setFetched({ id: roomId, name: f.name, isClosed: !!f.isClosed, isArchived: !!f.isArchived });
        else setFail({ id: roomId, state: "missing" });
      } catch {
        if (alive && !listed) setFail({ id: roomId, state: "missing" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, needFetch]);

  if (!roomId) return { meta: null, state: "loading" as const };
  if (fetched && fetched.id === roomId) return { meta: fetched, state: "ok" as const };
  if (fail && fail.id === roomId) return { meta: null, state: fail.state };
  if (listed) return { meta: { name: listed.name, isClosed: listed.isClosed, isArchived: listed.isArchived }, state: "ok" as const };
  return { meta: null, state: "loading" as const };
}

/**
 * The Chat tab of the app UI («Болталка» + «Личные»): the prototype's chat screens over the site's real data. One component for /chat and
 * /messages; the screen is part of the URL (?room= / ?dm= / ?groups=1, ?seg=dms for the personal list), every opened screen is a history
 * entry, so the Android Back button returns from a thread to the list.
 */
export default function AppChat() {
  const { t, locale } = useT();
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const pathname = usePathname() || "/chat";
  const params = useSearchParams();
  const route = useMemo(() => parseChatRoute(pathname, params), [pathname, params]);
  const inThread = !!(route.room || route.dm || route.with);

  const rooms = useAppRooms(t("chat2.otherCategory"));
  const dms = useAppDms();
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set());
  const [newChat, setNewChat] = useState(false);
  const [dialogMenu, setDialogMenu] = useState<Conversation | null>(null);
  const marks = useDmMarks();
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);
  useEffect(() => setOpenCats(readCats()), []);

  // page chrome: the page is edge to edge, a thread hides the dock (as in the design)
  useEffect(() => {
    document.documentElement.classList.add("app-chat-on");
    return () => document.documentElement.classList.remove("app-chat-on");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("app-thread-on", inThread);
    return () => document.documentElement.classList.remove("app-thread-on");
  }, [inThread]);

  const base = useMemo(() => localizedPath(stripLocale(pathname).locale ?? (locale as Locale), "/chat"), [pathname, locale]);
  const urlFor = useCallback(
    (r: Partial<ChatRoute>) => {
      const qs = chatQuery(r);
      const keep = new URLSearchParams(window.location.search);
      const extra: string[] = [];
      for (const k of ["appui", "shared"]) if (keep.get(k)) extra.push(`${k}=${encodeURIComponent(keep.get(k)!)}`);
      const all = [qs, ...extra].filter(Boolean).join("&");
      return all ? `${base}?${all}` : base;
    },
    [base],
  );

  const main = () => document.querySelector("main");
  const go = useCallback(
    (r: Partial<ChatRoute>, replace = false) => {
      if (!replace && !inThread) savedScroll = main()?.scrollTop ?? 0;
      // no spread of the old state: Next marks its own history entries (__NA) and ignores the URL of those; it copies its internals itself
      // a pushed screen is marked (Back returns to the list); a replaced one keeps the mark of the entry it replaces (a deep link stays unmarked)
      const state = replace && !window.history.state?.appChat ? {} : { appChat: 1 };
      if (replace) window.history.replaceState(state, "", urlFor(r));
      else window.history.pushState(state, "", urlFor(r));
    },
    [urlFor, inThread],
  );
  /** «Назад»: one step back when this screen was opened from the list, otherwise straight to the list */
  const back = useCallback(() => {
    if (window.history.state?.appChat) window.history.back();
    else window.history.replaceState({ appChat: 1 }, "", urlFor({ seg: route.seg }));
  }, [urlFor, route.seg]);

  const setSeg = (s: ChatSeg) => go({ seg: s }, true);
  const toggleCat = (slug: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      try {
        sessionStorage.setItem(CATS_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });

  // back on the list: refresh what happened in the thread, then restore the scroll position
  const wasThread = useRef(inThread);
  useEffect(() => {
    if (wasThread.current && !inThread) {
      rooms.reload();
      void dms.reload();
    }
    wasThread.current = inThread;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inThread]);
  const onList = !inThread && !route.groups;
  useLayoutEffect(() => {
    if (onList) main()?.scrollTo({ top: savedScroll });
  }, [onList]);

  /* ---- ?with=<userId>: start (or reopen) the conversation, then show it ---- */
  useEffect(() => {
    if (!route.with || !myId) return;
    let alive = true;
    void (async () => {
      if (route.with === myId) return go({ seg: "dms" }, true);
      try {
        const r = await fetch("/api/messages/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: route.with }) });
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok && j.id) {
          void dms.reload();
          go({ dm: j.id }, true);
        } else {
          flash(j?.error || t("appui.chat.sendFailed"));
          go({ seg: "dms" }, true);
        }
      } catch {
        if (alive) go({ seg: "dms" }, true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.with, myId]);

  const listedRoom = route.room ? rooms.findRoom(route.room, t("chat.generalChat")) : null;
  const { meta, state } = useRoomMeta(route.room, listedRoom, rooms.loaded);
  // what the room sheet shows for a private group (the list knows its owner flag and invite token, the room request adds the description)
  const privateListed = route.room ? rooms.privateRooms.find((r) => r.id === route.room) : undefined;
  const roomInfo: RoomSheetInfo | undefined = route.room
    ? {
        isPrivate: !!(listedRoom?.isPrivate || privateListed || (meta && "isOwner" in meta && meta.isOwner !== undefined)),
        isOwner: !!(privateListed?.isOwner ?? (meta && "isOwner" in meta ? meta.isOwner : false)),
        description: meta && "description" in meta ? meta.description : null,
        membersCount: privateListed?.membersCount ?? (meta && "membersCount" in meta ? meta.membersCount : undefined),
        flash,
        onInvite: () => {
          const token = privateListed?.inviteToken ?? (meta && "inviteToken" in meta ? meta.inviteToken : undefined);
          if (meta) void inviteGroup({ name: meta.name, inviteToken: token }, t, flash);
        },
        onDelete: () =>
          void deleteGroup(route.room!, t).then((ok) => {
            if (ok) {
              rooms.reloadPrivate();
              back();
            }
          }),
        onLeave: () =>
          void leaveGroup({ id: route.room!, name: meta?.name || "" }, t).then((ok) => {
            if (ok) {
              rooms.reloadPrivate();
              back();
            }
          }),
      }
    : undefined;
  // a stale ?dm= (conversation not in the list after a reload of the list): ask once more
  const dmConv = route.dm ? dms.conversations.find((c) => c.id === route.dm) || null : null;
  useEffect(() => {
    if (route.dm && dms.loaded && !dmConv) void dms.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.dm, dms.loaded]);

  const startWith = useCallback(
    (userId: string) => {
      setNewChat(false);
      go({ with: userId });
    },
    [go],
  );

  let screen;
  if (route.room) {
    screen =
      state === "ok" && meta ? (
        <ChatRoom key={route.room} appVariant appInfo={roomInfo} onBack={back} roomId={route.room} roomName={meta.name} isClosed={meta.isClosed} isArchived={meta.isArchived} />
      ) : (
        <div className="ac ac-thread">
          <ThreadBar title={state === "loading" ? "…" : t(state === "denied" ? "chat2.noAccess" : "chat2.groupNotFound")} onBack={back} />
          <div className="ac-msgs">
            <div className="ac-empty">{state === "loading" ? t("common.loading") : state === "denied" ? t("chat2.groupClosedAskInvite") : t("appui.chat.groupOpenFailed")}</div>
          </div>
        </div>
      );
  } else if (route.dm) {
    screen = <AppDmThread key={route.dm} convId={route.dm} conv={dmConv} online={!!dmConv?.otherUser && dms.online.has(dmConv.otherUser.id)} onBack={back} onChanged={() => void dms.reload()} flash={flash} />;
  } else if (route.with) {
    screen = (
      <div className="ac ac-thread">
        <ThreadBar title="…" onBack={back} />
        <div className="ac-msgs">
          <div className="ac-empty">{t("common.loading")}</div>
        </div>
      </div>
    );
  } else if (route.groups) {
    screen = <AppGroupsScreen rooms={rooms.privateRooms} onBack={back} onOpen={(id) => go({ room: id })} onChanged={rooms.reloadPrivate} flash={flash} />;
  } else {
    screen = (
      <AppChatList
        seg={route.seg}
        onSeg={setSeg}
        rooms={rooms}
        dms={dms}
        query={query}
        onQuery={setQuery}
        openCats={openCats}
        onToggleCat={toggleCat}
        myId={myId}
        onOpenRoom={(id) => go({ room: id })}
        onOpenDm={(id) => go({ dm: id })}
        onCreate={() => go({ groups: true })}
        onNewChat={() => setNewChat(true)}
        marks={marks}
        onDialogMenu={setDialogMenu}
      />
    );
  }

  return (
    <>
      {screen}
      {dialogMenu && <AppDialogSheet conv={dialogMenu} marks={marks} onClose={() => setDialogMenu(null)} flash={flash} />}
      {newChat && <AppNewChatSheet onClose={() => setNewChat(false)} onPick={startWith} myId={myId} />}
      {toast && <div className="ac ac-toast" role="status">{toast}</div>}
    </>
  );
}
