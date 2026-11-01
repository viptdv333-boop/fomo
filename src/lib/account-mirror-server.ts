// Receiving side of the account mirror: applies a verified, validated message to THIS instance's database. Signature, replay
// window and rate limit are checked by the route (api/internal/account-mirror) before anything gets here. This module never calls the
// sending functions, so a mirrored write cannot bounce back to the instance it came from.
// Rules: create-if-absent / update-if-matches, idempotent (a repeated message ends in "exists" / "noop"); the wire format carries no
// role or status, a new account is always APPROVED / USER; hashes are stored, never logged or returned.
// PRIVILEGED ACCOUNTS' CREDENTIALS ARE UNTOUCHABLE: password, reset and email messages (and the completion of an abandoned sign-up) apply only
// to users with role USER, so a compromised sibling site can never overwrite the credentials of an ADMIN / OWNER here. The PROFILE-ONLY
// operations (`profile` push, `pull` at login) work for every role: they carry the whitelist of display fields and nothing that could
// escalate (never role, status, ban, rating, payment fields, e-mail or password). A user-initiated
// password change is a compare-and-swap on the old hash, an e-mail change needs the same current hash on both sides: accounts whose
// passwords differ are different people as far as the mirror is concerned and stay as they are.
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimit, resetRateLimit } from "./rate-limit";
import { generateFomoId } from "./fomoId";
import { normalizeEmail } from "./account-security";
import {
  AVATAR_DOWNLOAD_TIMEOUT_MS,
  MAX_AVATAR_BYTES,
  altFomoId,
  avatarFetchUrl,
  mirrorConfig,
  PROFILE_FIELDS,
  changedFields,
  mainWinsProfile,
  profileFromUser,
  profileToPrismaData,
  sniffImage,
  type MirrorMessage,
  type MirrorProfile,
  type MirrorReply,
} from "./account-mirror";

/** What the receiver needs besides the database (the unit check passes fakes). */
export interface MirrorDeps {
  rateLimit: (key: string, limit: number, windowMs: number) => Promise<{ allowed: boolean }>;
  resetRateLimit: (key: string) => Promise<void>;
  compare: (plain: string, hash: string) => Promise<boolean>;
}
let dummyHash: string | null = null;
const realDeps: MirrorDeps = {
  rateLimit,
  resetRateLimit,
  // unknown address: compare against a throw-away hash all the same, so the answer takes as long as for a real account
  compare: async (plain, hash) => bcrypt.compare(plain, hash || (dummyHash ??= await bcrypt.hash(randomUUID(), 10))),
};

/** The part of Prisma this module uses (scripts/check-account-mirror.ts passes an in-memory fake). */
export type Db = Pick<typeof prisma, "user">;

/** Plain profile columns of a received profile as Prisma data (a JSON null needs Prisma.DbNull). */
function plainData(profile: MirrorProfile): Prisma.UserUncheckedUpdateInput {
  const data = profileToPrismaData(profile) as Record<string, unknown>;
  if (data.socialLinks === null) data.socialLinks = Prisma.DbNull;
  return data as Prisma.UserUncheckedUpdateInput;
}

const DENIED: MirrorReply = { ok: true, result: "denied" };
const PRIVILEGED: MirrorReply = { ok: true, result: "skipped", reason: "privileged" };
const MISMATCH: MirrorReply = { ok: true, result: "skipped", reason: "mismatch" };

/**
 * Copies an avatar from the peer into THIS instance's uploads (public/uploads/avatars/<localUserId>/...). The only URL ever requested is
 * the configured peer origin + a validated /uploads/avatars/... path; no redirects, size capped, the bytes must really be an image
 * (bounded pixel count, strict decoding) and are re-encoded like a normal upload (200x200 JPEG), so the avatar keeps working when the
 * other site is down and nothing is hot-linked. The file is named by a hash of its content: a retried message writes the same file.
 */
async function pullAvatar(avatarPath: string, localUserId: string): Promise<string | null> {
  const cfg = mirrorConfig();
  if (!cfg) return null;
  const url = avatarFetchUrl(cfg.peerUrl, avatarPath);
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(AVATAR_DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok || !res.body) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_AVATAR_BYTES) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_AVATAR_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    if (!sniffImage(buf)) return null;
    const processed = await sharp(buf, { limitInputPixels: 25_000_000, failOn: "error" })
      .rotate()
      .resize(200, 200, { fit: "cover" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    const dir = path.join(process.cwd(), "public", "uploads", "avatars", localUserId);
    await mkdir(dir, { recursive: true });
    const filename = `${createHash("sha256").update(processed).digest("hex").slice(0, 32)}.jpg`;
    await writeFile(path.join(dir, filename), processed);
    return `/uploads/avatars/${localUserId}/${filename}`;
  } catch {
    return null;
  }
}

