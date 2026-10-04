import type { ExternalChannel } from "@/lib/notification-events";
import type { QuietState, SettingsResponse } from "@/lib/notify-settings-types";

/**
 * Client for /api/notification-settings/**. The settings UI talks to this
 * interface only, so the dev preview page (src/app/dev-notifications) can swap
 * in an in-memory mock when there is no database.
 */

export interface PatchBody {
  prefs?: Array<{ event: string; channel: string; enabled: boolean }>;
  quiet?: QuietState;
  reset?: boolean;
}

export interface StartResult {
  ok: boolean;
  error?: string;
  deepLink?: string;
  codeSent?: boolean;
  verified?: boolean;
  secret?: string;
  /** telegram own bot: @name (without @) of the checked bot and its t.me link */
  botUsername?: string;
  botLink?: string;
}

export interface TelegramConfirmResult {
  ok: boolean;
  verified?: boolean;
  error?: string;
  /** connected, but the welcome test message could not be delivered */
  testError?: string;
}

export interface NotifApi {
  load(): Promise<SettingsResponse>;
  patch(body: PatchBody): Promise<SettingsResponse>;
  start(channel: ExternalChannel, body?: Record<string, unknown>): Promise<StartResult>;
  confirm(channel: ExternalChannel, code: string): Promise<{ ok: boolean; error?: string }>;
  /** Telegram own bot: "I pressed Start" — find the chat id, verify the channel, send a test message. */
  confirmTelegram(): Promise<TelegramConfirmResult>;
  test(channel: ExternalChannel | "webpush"): Promise<{ ok: boolean; error?: string }>;
  setEnabled(channel: ExternalChannel, enabled: boolean): Promise<{ ok: boolean; error?: string }>;
  remove(channel: ExternalChannel): Promise<{ ok: boolean }>;
}

const BASE = "/api/notification-settings";

async function json<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

async function send(method: string, url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await json<any>(res) };
  } catch {
    return { ok: false, status: 0, data: { error: "network" } };
  }
}

export const realApi: NotifApi = {
  async load() {
    const r = await send("GET", BASE);
    if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
    return r.data as SettingsResponse;
  },
  async patch(body) {
    const r = await send("PATCH", BASE, body);
    if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
    return r.data as SettingsResponse;
  },
  async start(channel, body) {
    const r = await send("POST", `${BASE}/channels/${channel}/start`, body ?? {});
    return r.ok ? { ...r.data, ok: true } : { ok: false, error: r.data?.error || `HTTP ${r.status}` };
  },
  async confirm(channel, code) {
    const r = await send("POST", `${BASE}/channels/${channel}/confirm`, { code });
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || `HTTP ${r.status}` };
  },
  async confirmTelegram() {
    const r = await send("POST", `${BASE}/channels/telegram/confirm`, {});
    return r.ok ? { ok: true, verified: Boolean(r.data?.verified), testError: r.data?.testError } : { ok: false, error: r.data?.error || `HTTP ${r.status}` };
  },
  async test(channel) {
    const r = await send("POST", `${BASE}/channels/${channel}/test`);
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || `HTTP ${r.status}` };
  },
  async setEnabled(channel, enabled) {
    const r = await send("PATCH", `${BASE}/channels/${channel}`, { enabled });
    return r.ok ? { ok: true } : { ok: false, error: r.data?.error || `HTTP ${r.status}` };
  },
  async remove(channel) {
    const r = await send("DELETE", `${BASE}/channels/${channel}`);
    return { ok: r.ok };
  },
};
