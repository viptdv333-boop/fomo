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
/** Profile edits and the login-time copy: one try now, then after 0.4 s and 1.2 s (the next login / edit repeats them anyway). */
export const BACKOFF_MS = [0, 400, 1200] as const;
/**
 * Sign-up, password change / reset, e-mail change: these must not be lost when the peer restarts (deploy-swap restarts both instances), so
 * the in-process retry runs for about 5 minutes (waits between tries, total 317.6 s). There is NO persistent outbox: a message still
 * pending when THIS process stops is lost (timers are unref'ed so they never hold a graceful shutdown); see docs/terminal-instance.md.
 */
export const CRITICAL_BACKOFF_MS = [0, 400, 1200, 4000, 12000, 30000, 60000, 90000, 120000] as const;
/** Pauses before another try when the peer answers not_found for password / reset / profile (its rename or sign-up copy may still be on the way). */
export const NOT_FOUND_PAUSES_MS = [2000, 5000, 10000] as const;
export const REQUEST_TIMEOUT_MS = 3500;
/** A message that carries an avatar makes the receiver download a file first: the sender waits longer than that download can take. */
export const AVATAR_DOWNLOAD_TIMEOUT_MS = 4000;
export const REQUEST_TIMEOUT_AVATAR_MS = 9000;
/** Operations that change who can sign in: separate (stricter) inbound limit, long retry. */
export const CRITICAL_OPS = ["register", "password", "reset", "email"] as const;
export function isCriticalOp(op: string): boolean {
  return (CRITICAL_OPS as readonly string[]).includes(op);
}
export function backoffFor(op: string): readonly number[] {
  return isCriticalOp(op) ? CRITICAL_BACKOFF_MS : BACKOFF_MS;
}
/** Inbound rate limit buckets (per minute): profile / login-copy noise can never starve a password reset or a sign-up. */
export function inboundBucket(op: string): { key: string; limit: number } {
  return isCriticalOp(op) ? { key: "account-mirror:in:critical", limit: 60 } : { key: "account-mirror:in", limit: 300 };
}

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

export const MIRROR_VERSION = "mirror-v1";
/** "main>terminal": which site sends to which. Part of the signed text, so a request captured in one direction is useless in the other. */
export function mirrorDirection(from: string, to: string): string {
  return `${from}>${to}`;
}

/** What is signed: version, HTTP method, path, direction, timestamp, nonce and the exact body text, separated by "|". */
export function signingString(p: { direction: string; method?: string; path?: string; timestamp: string; nonce: string; body: string }): string {
  return [MIRROR_VERSION, p.method ?? "POST", p.path ?? MIRROR_PATH, p.direction, p.timestamp, p.nonce, p.body].join("|");
}

export async function signRequest(
  secret: string,
  body: string,
  o: { direction: string; method?: string; path?: string; now?: number; nonce?: string },
): Promise<SignedHeaders> {
  const timestamp = String(o.now ?? Date.now());
  const nonce = o.nonce ?? newNonce();
  return { timestamp, nonce, signature: await hmacHex(secret, signingString({ direction: o.direction, method: o.method, path: o.path, timestamp, nonce, body })) };
}

export type VerifyInput = {
  secret: string | undefined | null;
  body: string;
  /** direction the receiver expects, e.g. "terminal>main" on fomo.spot */
  direction: string;
  method?: string;
  path?: string;
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
  const expected = await hmacHex(secret, signingString({ direction: i.direction, method: i.method, path: i.path, timestamp, nonce, body: i.body }));
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

/** Field limits of the wire format. The SENDER clips to exactly these (profileFromUser), so one long value never discards a whole message. */
export const LIMITS = {
  displayName: 100,
  bio: 500,
  firstName: 100,
  lastName: 100,
  city: 100,
  workplace: 200,
  exchangeExperience: 100,
  specialization: 100,
  specializations: 50,
  socialShort: 200,
  website: 500,
} as const;
const SOCIAL_KEYS = ["telegram", "vk", "youtube", "whatsapp", "max", "website"] as const;

const str = (max: number) => z.string().max(max);
const isoDate = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "bad date");

const socialLinksSchema = z.object({
  telegram: str(LIMITS.socialShort).optional(),
  vk: str(LIMITS.socialShort).optional(),
  youtube: str(LIMITS.socialShort).optional(),
  whatsapp: str(LIMITS.socialShort).optional(),
  max: str(LIMITS.socialShort).optional(),
  website: str(LIMITS.website).optional(),
});

const profileShape = {
  displayName: z.string().min(1).max(LIMITS.displayName),
  // optional, never null: fomoId may be NULL in the source database; then the receiver generates one
  fomoId: z.string().regex(FOMO_ID_REGEX),
  bio: str(LIMITS.bio).nullable(),
  avatarUrl: z.string().regex(AVATAR_PATH_RE).max(200).nullable(),
  firstName: str(LIMITS.firstName).nullable(),
  lastName: str(LIMITS.lastName).nullable(),
  birthDate: isoDate.nullable(),
  city: str(LIMITS.city).nullable(),
  workplace: str(LIMITS.workplace).nullable(),
  exchangeExperience: str(LIMITS.exchangeExperience).nullable(),
  specializations: z.array(str(LIMITS.specialization)).max(LIMITS.specializations),
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
  // password change by the user: applied only if the receiver still holds the sender's OLD hash (compare-and-swap); accounts whose
  // passwords differ stay as they are
  z.object({ op: z.literal("password"), email: emailSchema, passwordHash: bcryptSchema, oldHash: bcryptSchema }),
  // password reset (ownership of the mailbox was proven by the code): applied unconditionally, but still only to a plain USER account
  z.object({ op: z.literal("reset"), email: emailSchema, passwordHash: bcryptSchema }),
  // e-mail change: only if the receiver account has the same current hash as the sender's (same person, same password)
  z.object({ op: z.literal("email"), email: emailSchema, newEmail: emailSchema, passwordHash: bcryptSchema }),
  z.object({ op: z.literal("profile"), email: emailSchema, profile: profileSchema }),
  // profile reconcile at login on the TERMINAL: "give me your whitelisted profile" (answered by fomo.spot, the source of truth, and only for plain USER accounts)
  z.object({ op: z.literal("pull"), email: emailSchema }),
]);
export type MirrorMessage = z.infer<typeof mirrorMessageSchema>;

