"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { isTerminalSite } from "@/lib/site-mode";
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";
import { parseProfileScreen, profileHref, type ProfileScreen } from "@/lib/app-profile";
import { ProfContext, type MeData, type ProfCtx, type SessionUserLite } from "./ProfileCtx";
import { Loading } from "./parts";
import ProfileHome from "./ProfileHome";
import EditProfile from "./EditProfile";
import MyIdeas from "./MyIdeas";
import RoomsScreen from "./RoomsScreen";
import SecurityScreen from "./SecurityScreen";
import SubsScreen from "./SubsScreen";
import FinanceScreen from "./FinanceScreen";
import NotifScreen from "./NotifScreen";
import AppSettings from "./AppSettings";
import "../chat/app-chat.css";
import "./app-profile.css";

// terminal.fomo.spot: no board, channels or payments
const TERMINAL = isTerminalSite();

/** the list's scroll position survives a visit to a pushed screen (the list unmounts while one is open) */
let savedScroll = 0;

function useMe(userId: string | undefined) {
  const [me, setMe] = useState<MeData | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch(`/api/users/${userId}`);
      if (!r.ok) return;
      const j = (await r.json()) as MeData;
      if (alive.current) setMe(j);
    } catch {
      /* offline: the list shows what the session knows */
    }
  }, [userId]);
  useEffect(() => {
    if (userId) void reload();
    else setMe(null);
  }, [userId, reload]);
  return { me, reload };
}

/**
 * The Профиль tab of the app UI: the prototype's profile screen (hero card, «Как пользоваться», grouped lists) over the site's real data and
 * the screens pushed from it (профиль, финансы, каналы и подписки, мои идеи, комнаты, безопасность, уведомления, приложение). The screen is part of the
 * URL (/profile?tab=finance ...), every pushed screen is a history entry, so the Android Back button returns to the list.
 */
export default function AppProfile() {
  const { t, locale } = useT();
  const { data: session, status, update } = useSession();
  const user = session?.user as SessionUserLite | undefined;
  const router = useRouter();
  const pathname = usePathname() || "/profile";
  const params = useSearchParams();
  const screen: ProfileScreen = useMemo(() => {
    const s = parseProfileScreen(pathname, params.get("tab"));
    // terminal.fomo.spot has no ideas, finance, channels or rooms: their addresses show the list (as the old page falls back to the profile tab)
    return TERMINAL && (s === "finance" || s === "subs" || s === "ideas" || s === "rooms") ? "home" : s;
  }, [pathname, params]);
  const loc = (stripLocale(pathname).locale ?? locale) as Locale;
  const appuiFlag = params.get("appui") || "";
  const { me, reload: reloadMe } = useMe(user?.id);

  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  }, []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  // page chrome: the page is edge to edge, the screens bring their own paddings
  useEffect(() => {
    document.documentElement.classList.add("app-prof-on");
    return () => document.documentElement.classList.remove("app-prof-on");
  }, []);

  const main = () => document.querySelector("main");
  const keep = useMemo(() => {
    const o: Record<string, string> = {};
    if (appuiFlag) o.appui = appuiFlag;
    return o;
  }, [appuiFlag]);

  const go = useCallback(
    (s: ProfileScreen) => {
      if (screen === "home") savedScroll = main()?.scrollTop ?? 0;
      // no spread of the old state: Next marks its own history entries (__NA) and copies its internals itself (as the chat does)
      window.history.pushState({ appProf: 1 }, "", profileHref(loc, s, keep));
    },
    [screen, loc, keep],
  );
  const back = useCallback(() => {
    if (window.history.state?.appProf) window.history.back();
    else window.history.replaceState({ appProf: 1 }, "", profileHref(loc, "home", keep));
  }, [loc, keep]);
  const open = useCallback(
    (path: string) => {
      if (screen === "home") savedScroll = main()?.scrollTop ?? 0;
      router.push(localizedPath(loc, path));
    },
    [router, loc, screen],
  );

  // a new screen starts at its top; the list gets its scroll position back
  useLayoutEffect(() => {
    if (screen !== "home") {
      main()?.scrollTo({ top: 0 });
      return;
    }
    main()?.scrollTo({ top: savedScroll });
    // rows that appear a moment later (counters, the download row) make the page taller: apply once more
    const raf = requestAnimationFrame(() => main()?.scrollTo({ top: savedScroll }));
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  const ctx: ProfCtx = useMemo(
    () => ({ t, locale: loc, user, me, reloadMe, refreshSession: async () => void (await update()), screen, go, back, open, flash }),
    [t, loc, user, me, reloadMe, update, screen, go, back, open, flash],
  );

  let body;
  // only the very first session read shows the spinner: a refresh after an edit (update()) must not unmount the open screen
  if (status === "loading" && !user) {
    body = <Loading label={t("common.loading")} />;
  } else if (!user) {
    body = <ProfileHome />; // a guest: the sign-in card of the home list
  } else
  switch (screen) {
    case "edit":
      body = <EditProfile />;
      break;
    case "ideas":
      body = <MyIdeas />;
      break;
    case "rooms":
      body = <RoomsScreen />;
      break;
    case "security":
      body = <SecurityScreen />;
      break;
    case "subs":
      body = <SubsScreen />;
      break;
    case "finance":
      body = <FinanceScreen />;
      break;
    case "notifications":
      body = <NotifScreen />;
      break;
    case "app":
      body = <AppSettings />;
      break;
    default:
      body = <ProfileHome />;
  }

  return (
    <ProfContext.Provider value={ctx}>
      <div className="ac ap" data-screen={screen}>
        {body}
        {toast && (
          <div className="ac ac-toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </ProfContext.Provider>
  );
}
