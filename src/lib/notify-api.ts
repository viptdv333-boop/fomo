import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { EXTERNAL_CHANNELS, isExternalChannel, type ExternalChannel } from "@/lib/notification-events";
import { ADAPTERS } from "@/lib/notify-channels";
import { siteBotConfigured } from "@/lib/notify-channels/telegram";
import { isPushConfigured } from "@/lib/push";
import { channelStatus, maskAddress } from "@/lib/notify-link";
import type { ChannelState, SettingsResponse } from "@/lib/notify-settings-types";

/** Shared plumbing of the /api/notification-settings/** routes. */

export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function parseChannelParam(raw: string): ExternalChannel | null {
  return isExternalChannel(raw) ? raw : null;
}

/** Fixed-window limiter wrapper that answers 429 in the request's language. */
export async function limited(key: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const r = await rateLimit(key, limit, windowMs);
  if (r.allowed) return null;
  const { t } = await getT();
  return NextResponse.json({ error: t("ns.err.rate"), retryAfterSec: r.retryAfterSec }, { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } });
}

export async function loadSettings(userId: string): Promise<SettingsResponse> {
  const [rows, prefs, setting, devices, user] = await Promise.all([
    prisma.notificationChannel.findMany({ where: { userId } }),
    prisma.notificationPref.findMany({ where: { userId }, select: { event: true, channel: true, enabled: true } }),
    prisma.notificationSetting.findUnique({ where: { userId } }),
    prisma.pushSubscription.count({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);

  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  const now = Date.now();
  const channels: ChannelState[] = EXTERNAL_CHANNELS.map((channel) => {
    const row = byChannel.get(channel) ?? null;
    const configured = ADAPTERS[channel].isConfigured();
    return {
      channel,
      configured,
      status: channelStatus(configured, row),
      address: maskAddress(channel, row?.address ?? null),
      label: row?.label ?? null,
      verified: Boolean(row?.verified),
      enabled: Boolean(row?.enabled),
      lastError: row?.lastError ?? null,
      lastSentAt: row?.lastSentAt?.toISOString() ?? null,
      // Telegram only: connected through the user's own bot (token in `secret`, which is never sent to the client) / site bot also available.
      ...(channel === "telegram" ? { ownBot: Boolean(row?.secret), siteBot: siteBotConfigured() } : {}),
      pendingUntil: row && !row.verified && row.linkExpiresAt && row.linkExpiresAt.getTime() > now ? row.linkExpiresAt.toISOString() : null,
    };
  });

  return {
    channels,
    overrides: Object.fromEntries(prefs.map((p) => [`${p.event}:${p.channel}`, p.enabled])),
    quiet: {
      enabled: setting?.quietEnabled ?? false,
      startMin: setting?.quietStartMin ?? 1380,
      endMin: setting?.quietEndMin ?? 480,
      timezone: setting?.timezone ?? "Europe/Moscow",
    },
    webpush: { configured: isPushConfigured(), devices },
    accountEmail: maskAddress("email", user?.email ?? null),
  };
}
