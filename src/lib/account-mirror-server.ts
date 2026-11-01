// Receiving side of the account mirror: applies a verified, validated message to THIS instance's database. Signature, replay
// window and rate limit are checked by the route (api/internal/account-mirror) before anything gets here. This module never calls the
// sending functions, so a mirrored write cannot bounce back to the instance it came from.
// Rules: create-if-absent / update-if-matches, idempotent (a repeated message ends in "exists" / "noop"); the wire format carries no
// role or status, a new account is always APPROVED / USER; hashes are stored, never logged or returned.
// PRIVILEGED ACCOUNTS ARE UNTOUCHABLE: password, reset, email and profile messages (and the completion of an abandoned sign-up) apply only to
// users with role USER, so a compromised sibling site can never overwrite the credentials of an ADMIN / OWNER here. A user-initiated
// password change is a compare-and-swap on the old hash, an e-mail change needs the same current hash on both sides: accounts whose
// passwords differ are different people as far as the mirror is concerned and stay as they are.
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { generateFomoId } from "./fomoId";
import { normalizeEmail } from "./account-security";
import {
  AVATAR_DOWNLOAD_TIMEOUT_MS,
  MAX_AVATAR_BYTES,
  altFomoId,
  avatarFetchUrl,
  mirrorConfig,
  profileToPrismaData,
  sniffImage,
  type MirrorMessage,
  type MirrorProfile,
  type MirrorReply,
} from "./account-mirror";

/** The part of Prisma this module uses (scripts/check-account-mirror.ts passes an in-memory fake). */
export type Db = Pick<typeof prisma, "user">;

/** Plain profile columns of a received profile as Prisma data (a JSON null needs Prisma.DbNull). */
function plainData(profile: MirrorProfile): Prisma.UserUncheckedUpdateInput {
  const data = profileToPrismaData(profile) as Record<string, unknown>;
  if (data.socialLinks === null) data.socialLinks = Prisma.DbNull;
  return data as Prisma.UserUncheckedUpdateInput;
}

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
async function applyFomoIdAndAvatar(db: Db, userId: string, profile: MirrorProfile, skipped: string[]): Promise<void> {
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
      data.avatarUrl = null;
    } else {
      const local = await pullAvatar(profile.avatarUrl, userId);
      if (local) {
        data.avatarUrl = local;
        after = local;
      } else skipped.push("avatarUrl");
    }
  }
  if (Object.keys(data).length) await db.user.update({ where: { id: userId }, data });
  if ("avatarUrl" in data) await removeOwnAvatarFile(userId, before, after);
}

/** `db` is the Prisma client; the unit check passes an in-memory fake. */
export async function applyMirrorMessage(msg: MirrorMessage, db: Db = prisma): Promise<MirrorReply> {
  switch (msg.op) {
    case "register":
    case "ensure":
      return createAccount(db, msg);

    case "password": {
      const user = await db.user.findUnique({ where: { email: msg.email }, select: { id: true, passwordHash: true, role: true } });
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
      const user = await db.user.findUnique({ where: { email: msg.email }, select: { id: true, passwordHash: true, role: true } });
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
      const user = await db.user.findUnique({ where: { email: msg.email }, select: { id: true, passwordHash: true, role: true } });
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

    case "profile": {
      const user = await db.user.findUnique({ where: { email: msg.email }, select: { id: true, role: true } });
      if (!user) return { ok: true, result: "not_found" };
      if (user.role !== "USER") return PRIVILEGED;
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
