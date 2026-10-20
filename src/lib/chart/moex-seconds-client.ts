"use client";

/* Browser side of the MOEX second candles: asks the server once whether they exist for this viewer (feeds the «Секунды» group of the pickers)
   and holds the Socket.IO subscription to one instrument (history of the last hour as the acknowledgement, then live 1-second bars).
   The folding of the 1-second bars into the chart's N-second bars is pure and lives in src/lib/moex-seconds.ts (SecondsAgg). */
import { useEffect, useSyncExternalStore } from "react";
import { getSocket } from "../socket";
import type { SecReason, SecSnapshot, SecState, SecUpdate, SecWire } from "../moex-seconds";
import { getMoexSeconds, setMoexSeconds, subscribeMoexSeconds } from "./timeframes";

/* ── availability ── */

let asking: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;

/** GET /api/moex-seconds -> tells timeframes.ts. A network hiccup leaves the answer unknown and tries again in 30 s. */
export function askMoexSeconds(): Promise<void> {
  if (getMoexSeconds() !== null) return Promise.resolve();
  if (!asking) {
    asking = (async () => {
      try {
        const r = await fetch("/api/moex-seconds", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { enabled?: unknown };
        setMoexSeconds(j.enabled === true);
      } catch {
        clearTimeout(retry);
        retry = setTimeout(() => void askMoexSeconds(), 30_000);
      } finally {
        asking = null;
      }
    })();
  }
  return asking;
}

/** true / false / null (not known yet). Re-renders when the answer arrives; asks the server the first time a MOEX chart is on screen. */
export function useMoexSeconds(source: string): boolean | null {
  const v = useSyncExternalStore(subscribeMoexSeconds, getMoexSeconds, () => null);
  useEffect(() => {
    if (source === "moex" && getMoexSeconds() === null) void askMoexSeconds();
  }, [source]);
  return v;
}

/* ── one instrument over the socket ── */

export interface MoexFeedHandlers {
  onSnapshot: (s: SecSnapshot) => void;
  onBars: (bars: SecWire[]) => void;
  onState: (s: SecState) => void;
  /** the server will not serve this instrument now (final for off / token / guest / unsupported / unknown) */
  onRefused: (reason: SecReason) => void;
}

const RETRY_MS: Partial<Record<SecReason, number>> = { quota: 20_000, limit: 30_000, error: 8_000 };

export class MoexSecondsFeed {
  private key = "";
  private stopped = false;
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private socket;
  private readonly onUpdate = (u: SecUpdate) => {
    if (u && u.key === this.key && Array.isArray(u.bars)) this.h.onBars(u.bars);
  };
  private readonly onSrvState = (u: { key?: string; state?: SecState }) => {
    if (u && u.key === this.key && u.state) this.h.onState(u.state);
  };
  private readonly onConnect = () => this.subscribe();
  private readonly onDisconnect = () => {
    this.h.onState("error");
  };

  constructor(
    private ticker: string,
    userId: string,
    private h: MoexFeedHandlers,
  ) {
    this.socket = getSocket(userId);
  }

  start() {
    this.stopped = false;
    const s = this.socket;
    s.on("seconds_bars", this.onUpdate);
    s.on("seconds_state", this.onSrvState);
    s.on("connect", this.onConnect);
    s.on("disconnect", this.onDisconnect);
    if (s.connected) this.subscribe();
    else this.h.onState("connecting");
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    const s = this.socket;
    s.off("seconds_bars", this.onUpdate);
    s.off("seconds_state", this.onSrvState);
    s.off("connect", this.onConnect);
    s.off("disconnect", this.onDisconnect);
    if (this.key && s.connected) s.emit("seconds_unsubscribe", { key: this.key });
    this.key = "";
  }

  private subscribe() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const my = ++this.seq;
    this.h.onState("connecting");
    this.socket.timeout(50_000).emit("seconds_subscribe", { ticker: this.ticker }, (err: unknown, res?: SecSnapshot | { ok: false; reason: SecReason }) => {
      if (this.stopped || my !== this.seq) return;
      if (err || !res) return this.again("error");
      if (res.ok) {
        this.key = res.key;
        this.h.onSnapshot(res);
        this.h.onState(res.state);
        return;
      }
      this.again(res.reason);
    });
  }

  private again(reason: SecReason) {
    const wait = RETRY_MS[reason];
    if (wait === undefined) {
      this.h.onRefused(reason);
      return;
    }
    // a transient refusal (request limit, busy, a hiccup): the chart says so and the subscription is tried again
    this.h.onRefused(reason);
    this.timer = setTimeout(() => this.subscribe(), wait);
  }
}
