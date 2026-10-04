import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers of the "connect a channel" flows (no DB, no network):
 *  - deep-link tokens (Telegram / MAX / VK): random, only the SHA-256 is stored,
 *    short-lived, usable exactly once;
 *  - 6-digit codes (e-mail / WhatsApp): same storage, plus a wrong-guess cap;
 *  - the status shown on a channel card.
 */

export const LINK_TOKEN_TTL_MS = 30 * 60 * 1000;
export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 24 random bytes → 32 base64url chars: fits the 64-char [A-Za-z0-9_-] limit of Telegram/MAX start parameters. */
export function newLinkToken(now = Date.now()): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashSecret(token), expiresAt: new Date(now + LINK_TOKEN_TTL_MS) };
}

export function newCode(now = Date.now()): { code: string; hash: string; expiresAt: Date } {
  const code = String(randomInt(100000, 1000000));
  return { code, hash: hashSecret(code), expiresAt: new Date(now + CODE_TTL_MS) };
}

/** Shape check before we even hash a token that came from an inbound webhook. */
export function looksLikeToken(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(s);
}

/** Shape of a Telegram bot token from @BotFather: "<bot id>:<35-char secret>". */
export const TELEGRAM_BOT_TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

export function isTelegramBotToken(s: unknown): s is string {
  return typeof s === "string" && s.length <= 100 && TELEGRAM_BOT_TOKEN_RE.test(s);
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

export type TokenCheck = { ok: true } | { ok: false; reason: "no_token" | "mismatch" | "expired" };

/** Does `presented` match the stored hash and is it still alive? */
export function checkSecret(
  row: { linkTokenHash: string | null; linkExpiresAt: Date | null },
  presented: string,
  now: Date = new Date()
): TokenCheck {
  if (!row.linkTokenHash || !row.linkExpiresAt) return { ok: false, reason: "no_token" };
  if (row.linkExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return safeEqualHex(hashSecret(presented), row.linkTokenHash) ? { ok: true } : { ok: false, reason: "mismatch" };
}

// ---------------------------------------------------------------------------
// One-time consumption of a deep-link token
// ---------------------------------------------------------------------------

export interface LinkStore {
  /** The pending row whose linkTokenHash equals `hash` for this channel. */
  findByHash(channel: string, hash: string): Promise<{ id: string; userId: string; linkExpiresAt: Date | null } | null>;
  /**
   * Atomically fills the row IF its linkTokenHash is still `hash`
   * (UPDATE ... WHERE id AND linkTokenHash = hash). false = somebody else got there first.
   */
  claim(id: string, hash: string, data: { address: string; label?: string | null }): Promise<boolean>;
}

export type ConsumeResult =
  | { ok: true; userId: string; rowId: string }
  | { ok: false; reason: "bad_format" | "unknown" | "expired" | "used" };

export async function consumeLinkToken(
  store: LinkStore,
  channel: string,
  token: string,
  address: string,
  label: string | null = null,
  now: Date = new Date()
): Promise<ConsumeResult> {
  if (!looksLikeToken(token)) return { ok: false, reason: "bad_format" };
  const hash = hashSecret(token);
  const row = await store.findByHash(channel, hash);
  if (!row) return { ok: false, reason: "unknown" };
  if (!row.linkExpiresAt || row.linkExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  const claimed = await store.claim(row.id, hash, { address, label });
  return claimed ? { ok: true, userId: row.userId, rowId: row.id } : { ok: false, reason: "used" };
}

// Card status + address masking live in notify-status.ts (no node:crypto, usable in the browser).
export { channelStatus, maskAddress } from "@/lib/notify-status";
export type { ChannelStatus } from "@/lib/notify-status";
