"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";
import AppIcon from "../AppIcon";

/** Page chrome of the channel / author screens: the page is edge to edge (the screens bring their own paddings), as for the chat. */
export function useChannelsChrome() {
  useEffect(() => {
    document.documentElement.classList.add("app-ch-on");
    return () => document.documentElement.classList.remove("app-ch-on");
  }, []);
}

/** A small toast like the chat's. */
export function useFlash() {
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2000);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const node = msg ? (
    <div className="ach ach-toast" role="status">
      {msg}
    </div>
  ) : null;
  return { flash, toast: node };
}

const FROM_KEY = "fomo-app-ch-from";

/** A screen opens the next one with the name of itself, so the next one can show «‹ Каналы» in its back button. */
export function rememberFrom(label: string, to: string) {
  try {
    sessionStorage.setItem(FROM_KEY, JSON.stringify({ label, to }));
  } catch {
    /* private mode */
  }
}

function readFrom(pathname: string): string {
  try {
    const v = JSON.parse(sessionStorage.getItem(FROM_KEY) || "null") as { label?: string; to?: string } | null;
    if (v && typeof v.label === "string" && typeof v.to === "string" && new URL(v.to, window.location.href).pathname === pathname) return v.label;
  } catch {
    /* no label */
  }
  return "";
}

/** Navigation of the screens: every screen is a route, so the system Back button (a history step) works with no extra code. */
export function useChNav(fallbackPath: string) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { locale, t } = useT();
  const loc = (stripLocale(pathname).locale ?? locale) as Locale;
  const [from, setFrom] = useState("");
  useEffect(() => setFrom(readFrom(pathname)), [pathname]);
  const href = useCallback((path: string) => localizedPath(loc, path), [loc]);
  const go = useCallback(
    (path: string, label?: string) => {
      const to = localizedPath(loc, path);
      if (label) rememberFrom(label, to);
      router.push(to);
    },
    [router, loc],
  );
  const back = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace(localizedPath(loc, fallbackPath));
  }, [router, loc, fallbackPath]);
  return { go, back, href, backLabel: from || t("common.back"), router, loc };
}

export interface NavButton {
  key: string;
  label: string;
  icon: ReactNode;
  color?: string;
  onClick: () => void;
}

/** The design's pushed-screen bar: «‹ back label», title, up to two icon buttons. Sticks to the top of the scrolling page. */
export function ChNav({ back, backLabel, title, right }: { back: () => void; backLabel: string; title: string; right?: NavButton[] }) {
  return (
    <div className="ach ach-nav">
      <button type="button" className="ach-back" onClick={back} aria-label={backLabel}>
        <AppIcon name="chevL" size={22} stroke={2} />
        <span>{backLabel}</span>
      </button>
      <div className="ach-navtitle">{title}</div>
      <div className="ach-navright">
        {(right ?? []).map((b) => (
          <button key={b.key} type="button" className="ach-navbtn" style={{ color: b.color }} aria-label={b.label} onClick={b.onClick}>
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Share through the system sheet when the browser has one, else copy the link. */
export async function shareOrCopy(url: string, title: string, onCopied: () => void) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ url, title });
      return;
    }
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    onCopied();
    return;
  } catch {
    /* fall through to the old copy */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    onCopied();
  } catch {
    /* nothing more to try */
  }
}

/** Image or initials in a round / rounded tile. */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className: string }) {
  return (
    <div className={className}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <span>{name}</span>
      )}
    </div>
  );
}