/** Removes a previous avatar file of this user (only inside the user's own avatar folder, never a path that came from a message). */
async function removeOwnAvatarFile(localUserId: string, oldUrl: string | null | undefined, newUrl: string | null): Promise<void> {
  if (!oldUrl || oldUrl === newUrl) return;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(localUserId)) return;
  const re = new RegExp(`^/uploads/avatars/${localUserId}/[A-Za-z0-9_-]{1,64}\\.(?:jpg|jpeg|png|webp|gif)$`);
  if (!re.test(oldUrl)) return;
  await unlink(path.join(process.cwd(), "public", oldUrl)).catch(() => {});
}

/** The fomoId a new account gets: the wanted one if it is free, else the deterministic alternative, else a random one. */
async function pickFomoId(db: Db, wanted: string | undefined, email: string): Promise<{ fomoId: string; changed: boolean }> {
  if (wanted) {
    if (!(await db.user.findUnique({ where: { fomoId: wanted }, select: { id: true } }))) return { fomoId: wanted, changed: false };
    const alt = await altFomoId(wanted, email);
    if (!(await db.user.findUnique({ where: { fomoId: alt }, select: { id: true } }))) return { fomoId: alt, changed: true };
  }
  let id = generateFomoId();
  for (let i = 0; i < 10; i++) {
    if (!(await db.user.findUnique({ where: { fomoId: id }, select: { id: true } }))) break;
    id = generateFomoId();
  }
  return { fomoId: id, changed: !!wanted };
}

/** Same rule as the local sign-up: another spelling of an address that already belongs to an approved account is not a new person. */
async function aliasTaken(db: Db, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const approved = await db.user.findMany({ where: { status: "APPROVED" }, select: { email: true } });
  return approved.some((u) => normalizeEmail(u.email) === normalized);
}

async function createAccount(db: Db, msg: Extract<MirrorMessage, { op: "register" | "ensure" }>): Promise<MirrorReply> {
  const existing = await db.user.findUnique({ where: { email: msg.email }, select: { id: true, status: true, role: true } });
  const { profile } = msg;
  const skipped: string[] = [];

  if (existing) {
    // a login-time copy never touches an existing account; an APPROVED / BANNED one is a real account
    if (msg.op !== "register" || existing.status !== "PENDING") return { ok: true, result: "exists" };
    // an abandoned signup is completed exactly as the local sign-up does it (alias check included), and only if it is a plain USER
    if (existing.role !== "USER") return PRIVILEGED;
    if (await aliasTaken(db, msg.email)) return { ok: true, result: "alias_conflict" };
    await db.user.update({
      where: { id: existing.id },
      data: { ...plainData(profile), passwordHash: msg.passwordHash, status: "APPROVED" },
    });
    await applyFomoIdAndAvatar(db, existing.id, profile, skipped);
    return { ok: true, result: "completed", ...(skipped.length ? { skipped } : {}) };
  }

  if (await aliasTaken(db, msg.email)) return { ok: true, result: "alias_conflict" };

  const { fomoId, changed } = await pickFomoId(db, profile.fomoId, msg.email);
  const created = await db.user.create({
    data: {
      ...(plainData(profile) as Prisma.UserUncheckedCreateInput),
      email: msg.email,
      passwordHash: msg.passwordHash,
      fomoId,
      status: "APPROVED",
      role: "USER",
      displayName: profile.displayName,
    },
    select: { id: true },
  });
  if (profile.avatarUrl) await applyFomoIdAndAvatar(db, created.id, { avatarUrl: profile.avatarUrl }, skipped);
  return { ok: true, result: "created", ...(changed ? { fomoIdChanged: true } : {}), ...(skipped.length ? { skipped } : {}) };
}

/** fomoId (when wanted and free) and the avatar of an existing local account. Reports what could not be applied. */
async function applyFomoIdAndAvatar(db: Db, userId: string, profile: MirrorProfile, skipped: string[]): Promise<string[]> {
  const data: Record<string, unknown> = {};
  let before: string | null = null;
  let after: string | null = null;
  if (profile.fomoId !== undefined) {
    const owner = await db.user.findUnique({ where: { fomoId: profile.fomoId }, select: { id: true } });
    if (!owner) data.fomoId = profile.fomoId;
    else if (owner.id !== userId) skipped.push("fomoId");
  }
  if (profile.avatarUrl !== undefined) {
    before = (await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } }))?.avatarUrl ?? null;
    if (profile.avatarUrl === null) {
      if (before !== null) data.avatarUrl = null;
    } else {
      const local = await pullAvatar(profile.avatarUrl, userId);
      if (local) {
        // the file is named by its content: the same picture lands on the same path, which is no change
        if (local !== before) data.avatarUrl = local;
        after = local;
      } else skipped.push("avatarUrl");
    }
  }
  if (Object.keys(data).length) await db.user.update({ where: { id: userId }, data });
  if ("avatarUrl" in data) await removeOwnAvatarFile(userId, before, after);
  return Object.keys(data);
}

