/**
 * Encryption of the market-data keys users paste into Settings -> Data providers (server only).
 * AES-256-GCM; the 32-byte key is derived (scrypt) from DATA_KEYS_SECRET, or from AUTH_SECRET / NEXTAUTH_SECRET when it is not set, so the site
 * needs no new environment variable. Changing that secret makes the stored keys unreadable (users paste them again): `decryptKey` then returns null.
 * A key is never logged and never leaves the server.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

let cached: { secret: string; key: Buffer } | null = null;

function masterKey(): Buffer | null {
  const secret = (process.env.DATA_KEYS_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (!secret) return null;
  if (cached && cached.secret === secret) return cached.key;
  const key = scryptSync(secret, "fomo-data-connections-v1", 32);
  cached = { secret, key };
  return key;
}

/** True when keys can be stored (a server secret exists). */
export const cryptoReady = (): boolean => masterKey() !== null;

export function encryptKey(plain: string): string | null {
  const k = masterKey();
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptKey(packed: string): string | null {
  const k = masterKey();
  if (!k) return null;
  try {
    const [iv, tag, enc] = packed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !enc) return null;
    const d = createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
