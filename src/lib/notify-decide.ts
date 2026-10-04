import {
  isEnabled,
  isQuietNow,
  getEvent,
  type EventId,
  type ExternalChannel,
  type PrefOverrides,
  type QuietHours,
} from "@/lib/notification-events";

/**
 * The decision step of the dispatcher, kept pure (no DB, no network) so it can
 * be checked exhaustively: which of the user's channels should carry this event?
 */

export interface ChannelLite {
  id: string;
  channel: ExternalChannel;
  address: string | null;
  verified: boolean;
  enabled: boolean;
  secret?: string | null;
}

export interface Decision {
  /** write the bell row */
  inapp: boolean;
  /** send a Web Push to the user's devices */
  webpush: boolean;
  /** external channel rows to send through */
  external: ChannelLite[];
  /** push/external delivery was suppressed by quiet hours */
  heldByQuiet: boolean;
}

export function decide(input: {
  event: EventId;
  overrides?: PrefOverrides;
  channels?: ChannelLite[];
  quiet?: QuietHours | null;
  now?: Date;
}): Decision {
  const { event, overrides, channels = [], quiet, now = new Date() } = input;
  const def = getEvent(event);
  const alwaysOn = Boolean(def?.alwaysOn);
  const inapp = isEnabled(event, "inapp", overrides);

  // Quiet hours hold back everything except the bell — and never an always-on
  // (system/security) message.
  const quiet_ = !alwaysOn && isQuietNow(quiet, now);

  const webpush = !quiet_ && isEnabled(event, "webpush", overrides);

  const external = quiet_
    ? []
    : channels.filter(
        (c) => c.verified && c.enabled && Boolean(c.address) && isEnabled(event, c.channel, overrides)
      );

  const heldByQuiet =
    quiet_ && (isEnabled(event, "webpush", overrides) || channels.some((c) => c.verified && c.enabled && isEnabled(event, c.channel, overrides)));

  return { inapp, webpush, external, heldByQuiet };
}

/// Per-channel anti-spam: at most `limit` messages per `windowMs` per channel
/// row, identical messages inside `dedupeMs` collapse into one. Messages that
/// are dropped are counted, and the count is handed to the next message that
/// does go out ("+N more were not sent") instead of being lost silently.
export class SendGate {
  private windows = new Map<string, { start: number; count: number }>();
  private recent = new Map<string, number>();
  private dropped = new Map<string, number>();

  constructor(
    private limit = 15,
    private windowMs = 60_000,
    private dedupeMs = 30_000
  ) {}

  /** `signature` identifies the message content (title+body+link). */
  check(key: string, signature: string, now = Date.now()): { allowed: boolean; suppressedBefore: number } {
    // Duplicate inside the dedupe window → drop silently (not counted: it is the same message).
    const sigKey = `${key}|${signature}`;
    const last = this.recent.get(sigKey);
    if (last !== undefined && now - last < this.dedupeMs) return { allowed: false, suppressedBefore: 0 };

    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    if (w.count >= this.limit) {
      this.dropped.set(key, (this.dropped.get(key) ?? 0) + 1);
      return { allowed: false, suppressedBefore: 0 };
    }
    w.count++;
    this.recent.set(sigKey, now);
    if (this.recent.size > 5000) this.prune(now);
    const suppressedBefore = this.dropped.get(key) ?? 0;
    if (suppressedBefore) this.dropped.delete(key);
    return { allowed: true, suppressedBefore };
  }

  private prune(now: number) {
    for (const [k, t] of this.recent) if (now - t >= this.dedupeMs) this.recent.delete(k);
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs * 2) this.windows.delete(k);
  }
}