/** `db` is the Prisma client; the unit check passes an in-memory fake. */
/**
 * Profile reconcile on the terminal, step 2: apply the profile pulled from fomo.spot to the local account. MAIN WINS for every field that
 * has a value there (empty values never blank local ones); the avatar is fetched from the peer by the safe code above, a taken fomoId is
 * skipped. Any role may be updated (only display fields are involved: never role, status, e-mail or password), passwords are never part of this.
 */
export async function applyPulledProfile(userId: string, profile: MirrorProfile, db: Db = prisma): Promise<{ applied: boolean; changed: string[]; skipped: string[] }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, ...PROFILE_SELECT } });
  if (!user) return { applied: false, changed: [], skipped: [] };
  const wins = mainWinsProfile(profile);
  const skipped: string[] = [];
  // only what really differs is written (a reconcile of an already equal profile touches nothing)
  const differs = changedFields(user as Record<string, unknown>, profileToPrismaData(wins));
  const changed = Object.keys(differs);
  if (changed.length) {
    const subset = Object.fromEntries(Object.entries(wins).filter(([k]) => changed.includes(k))) as MirrorProfile;
    await db.user.update({ where: { id: userId }, data: plainData(subset) });
  }
  changed.push(...(await applyFomoIdAndAvatar(db, userId, wins, skipped)));
  return { applied: true, changed, skipped };
}

/**
 * Password alignment at a terminal login, step 2 (fomo.spot confirmed the typed password): make the LOCAL account follow the master. The local
 * hash is computed here from the typed password (no hash travels); an existing account gets it with a sessionVersion bump (its old sessions
 * die) and the master profile (main wins, as in `pull`), a missing one is created exactly as `ensure` creates it. Any role: the proof is the
 * master password itself. Returns what happened, or null when nothing could be done.
 */
export async function alignLocalLogin(
  p: { email: string; password: string; userId?: string | null; profile: MirrorProfile },
  db: Db = prisma,
): Promise<"created" | "password" | null> {
  const hash = await bcrypt.hash(p.password, 10);
  if (p.userId) {
    const r = await db.user.updateMany({ where: { id: p.userId }, data: { passwordHash: hash, sessionVersion: { increment: 1 } } });
    if (r.count !== 1) return null;
    await applyPulledProfile(p.userId, p.profile, db);
    return "password";
  }
  const fallbackName = p.email.split("@")[0].slice(0, 100) || "user";
  const reply = await createAccount(db, { op: "ensure", email: p.email, passwordHash: hash, profile: { ...p.profile, displayName: p.profile.displayName || fallbackName } });
  return reply.result === "created" ? "created" : null;
}

const PROFILE_SELECT = { ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f, true])) };

