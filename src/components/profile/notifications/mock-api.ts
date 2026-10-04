import { channelStatus } from "@/lib/notify-status";
import type { ExternalChannel } from "@/lib/notification-events";
import type { ChannelState, SettingsResponse } from "@/lib/notify-settings-types";
import type { NotifApi, PatchBody } from "./api";

/**
 * In-memory stand-in for /api/notification-settings, used ONLY by the dev
 * preview page (src/app/dev-notifications, which 404s in production) when there
 * is no database. Not imported by the real profile page.
 */
export function createMockApi(opts: { failPatch?: boolean; slowMs?: number } = {}): NotifApi {
  const wait = (ms = opts.slowMs ?? 150) => new Promise((r) => setTimeout(r, ms));

  const base = (channel: ExternalChannel, configured: boolean, row: Partial<ChannelState> | null): ChannelState => {
    const r = row ? { verified: true, enabled: true, lastError: null, ...row } : null;
    return {
      channel,
      configured,
      status: channelStatus(configured, r),
      address: r?.address ?? null,
      label: r?.label ?? null,
      verified: Boolean(r?.verified),
      enabled: Boolean(r?.enabled),
      lastError: r?.lastError ?? null,
      lastSentAt: r?.verified ? new Date(Date.now() - 3600_000).toISOString() : null,
      pendingUntil: null,
    };
  };

  let state: SettingsResponse = {
    channels: [
      base("email", true, { address: "a***@gmail.com" }),
      base("telegram", true, null),
      base("whatsapp", false, null),
      base("max", true, null),
      base("vk", false, null),
      base("webhook", true, null),
    ],
    overrides: {},
    quiet: { enabled: false, startMin: 1380, endMin: 480, timezone: "Europe/Moscow" },
    webpush: { configured: true, devices: 1 },
    accountEmail: "a***@gmail.com",
  };

  const set = (channel: ExternalChannel, fn: (c: ChannelState) => ChannelState) => {
    state = { ...state, channels: state.channels.map((c) => (c.channel === channel ? fn(c) : c)) };
  };
  const recompute = (c: ChannelState): ChannelState => ({ ...c, status: channelStatus(c.configured, { verified: c.verified, enabled: c.enabled, lastError: c.lastError }) });
  const clone = (): SettingsResponse => JSON.parse(JSON.stringify(state));

  return {
    async load() {
      await wait();
      return clone();
    },
    async patch(body: PatchBody) {
      await wait(opts.slowMs ?? 250);
      if (opts.failPatch) throw new Error("mock failure");
      if (body.reset) state = { ...state, overrides: {} };
      for (const p of body.prefs ?? []) state = { ...state, overrides: { ...state.overrides, [`${p.event}:${p.channel}`]: p.enabled } };
      if (body.quiet) state = { ...state, quiet: body.quiet };
      return clone();
    },
    async start(channel, body) {
      await wait();
      if (channel === "telegram" || channel === "max" || channel === "vk") {
        set(channel, (c) => recompute({ ...c, verified: false, enabled: true, pendingUntil: new Date(Date.now() + 1800_000).toISOString() }));
        // The "bot webhook" completes the link a few seconds later.
        setTimeout(() => set(channel, (c) => recompute({ ...c, verified: true, address: "•••123", label: "@anna", pendingUntil: null, lastSentAt: null })), 6000);
        return { ok: true, deepLink: `https://t.me/fomo_bot?start=mock-${channel}-token` };
      }
      if (channel === "email") {
        if (body?.useAccountEmail) {
          set("email", (c) => recompute({ ...c, verified: true, address: "a***@gmail.com" }));
          return { ok: true, verified: true };
        }
        set("email", (c) => recompute({ ...c, verified: false, address: "n***@example.com" }));
        return { ok: true, codeSent: true };
      }
      if (channel === "webhook") {
        set("webhook", (c) => recompute({ ...c, verified: true, enabled: true, address: "https://hooks.example.com/•••", label: String(body?.label ?? "") || null }));
        return { ok: true, verified: true, secret: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" };
      }
      set(channel, (c) => recompute({ ...c, verified: false, address: "+79•••••567" }));
      return { ok: true, codeSent: true };
    },
    async confirm(channel, code) {
      await wait();
      if (code !== "123456") return { ok: false, error: "Неверный код (в моке верный: 123456)" };
      set(channel, (c) => recompute({ ...c, verified: true, enabled: true }));
      return { ok: true };
    },
    async test(channel) {
      await wait();
      if (channel === "webpush") return { ok: true };
      const c = state.channels.find((x) => x.channel === channel);
      return c?.verified ? { ok: true } : { ok: false, error: "not connected" };
    },
    async setEnabled(channel, enabled) {
      await wait();
      set(channel, (c) => recompute({ ...c, enabled }));
      return { ok: true };
    },
    async remove(channel) {
      await wait();
      set(channel, (c) => recompute({ ...c, verified: false, enabled: false, address: null, label: null, lastError: null, lastSentAt: null }));
      return { ok: true };
    },
  };
}
