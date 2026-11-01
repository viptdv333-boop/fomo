// Account mirror: ONE account on fomo.spot and terminal.fomo.spot, kept in sync between the two databases (docs/terminal-instance.md,
// section "Единый аккаунт"). Each site keeps its own database; only the account (e-mail, password HASH, profile) is copied from one
// instance to the other, server to server, over the loopback ports of the two pm2 apps. Everything else (alerts, watchlists, ideas,
// subscriptions, messages) is never shared.
//
// This file is the pure part: no Next, no Prisma, no Node-only modules (Web Crypto only), so it is safe in the edge bundle that
// imports auth.ts and is unit-tested by scripts/check-account-mirror.ts:
//   - configuration (the feature is OFF unless both ACCOUNT_MIRROR_SECRET and ACCOUNT_MIRROR_PEER_URL are set and valid)
//   - request signing / verification (HMAC-SHA256 over timestamp + nonce + body, 60 s replay window, constant-time compare)
//   - the wire format (zod) and the whitelist of profile fields, the status mapping, the fomoId collision rule, avatar path checks.
// The sending side is account-mirror-client.ts, the receiving side account-mirror-server.ts + api/internal/account-mirror.
import { z } from "zod/v4";
import { FOMO_ID_REGEX } from "./fomoId";

export const MIRROR_PATH = "/api/internal/account-mirror";
export const HEADER_TIMESTAMP = "x-mirror-timestamp";
export const HEADER_NONCE = "x-mirror-nonce";
export const HEADER_SIGNATURE = "x-mirror-signature";
/** A signed request is accepted only when its timestamp is within this distance of the receiver's clock; nonces are remembered for 2x. */
export const REPLAY_WINDOW_MS = 60_000;
export const MAX_BODY_BYTES = 64 * 1024;
export const MIN_SECRET_LENGTH = 32;
/** One try now, then after 0.4 s and 1.2 s; each try has its own timeout (see account-mirror-client.ts). */
export const BACKOFF_MS = [0, 400, 1200] as const;
export const REQUEST_TIMEOUT_MS = 3500;

// ---------------------------------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------------------------------

export interface MirrorConfig {
  secret: string;
  /** origin of the OTHER instance, no trailing slash, e.g. http://127.0.0.1:3100 */
  peerUrl: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Origin of the peer, or null when the value is not acceptable: plain http only to loopback, https elsewhere, origin only, no credentials. */
export function normalizePeerUrl(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  if (u.pathname.replace(/\/+$/, "") !== "" || u.search || u.hash) return null;
  if (u.protocol === "http:") return LOOPBACK_HOSTS.has(u.hostname) ? u.origin : null;
  if (u.protocol === "https:") return u.origin;
  return null;
}

/** null = the mirror is OFF (a missing or invalid variable switches the whole feature off, nothing else changes). */
export function mirrorConfig(env: Record<string, string | undefined> = process.env): MirrorConfig | null {
  const secret = (env.ACCOUNT_MIRROR_SECRET ?? "").trim();
  if (secret.length < MIN_SECRET_LENGTH) return null;
  const peerUrl = normalizePeerUrl(env.ACCOUNT_MIRROR_PEER_URL);
  if (!peerUrl) return null;
  return { secret, peerUrl };
}

// ---------------------------------------------------------------------------------------------------------------------
// Signing (Web Crypto: available in Node 20+ and in the edge runtime)
// ---------------------------------------------------------------------------------------------------------------------

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await globalThis.crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/** Compares two strings in time that depends only on their length (and the length of a hex SHA-256 digest is public). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newNonce(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return toHex(b);
}

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SIG_RE = /^[0-9a-f]{64}$/;
const TS_RE = /^\d{10,16}$/;

export interface SignedHeaders {
  timestamp: string;
  nonce: string;
  signature: string;
}

/** The signature covers timestamp, nonce and the exact body text: `${timestamp}.${nonce}.${body}`. */
export async function signRequest(secret: string, body: string, now: number = Date.now(), nonce: string = newNonce()): Promise<SignedHeaders> {
  const timestamp = String(now);
  return { timestamp, nonce, signature: await hmacHex(secret, `${timestamp}.${nonce}.${body}`) };
}

export type VerifyInput = {
  secret: string | undefined | null;
  body: string;
  timestamp: string | null | undefined;
  nonce: string | null | undefined;
  signature: string | null | undefined;
  now?: number;
};

/** True only for a fresh (inside the replay window), well-formed, correctly signed request. Any other outcome is just false. */
export async function verifyRequest(i: VerifyInput): Promise<boolean> {
  const secret = (i.secret ?? "").trim();
  if (secret.length < MIN_SECRET_LENGTH) return false;
  const { timestamp, nonce, signature } = i;
  if (!timestamp || !nonce || !signature) return false;
  if (!TS_RE.test(timestamp) || !NONCE_RE.test(nonce) || !SIG_RE.test(signature)) return false;
  const now = i.now ?? Date.now();
  if (Math.abs(now - Number(timestamp)) > REPLAY_WINDOW_MS) return false;
  const expected = await hmacHex(secret, `${timestamp}.${nonce}.${i.body}`);
  return constantTimeEqual(expected, signature);
}

/** Remembers nonces for twice the replay window, so a captured request cannot be replayed while its timestamp is still acceptable. */
export class NonceCache {
  private seen = new Map<string, number>();
  constructor(private readonly ttlMs: number = REPLAY_WINDOW_MS * 2, private readonly max: number = 10_000) {}