export async function applyMirrorMessage(msg: MirrorMessage, db: Db = prisma, deps: MirrorDeps = realDeps): Promise<MirrorReply> {
  switch (msg.op) {
    case "register":
    case "ensure":
      return createAccount(db, msg);

    case "password": {
      const user = await db.user.findFirst({ where: { email: { equals: msg.email, mode: "insensitive" } }, select: { id: true, passwordHash: true, role: true } });
      if (!user) return { ok: true, result: "not_found" };
      if (user.role !== "USER") return PRIVILEGED;
      if (user.passwordHash === msg.passwordHash) return { ok: true, result: "noop" }; // a retry of a message already applied
      if (user.passwordHash !== msg.oldHash) return MISMATCH;
      // compare-and-swap: the row changes only while it still holds the old hash; sessions of this site die with it, as after a local change
      const r = await db.user.updateMany({
        where: { id: user.id, role: "USER", passwordHash: msg.oldHash },
        data: { passwordHash: msg.passwordHash, sessionVersion: { increment: 1 } },
      });
      return r.count === 1 ? { ok: true, result: "updated" } : MISMATCH;
    }

    case "reset": {
      const user = await db.user.findFirst({ where: { email: { equals: msg.email, mode: "insensitive" } }, select: { id: true, passwordHash: true, role: true } });
      if (!user) return { ok: true, result: "not_found" };
      if (user.role !== "USER") return PRIVILEGED;
      if (user.passwordHash === msg.passwordHash) return { ok: true, result: "noop" };
      const r = await db.user.updateMany({
        where: { id: user.id, role: "USER" },
        data: { passwordHash: msg.passwordHash, sessionVersion: { increment: 1 } },
      });
      return r.count === 1 ? { ok: true, result: "updated" } : PRIVILEGED;
    }

    case "email": {
      const user = await db.user.findFirst({ where: { email: { equals: msg.email, mode: "insensitive" } }, select: { id: true, passwordHash: true, role: true } });
      if (!user) {
        // already renamed by an earlier (retried) message? Only if that account is the same person (same hash).
        const renamed = await db.user.findUnique({ where: { email: msg.newEmail }, select: { passwordHash: true } });
        return { ok: true, result: renamed && renamed.passwordHash === msg.passwordHash ? "noop" : "not_found" };
      }
      if (user.role !== "USER") return PRIVILEGED;
      if (user.passwordHash !== msg.passwordHash) return MISMATCH;
      if (msg.email === msg.newEmail) return { ok: true, result: "noop" };
      const taken = await db.user.findUnique({ where: { email: msg.newEmail }, select: { id: true } });
      if (taken) return { ok: true, result: "conflict" };
      try {
        const r = await db.user.updateMany({
          where: { id: user.id, role: "USER", passwordHash: msg.passwordHash },
          data: { email: msg.newEmail, sessionVersion: { increment: 1 } },
        });
        return r.count === 1 ? { ok: true, result: "updated" } : MISMATCH;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: true, result: "conflict" };
        throw e;
      }
    }

    case "verify": {
      // fomo.spot is the master of the account: is this the right password? The attempt is counted in the SAME limits as a login here (per
      // address and per source, the source being the visitor's address the terminal saw), so the terminal is no unlimited password oracle.
      // Every failure is one and the same answer; the account must be APPROVED (a ban or an unfinished sign-up here applies as well).
      const email = msg.email.trim().toLowerCase();
      const [byAccount, bySource] = await Promise.all([
        deps.rateLimit(`login:email:${email}`, 10, 15 * 60 * 1000),
        deps.rateLimit(`login:ip:${msg.ip || "unknown"}`, 50, 15 * 60 * 1000),
      ]);
      const user = await db.user.findFirst({ where: { email: { equals: msg.email.trim(), mode: "insensitive" } }, select: { ...PROFILE_SELECT, passwordHash: true, status: true } });
      const right = await deps.compare(msg.password, user?.passwordHash ?? "");
      if (!byAccount.allowed || !bySource.allowed || !user || !right || user.status !== "APPROVED") return DENIED;
      await deps.resetRateLimit(`login:email:${email}`);
      return { ok: true, result: "verified", profile: profileFromUser(user as Record<string, unknown>) };
    }

    case "exists": {
      // sign-up / password change on the terminal: does fomo.spot know this mailbox (the same address, or another spelling of it)?
      const exact = await db.user.findFirst({ where: { email: { equals: msg.email.trim(), mode: "insensitive" } }, select: { role: true } });
      if (exact) return { ok: true, result: "exists", ...(exact.role !== "USER" ? { privileged: true } : {}) };
      const normalized = normalizeEmail(msg.email);
      const approved = await db.user.findMany({ where: { status: "APPROVED" }, select: { email: true, role: true } });
      const alias = approved.find((u) => normalizeEmail(u.email) === normalized);
      return alias ? { ok: true, result: "exists", ...(alias.role !== "USER" ? { privileged: true } : {}) } : { ok: true, result: "not_found" };
    }

    case "pull": {
      // The peer (the terminal) asks for the profile. The e-mail is matched without regard to case, like the login. Any role: the answer is the
      // whitelist of display fields and nothing else (never role, status, ban, rating, payment fields, e-mail or a hash), so it cannot escalate anything.
      const user = await db.user.findFirst({ where: { email: { equals: msg.email, mode: "insensitive" } }, select: PROFILE_SELECT });
      if (!user) return { ok: true, result: "not_found" };
      return { ok: true, result: "pulled", profile: profileFromUser(user as Record<string, unknown>) };
    }

    case "profile": {
      // Display fields only (never role, status, e-mail, password), so this is applied to ANY role, an ADMIN / OWNER included: the owner's own
      // profile edits must reach the other site. The e-mail is matched without regard to case, like the login.
      const user = await db.user.findFirst({ where: { email: { equals: msg.email, mode: "insensitive" } }, select: { id: true } });
      if (!user) return { ok: true, result: "not_found" };
      const skipped: string[] = [];
      const data = plainData(msg.profile);
      const plain = Object.keys(data).length > 0;
      if (plain) await db.user.update({ where: { id: user.id }, data });
      await applyFomoIdAndAvatar(db, user.id, msg.profile, skipped);
      const touched = plain || msg.profile.fomoId !== undefined || msg.profile.avatarUrl !== undefined;
      return { ok: true, result: touched ? "updated" : "noop", ...(skipped.length ? { skipped } : {}) };
    }
  }
}
