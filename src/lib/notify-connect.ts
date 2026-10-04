import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  checkSecret,
  consumeLinkToken,
  newCode,
  newLinkToken,
  type ConsumeResult,
  type LinkStore,
} from "@/lib/notify-link";
import type { ExternalChannel } from "@/lib/notification-events";

/** DB side of the connect flows. The pure logic (hashing, expiry, one-time use) is in notify-link.ts. */

export const prismaLinkStore: LinkStore = {
  async findByHash(channel, hash) {
    return prisma.notificationChannel.findFirst({
      where: { channel, linkTokenHash: hash },
      select: { id: true, userId: true, linkExpiresAt: true },
    });
  },
  async claim(id, hash, data) {
    const r = await prisma.notificationChannel.updateMany({
      where: { id, linkTokenHash: hash },
      data: {
        address: data.address,
        label: data.label ?? null,
        verified: true,
        enabled: true,
        linkTokenHash: null,
        linkExpiresAt: null,
        attempts: 0,
        failCount: 0,
        lastError: null,
      },
    });
    return r.count === 1;
  },
};

/** Deep-link flow, step 1: a one-time token the user carries into the bot. */
export async function startDeepLink(userId: string, channel: ExternalChannel): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash, expiresAt } = newLinkToken();
  await prisma.notificationChannel.upsert({
    where: { userId_channel: { userId, channel } },
    create: { userId, channel, linkTokenHash: hash, linkExpiresAt: expiresAt },
    // A verified row keeps working until the new link is actually used.
    update: { linkTokenHash: hash, linkExpiresAt: expiresAt },
  });
  return { token, expiresAt };
}

/** Deep-link flow, step 2 (called by the bot webhooks). */
export function consumeDeepLink(channel: ExternalChannel, token: string, address: string, label: string | null = null): Promise<ConsumeResult> {
  return consumeLinkToken(prismaLinkStore, channel, token, address, label);
}

/**
 * Code flow (e-mail, WhatsApp), step 1: remember the address as pending and the
 * hash of a fresh 6-digit code. Returns the code so the caller can send it.
 * The channel is unverified until the code is confirmed (changing the address re-verifies).
 */
export async function startCode(userId: string, channel: ExternalChannel, address: string): Promise<{ code: string }> {
  const { code, hash, expiresAt } = newCode();
  await prisma.notificationChannel.upsert({
    where: { userId_channel: { userId, channel } },
    create: { userId, channel, address, linkTokenHash: hash, linkExpiresAt: expiresAt, attempts: 0 },
    update: { address, verified: false, linkTokenHash: hash, linkExpiresAt: expiresAt, attempts: 0, lastError: null, failCount: 0 },
  });
  return { code };
}

export type ConfirmResult = { ok: true } | { ok: false; reason: "no_pending" | "expired" | "wrong" | "too_many" };

/** Code flow, step 2. Wrong guesses are counted; the code dies at MAX_CODE_ATTEMPTS. */
export async function confirmCode(userId: string, channel: ExternalChannel, code: string): Promise<ConfirmResult> {
  const row = await prisma.notificationChannel.findUnique({ where: { userId_channel: { userId, channel } } });
  if (!row || !row.linkTokenHash) return { ok: false, reason: "no_pending" };
  if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: "too_many" };
  const check = checkSecret(row, code.trim());
  if (!check.ok) {
    if (check.reason === "expired") return { ok: false, reason: "expired" };
    const attempts = row.attempts + 1;
    await prisma.notificationChannel.update({
      where: { id: row.id },
      data: attempts >= MAX_CODE_ATTEMPTS ? { attempts, linkTokenHash: null, linkExpiresAt: null } : { attempts },
    });
    return { ok: false, reason: attempts >= MAX_CODE_ATTEMPTS ? "too_many" : "wrong" };
  }
  // One-time: only the request that still sees the hash wins.
  const claimed = await prisma.notificationChannel.updateMany({
    where: { id: row.id, linkTokenHash: row.linkTokenHash },
    data: { verified: true, enabled: true, linkTokenHash: null, linkExpiresAt: null, attempts: 0, failCount: 0, lastError: null },
  });
  return claimed.count === 1 ? { ok: true } : { ok: false, reason: "no_pending" };
}

/** The account e-mail was verified at sign-up (or at change-email), so one click connects it. */
export async function connectAccountEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return null;
  await prisma.notificationChannel.upsert({
    where: { userId_channel: { userId, channel: "email" } },
    create: { userId, channel: "email", address: user.email, verified: true, enabled: true },
    update: { address: user.email, verified: true, enabled: true, linkTokenHash: null, linkExpiresAt: null, attempts: 0, failCount: 0, lastError: null },
  });
  return user.email;
}

/** New HMAC key for a webhook channel (shown to the user once). */
export function newWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export const CODE_TTL_MINUTES = Math.round(CODE_TTL_MS / 60000);