  /** true = the nonce is new (and is now remembered); false = it was already used. */
  fresh(nonce: string, now: number = Date.now()): boolean {
    if (this.seen.size >= this.max / 2) {
      for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
    }
    const exp = this.seen.get(nonce);
    if (exp !== undefined && exp > now) return false;
    if (this.seen.size >= this.max) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.seen.set(nonce, now + this.ttlMs);
    return true;
  }
}

/** HTTP statuses worth another try: the peer is restarting, busy or rate limiting. 404 (feature off / secret mismatch) and 4xx are final. */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// ---------------------------------------------------------------------------------------------------------------------
// Account status mapping
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The status a mirrored account gets on the other site. Both sites approve a new account immediately after the e-mail code
 * (status APPROVED, role USER; there is no admin approval), so a mirrored account is APPROVED too. The wire format carries NO
 * status or role: the receiver always sets APPROVED / USER, so the mirror cannot be used to grant roles or to unban anybody.
 * An account that is not APPROVED on the source (an abandoned PENDING signup, a BANNED user) is not mirrored at all: null.
 */
export function mirroredStatus(sourceStatus: string | null | undefined): "APPROVED" | null {
  return sourceStatus === "APPROVED" ? "APPROVED" : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Profile whitelist
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Plain profile fields of User that are the same on both sites (kept in sync in both directions on every change).
 * Per-field decision is listed in docs/terminal-instance.md; scripts/check-account-mirror.ts makes sure every scalar field of the
 * User model is in exactly one of PROFILE_FIELDS / PROFILE_EXCLUDED, so a new column cannot become mirrored (or forgotten) silently.
 */
export const PROFILE_FIELDS = [
  "displayName",
  "fomoId",
  "bio",
  "avatarUrl",
  "firstName",
  "lastName",
  "birthDate",
  "city",
  "workplace",
  "exchangeExperience",
  "specializations",
  "socialLinks",
  "locale",
  "dmEnabled",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * Deliberately NOT mirrored. identity and credentials have their own operations (email, password); role / status / ban fields and
 * rating belong to the local site (the admin of one site must not rule the other); money fields and the prices of fomo.spot's
 * services stay on fomo.spot; the rest is bookkeeping of the local database. Relations (ideas, tariffs, education, alerts ...) are not columns.
 */
export const PROFILE_EXCLUDED = [
  "id",
  "email",
  "passwordHash",
  "role",
  "status",
  "bannedUntil",
  "banReason",
  "rating",
  "ratingBonus",
  "sessionVersion",
  "subscriptionPrice",
  "lastPublishedAt",
  "paymentCard",
  "donationCard",
  "sbpQrUrl",
  "createdAt",
  "updatedAt",
] as const;

export const LOCALES = ["ru", "en", "cn"] as const;

/** Avatars are uploaded to /uploads/avatars/<userId>/<uuid>.<ext> (src/lib/upload.ts). Anything else (external URL, other folder) is not mirrored. */
const AVATAR_PATH_RE = /^\/uploads\/avatars\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.(?:jpg|jpeg|png|webp|gif)$/;
export function isMirrorAvatarPath(v: unknown): v is string {
  return typeof v === "string" && v.length <= 200 && AVATAR_PATH_RE.test(v);
}

const str = (max: number) => z.string().max(max);
const isoDate = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "bad date");

const socialLinksSchema = z.object({
  telegram: str(200).optional(),
  vk: str(200).optional(),
  youtube: str(200).optional(),
  whatsapp: str(200).optional(),
  max: str(200).optional(),
  website: str(500).optional(),
});

const profileShape = {
  displayName: z.string().min(1).max(100),
  fomoId: z.string().regex(FOMO_ID_REGEX),
  bio: str(500).nullable(),
  avatarUrl: z.string().regex(AVATAR_PATH_RE).max(200).nullable(),
  firstName: str(100).nullable(),
  lastName: str(100).nullable(),
  birthDate: isoDate.nullable(),
  city: str(100).nullable(),
  workplace: str(200).nullable(),
  exchangeExperience: str(100).nullable(),
  specializations: z.array(str(100)).max(50),
  socialLinks: socialLinksSchema.nullable(),
  locale: z.enum(LOCALES),
  dmEnabled: z.boolean(),
};

/** Every field optional: a partial update carries only what changed; a field that is absent is never touched. */
export const profileSchema = z.object({
  displayName: profileShape.displayName.optional(),
  fomoId: profileShape.fomoId.optional(),
  bio: profileShape.bio.optional(),
  avatarUrl: profileShape.avatarUrl.optional(),
  firstName: profileShape.firstName.optional(),
  lastName: profileShape.lastName.optional(),
  birthDate: profileShape.birthDate.optional(),
  city: profileShape.city.optional(),
  workplace: profileShape.workplace.optional(),
  exchangeExperience: profileShape.exchangeExperience.optional(),
  specializations: profileShape.specializations.optional(),
  socialLinks: profileShape.socialLinks.optional(),
  locale: profileShape.locale.optional(),
  dmEnabled: profileShape.dmEnabled.optional(),
});
export type MirrorProfile = z.infer<typeof profileSchema>;

/** A new account needs a display name; everything else is optional. */
export const newProfileSchema = profileSchema.extend({ displayName: profileShape.displayName });

const emailSchema = z.email().max(254);
const bcryptSchema = z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);

export const mirrorMessageSchema = z.discriminatedUnion("op", [
  // sign-up on the other site: create the account, or complete an abandoned PENDING one (exactly what the local sign-up does)
  z.object({ op: z.literal("register"), email: emailSchema, passwordHash: bcryptSchema, profile: newProfileSchema }),
  // first successful login on the other site: create the account only if the address is absent, never touch an existing one
  z.object({ op: z.literal("ensure"), email: emailSchema, passwordHash: bcryptSchema, profile: newProfileSchema }),
  z.object({ op: z.literal("password"), email: emailSchema, passwordHash: bcryptSchema }),
  z.object({ op: z.literal("email"), email: emailSchema, newEmail: emailSchema }),
  z.object({ op: z.literal("profile"), email: emailSchema, profile: profileSchema }),
]);
export type MirrorMessage = z.infer<typeof mirrorMessageSchema>;

type UserLike = Record<string, unknown>;

/**
 * Whitelisted profile fields of a user record (or of a Prisma update `data` object) in wire form: only the keys that are present and
 * valid; Date -> ISO string; an avatar that is not one of our uploads is left out. Money fields, role, status etc. cannot get through.
 */
export function profileFromUser(u: UserLike): MirrorProfile {
  const out: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) {
    const v = u[f];
    if (v === undefined) continue;
    if (f === "birthDate") {
      if (v === null) out[f] = null;
      else if (v instanceof Date && !Number.isNaN(v.getTime())) out[f] = v.toISOString();
      else if (typeof v === "string" && !Number.isNaN(Date.parse(v))) out[f] = new Date(v).toISOString();
    } else if (f === "avatarUrl") {
      if (v === null || v === "") out[f] = null;
      else if (isMirrorAvatarPath(v)) out[f] = v;
    } else if (f === "specializations") {
      if (Array.isArray(v)) out[f] = v.filter((x): x is string => typeof x === "string");
    } else if (f === "socialLinks") {
      if (v === null) out[f] = null;
      else if (typeof v === "object") out[f] = v;
    } else if (f === "locale") {
      if (typeof v === "string" && (LOCALES as readonly string[]).includes(v)) out[f] = v;
    } else if (f === "dmEnabled") {
      if (typeof v === "boolean") out[f] = v;
    } else {
      if (v === null || typeof v === "string") out[f] = v;
    }
  }
  return out as MirrorProfile;
}