type UserLike = Record<string, unknown>;

/** Cuts to `max` UTF-16 units (what zod's max counts) without leaving half of a surrogate pair at the end. */
export function clip(v: string, max: number): string {
  if (v.length <= max) return v;
  const r = v.slice(0, max);
  const c = r.charCodeAt(r.length - 1);
  return c >= 0xd800 && c <= 0xdbff ? r.slice(0, -1) : r;
}

const TEXT_LIMITS: Record<string, number> = {
  bio: LIMITS.bio,
  firstName: LIMITS.firstName,
  lastName: LIMITS.lastName,
  city: LIMITS.city,
  workplace: LIMITS.workplace,
  exchangeExperience: LIMITS.exchangeExperience,
};

/**
 * Whitelisted profile fields of a user record (or of a Prisma update `data` object) in wire form: only the keys that are present and
 * usable; Date -> ISO string; text clipped to the wire limits, invalid list items dropped; an avatar that is not one of our uploads, a NULL
 * or malformed fomoId and a missing display name are left out (so one odd value never discards the message). Money fields, role, status
 * etc. cannot get through.
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
      if (Array.isArray(v)) {
        out[f] = v
          .filter((x): x is string => typeof x === "string" && x.trim() !== "")
          .map((x) => clip(x, LIMITS.specialization))
          .slice(0, LIMITS.specializations);
      }
    } else if (f === "socialLinks") {
      if (v === null) out[f] = null;
      else if (typeof v === "object" && !Array.isArray(v)) {
        const links: Record<string, string> = {};
        for (const k of SOCIAL_KEYS) {
          const x = (v as Record<string, unknown>)[k];
          if (typeof x === "string") links[k] = clip(x, k === "website" ? LIMITS.website : LIMITS.socialShort);
        }
        out[f] = links;
      }
    } else if (f === "locale") {
      if (typeof v === "string" && (LOCALES as readonly string[]).includes(v)) out[f] = v;
    } else if (f === "dmEnabled") {
      if (typeof v === "boolean") out[f] = v;
    } else if (f === "fomoId") {
      if (typeof v === "string" && FOMO_ID_REGEX.test(v)) out[f] = v;
    } else if (f === "displayName") {
      if (typeof v === "string" && v.trim() !== "") out[f] = clip(v, LIMITS.displayName);
    } else {
      if (v === null) out[f] = null;
      else if (typeof v === "string") out[f] = clip(v, TEXT_LIMITS[f] ?? 500);
    }
  }
  return out as MirrorProfile;
}

/**
 * MAIN WINS: which fields of the profile received from fomo.spot overwrite the local ones. Only fields that HAVE a value there:
 * a null, an empty / blank text, an empty list or an object without any link never blanks what the terminal account already has.
 * `locale` "ru" and `dmEnabled` true are the column defaults, so they cannot be told from "never set" and are not treated as values.
 */
export function mainWinsProfile(p: MirrorProfile): MirrorProfile {
  const out: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) {
    const v = p[f];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (f === "socialLinks") {
      const kept = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string" && x.trim() !== ""));
      if (Object.keys(kept).length > 0) out[f] = kept;
      continue;
    }
    if (f === "locale" && v === "ru") continue;
    if (f === "dmEnabled" && v === true) continue;
    out[f] = v;
  }
  return out as MirrorProfile;
}

/** The whitelisted fields of an update whose value really differs from the stored one (an unchanged form field is not sent to the peer). */
export function changedFields(before: Record<string, unknown> | null | undefined, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!(PROFILE_FIELDS as readonly string[]).includes(k)) continue;
    if (before && JSON.stringify(before[k]) === JSON.stringify(v)) continue;
    out[k] = v;
  }
  return out;
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
  | "pulled" // answer to `pull`: the whitelisted profile is in `profile`
  | "conflict" // the new e-mail already belongs to another account here
  | "skipped"; // refused on purpose, see `reason`

export interface MirrorReply {
  ok: true;
  result: MirrorResult;
  /** with result "skipped": "privileged" = ADMIN / OWNER (never changed by the mirror); "mismatch" = the passwords of the two accounts differ */
  reason?: "privileged" | "mismatch";
  /** with result "pulled": the whitelisted profile of the account, nothing else (no hash, role, status or e-mail) */
  profile?: MirrorProfile;
  /** the wanted fomoId was taken, another one was given (created / completed) */
  fomoIdChanged?: boolean;
  /** profile fields that could not be applied (taken fomoId, avatar that could not be fetched) */
  skipped?: string[];
}
