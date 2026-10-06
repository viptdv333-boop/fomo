"use client";

import { useCallback, useEffect, useState } from "react";
import { DM_KEYS, DM_PIN_MAX, FONT_DEFAULT, NO_MARKS, parseFontLevel, parseIdList, toggleId, togglePin, type DmMarks } from "@/lib/app-chat";

/*
 * The personal chats keep their marks (pinned, starred person, muted) and the look settings (background, text size, notification switch)
 * exactly where the old «Личные» page kept them: in this device's localStorage, under the same keys, so both pages always agree.
 */

const EVENT = "fomo:chat-prefs";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the mark lives until the page is closed */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Pinned chats (at most 5), starred people and muted chats of the personal list. */
export function useDmMarks(): DmMarks & {
  togglePinned: (convId: string) => boolean;
  toggleFavorite: (userId: string) => void;
  toggleMuted: (convId: string) => void;
} {
  const [marks, setMarks] = useState<DmMarks>(NO_MARKS);
  useEffect(() => {
    const load = () =>
      setMarks({ pinned: parseIdList(read(DM_KEYS.pinned)), favorites: parseIdList(read(DM_KEYS.favorites)), muted: parseIdList(read(DM_KEYS.muted)) });
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  /** false when a sixth pin was refused */
  const togglePinned = useCallback((convId: string) => {
    const cur = parseIdList(read(DM_KEYS.pinned));
    const next = togglePin(cur, convId, DM_PIN_MAX);
    if (next.length === cur.length && !cur.includes(convId)) return false;
    write(DM_KEYS.pinned, JSON.stringify(next));
    return true;
  }, []);
  const toggleFavorite = useCallback((userId: string) => write(DM_KEYS.favorites, JSON.stringify(toggleId(parseIdList(read(DM_KEYS.favorites)), userId))), []);
  const toggleMuted = useCallback((convId: string) => write(DM_KEYS.muted, JSON.stringify(toggleId(parseIdList(read(DM_KEYS.muted)), convId))), []);
  return { ...marks, togglePinned, toggleFavorite, toggleMuted };
}

/** Chat background, message text size (0..10) and the chat notification switch of the old settings gear. */
export function useChatLook() {
  const [bg, setBgState] = useState("default");
  const [font, setFontState] = useState(FONT_DEFAULT);
  const [notif, setNotifState] = useState(true);
  useEffect(() => {
    const load = () => {
      setBgState(read(DM_KEYS.bg) || "default");
      setFontState(parseFontLevel(read(DM_KEYS.font)));
      setNotifState(read(DM_KEYS.notif) !== "off");
    };
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return {
    bg,
    font,
    notif,
    setBg: (id: string) => write(DM_KEYS.bg, id),
    setFont: (n: number) => write(DM_KEYS.font, String(n)),
    setNotif: (on: boolean) => write(DM_KEYS.notif, on ? "on" : "off"),
  };
}