/**
 * Prisma `data` for the plain fields of a received profile. fomoId (uniqueness) and avatarUrl (a file is fetched and stored locally)
 * are NOT here: the receiver handles those two itself. Only keys that arrived are returned.
 */
export function profileToPrismaData(p: MirrorProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) {
    if (f === "fomoId" || f === "avatarUrl") continue;
    const v = p[f];
    if (v === undefined) continue;
    if (f === "birthDate") out[f] = v === null ? null : new Date(v as string);
    else out[f] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// fomoId collisions, avatar files
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The fomoId a mirrored account gets when the wanted one is already taken by ANOTHER user on the receiving site: the wanted id
 * (cut to leave room) + "_" + 4 hex characters of SHA-256(lower-cased e-mail). Deterministic (a retry produces the same id), valid
 * under FOMO_ID_REGEX. If even that is taken, the receiver falls back to a random generated id; the caller reports it either way.
 */
export async function altFomoId(wanted: string, email: string): Promise<string> {
  const tag = (await sha256Hex(email.trim().toLowerCase())).slice(0, 4);
  return `${wanted.slice(0, 33 - 5)}_${tag}`;
}

/** Image kind from the first bytes (the type header of a response is not trusted). */
export function sniffImage(b: Uint8Array): "jpeg" | "png" | "webp" | "gif" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "gif";
  return null;
}

