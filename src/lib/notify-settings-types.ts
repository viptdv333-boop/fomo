import type { ChannelStatus } from "@/lib/notify-status";
import type { ExternalChannel } from "@/lib/notification-events";

/** Shapes shared by GET /api/notification-settings and the settings UI (client-safe: types only). */

export interface ChannelState {
  channel: ExternalChannel;
  /** the admin has set the env vars this channel needs */
  configured: boolean;
  status: ChannelStatus;
  /** masked, e.g. "a***@gmail.com" */
  address: string | null;
  label: string | null;
  verified: boolean;
  enabled: boolean;
  lastError: string | null;
  lastSentAt: string | null;
  /** a code / deep link is waiting to be confirmed until this moment */
  pendingUntil: string | null;
}

export interface QuietState {
  enabled: boolean;
  startMin: number;
  endMin: number;
  timezone: string;
}

export interface SettingsResponse {
  channels: ChannelState[];
  /** explicit overrides only, keyed `${event}:${channel}` */
  overrides: Record<string, boolean>;
  quiet: QuietState;
  webpush: { configured: boolean; devices: number };
  /** masked account e-mail, offered as a one-click "use my account e-mail" */
  accountEmail: string | null;
}
