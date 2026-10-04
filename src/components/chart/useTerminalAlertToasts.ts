"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { getTerminalNotifyDefaults, loadTerminalNotifyDefaults } from "@/lib/terminal-alert-defaults-client";
import { pickToAnnounce } from "@/lib/terminal-alert-defaults";

export interface AlertToast {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

interface Row extends AlertToast {
  createdAt: string;
}

/** Two short rising tones (Web Audio, no file). Silent when the browser has no audio or has not allowed it yet. */
export function playAlertBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    for (const [i, f] of [784, 1175].entries()) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t0 + i * 0.18);
      osc.connect(gain);
      osc.start(t0 + i * 0.18);
      osc.stop(t0 + i * 0.18 + 0.3);
    }
    setTimeout(() => void ctx.close().catch(() => {}), 900);
  } catch {
    /* no audio: the pop-up still shows */
  }
}

const SHOW_MS = 25_000;

/**
 * While the terminal is open: when a price / line alert fires (or a server-side calendar reminder arrives) the server pings the
 * user's socket room; this fetches the newest bell rows, and for every alert row not seen before plays a sound and/or returns a
 * pop-up, as set in Settings → Notifications → «Терминал». The rows that were already there at mount are the baseline.
 * The site bell beeps for every new notification; while this hook is mounted it hands the beep for alert rows over to the
 * terminal's own sound switch (window.__fomoTerminalSound, read by NotificationBell).
 */
export function useTerminalAlertToasts(): { toasts: AlertToast[]; dismiss: (id: string) => void } {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const seen = useRef(new Set<string>());

  const dismiss = useCallback((id: string) => setToasts((x) => x.filter((y) => y.id !== id)), []);

  useEffect(() => {
    if (!userId) return;
    void loadTerminalNotifyDefaults();
    (window as unknown as { __fomoTerminalSound?: boolean }).__fomoTerminalSound = true;
    let off = false;

    const fetchRows = async (): Promise<Row[]> => {
      const r = await fetch("/api/notifications?limit=10", { cache: "no-store" });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j.notifications) ? (j.notifications as Row[]) : [];
    };

    // the baseline: what is already in the bell is not announced
    const baseline = fetchRows()
      .then((rows) => {
        for (const n of rows) seen.current.add(n.id);
      })
      .catch(() => {});

    const socket = getSocket(userId);
    const onPing = async () => {
      await baseline;
      let rows: Row[] = [];
      try {
        rows = await fetchRows();
      } catch {
        return;
      }
      if (off) return;
      const fresh = pickToAnnounce(rows, 0, seen.current);
      for (const n of rows) seen.current.add(n.id);
      if (fresh.length === 0) return;
      const d = getTerminalNotifyDefaults();
      if (d.sound) playAlertBeep();
      if (d.popup) {
        setToasts((x) => [...x, ...fresh.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link }))].slice(-4));
      }
    };
    socket.on("new_notification", onPing);
    return () => {
      off = true;
      socket.off("new_notification", onPing);
      (window as unknown as { __fomoTerminalSound?: boolean }).__fomoTerminalSound = false;
    };
  }, [userId]);

  // a pop-up goes away by itself
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setTimeout(() => setToasts((x) => x.slice(1)), SHOW_MS);
    return () => clearTimeout(id);
  }, [toasts]);

  return { toasts, dismiss };
}