/** Largest avatar file the receiver fetches from the peer (the upload route stores 200x200 JPEGs, a few tens of KB; originals up to 5 MB are possible on a sharp failure). */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** The only URL the receiver ever fetches an avatar from: the configured peer origin + a validated upload path. null for anything else. */
export function avatarFetchUrl(peerUrl: string, avatarPath: string): string | null {
  const origin = normalizePeerUrl(peerUrl);
  if (!origin || !isMirrorAvatarPath(avatarPath)) return null;
  return origin + avatarPath;
}

// ---------------------------------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------------------------------

/** What the receiver reports back (never contains an e-mail, hash or other personal data). */
export type MirrorResult =
  | "created" // account created
  | "completed" // an abandoned PENDING signup was completed
  | "exists" // the address is already an account here: left untouched
  | "alias_conflict" // another account here is the same mailbox under another spelling (gmail dots / plus): not created
  | "updated"
  | "noop" // already in the wanted state
  | "not_found" // no account here for this address
  | "conflict"; // the new e-mail already belongs to another account here

export interface MirrorReply {
  ok: true;
  result: MirrorResult;
  /** the wanted fomoId was taken, another one was given (created / completed) */
  fomoIdChanged?: boolean;
  /** profile fields that could not be applied (taken fomoId, avatar that could not be fetched) */
  skipped?: string[];
}
