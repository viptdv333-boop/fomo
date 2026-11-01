// Receiving side of the account mirror: applies a verified, validated message to THIS instance's database. Signature, replay
// window and rate limit are checked by the route (api/internal/account-mirror) before anything gets here. This module never calls the
// sending functions, so a mirrored write cannot bounce back to the instance it came from.
// Rules: create-if-absent / update-if-matches, idempotent (a repeated message ends in "exists" / "noop"); the wire format carries no
// role or status, a new account is always APPROVED / USER; hashes are stored, never logged or returned.
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { generateFomoId } from "./fomoId";
import { normalizeEmail } from "./account-security";
import {
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

/** Plain profile columns of a received profile as Prisma data (a JSON null needs Prisma.DbNull). */
function plainData(profile: MirrorProfile): Prisma.UserUncheckedUpdateInput {
  const data = profileToPrismaData(profile) as Record<string, unknown>;
  if (data.socialLinks === null) data.socialLinks = Prisma.DbNull;
  return data as Prisma.UserUncheckedUpdateInput;
}

/**
 * Copies an avatar from the peer into THIS instance's uploads (public/uploads/avatars/<localUserId>/...). The only URL ever requested is
 * the configured peer origin + a validated /uploads/avatars/... path; no redirects, size capped, the bytes must really be an image and are
 * re-encoded like a normal upload (200x200 JPEG), so the avatar keeps working when the other site is down and nothing is hot-linked.
 */
async function pullAvatar(avatarPath: string, localUserId: string): Promise<string | null> {
  const cfg = mirrorConfig();
  if (!cfg) return null;
  const url = avatarFetchUrl(cfg.peerUrl, avatarPath);
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000) });
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
    const processed = await sharp(buf).rotate().resize(200, 200, { fit: "cover" }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    const dir = path.join(process.cwd(), "public", "uploads", "avatars", localUserId);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.jpg`;
    await writeFile(path.join(dir, filename), processed);
    return `/uploads/avatars/${localUserId}/${filename}`;
  } catch {
    return null;
  }
}

/** The fomoId a new account gets: the wanted one if it is free, else the deterministic alternative, else a random one. */
async function pickFomoId(wanted: string | undefined, email: string): Promise<{ fomoId: string; changed: boolean }> {
  if (wanted) {
    if (!(await prisma.user.findUnique({ where: { fomoId: wanted }, select: { id: true } }))) return { fomoId: wanted, changed: false };
    const alt = await altFomoId(wanted, email);
    if (!(await prisma.user.findUnique({ where: { fomoId: alt }, select: { id: true } }))) return { fomoId: alt, changed: true };
  }
  let id = generateFomoId();
  for (let i = 0; i < 10; i++) {
    if (!(await prisma.user.findUnique({ where: { fomoId: id }, select: { id: true } }))) break;
    id = generateFomoId();
  }
  return { fomoId: id, changed: !!wanted };
}

async function aliasTaken(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const approved = await prisma.user.findMany({ where: { status: "APPROVED" }, select: { email: true } });
  return approved.some((u) => normalizeEmail(u.email) === normalized);
}

async function createAccount(
  msg: Extract<MirrorMessage, { op: "register" | "ensure" }>,
): Promise<MirrorReply> {
  const existing = await prisma.user.findUnique({ where: { email: msg.email }, select: { id: true, status: true } });
  const { profile } = msg;
  const skipped: string[] = [];

  if (existing) {
    // an abandoned signup here is completed exactly as the local sign-up does it; a login-time copy never touches an existing account
    if (msg.op !== "register" || existing.status !== "PENDING") return { ok: true, result: "exists" };
    await prisma.user.update({
      where: { id: existing.id },
      data: { ...plainData(profile), passwordHash: msg.passwordHash, status: "APPROVED" },
    });
    await applyFomoIdAndAvatar(existing.id, profile, skipped);
    return { ok: true, result: "completed", ...(skipped.length ? { skipped } : {}) };
  }

  // the same rule as the local sign-up: another spelling of an address that already belongs to an approved account is not a new person
  if (await aliasTaken(msg.email)) return { ok: true, result: "alias_conflict" };

  const { fomoId, changed } = await pickFomoId(profile.fomoId, msg.email);
  const created = await prisma.user.create({
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
  if (profile.avatarUrl) await applyFomoIdAndAvatar(created.id, { avatarUrl: profile.avatarUrl }, skipped);
  return { ok: true, result: "created", ...(changed ? { fomoIdChanged: true } : {}), ...(skipped.length ? { skipped } : {}) };
}

/** fomoId (when wanted and free) and the avatar of an existing local account. Reports what could not be applied. */
async function applyFomoIdAndAvatar(userId: string, profile: MirrorProfile, skipped: string[]): Promise<void> {
  const data: Record<string, unknown> = {};
  if (profile.fomoId !== undefined) {
    const owner = await prisma.user.findUnique({ where: { fomoId: profile.fomoId }, select: { id: true } });
    if (!owner) data.fomoId = profile.fomoId;
    else if (owner.id !== userId) skipped.push("fomoId");
  }
  if (profile.avatarUrl !== undefined) {
    if (profile.avatarUrl === null) data.avatarUrl = null;
    else {
      const local = await pullAvatar(profile.avatarUrl, userId);
      if (local) data.avatarUrl = local;
      else skipped.push("avatarUrl");
    }
  }
  if (Object.keys(data).length) await prisma.user.update({ where: { id: userId }, data });
}

export async function applyMirrorMessage(msg: MirrorMessage): Promise<MirrorReply> {
  switch (msg.op) {
    case "register":
    case "ensure":
      return createAccount(msg);

    case "password": {
      const user = await prisma.user.findUnique({ where: { email: msg.email }, select: { id: true, passwordHash: true } });
      if (!user) return { ok: true, result: "not_found" };
      if (user.passwordHash === msg.passwordHash) return { ok: true, result: "noop" };
      // sessions of this site die with the old password, exactly as after a local change
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: msg.passwordHash, sessionVersion: { increment: 1 } } });
      return { ok: true, result: "updated" };
    }

    case "email": {
      const user = await prisma.user.findUnique({ where: { email: msg.email }, select: { id: true } });
      if (!user) {
        // already renamed by an earlier (retried) message?
        const renamed = await prisma.user.findUnique({ where: { email: msg.newEmail }, select: { id: true } });
        return { ok: true, result: renamed ? "noop" : "not_found" };
      }
      if (msg.email === msg.newEmail) return { ok: true, result: "noop" };
      const taken = await prisma.user.findUnique({ where: { email: msg.newEmail }, select: { id: true } });
      if (taken) return { ok: true, result: "conflict" };
      await prisma.user.update({ where: { id: user.id }, data: { email: msg.newEmail, sessionVersion: { increment: 1 } } });
      return { ok: true, result: "updated" };
    }

    case "profile": {
      const user = await prisma.user.findUnique({ where: { email: msg.email }, select: { id: true } });
      if (!user) return { ok: true, result: "not_found" };
      const skipped: string[] = [];
      const data = plainData(msg.profile);
      const plain = Object.keys(data).length > 0;
      if (plain) await prisma.user.update({ where: { id: user.id }, data });
      await applyFomoIdAndAvatar(user.id, msg.profile, skipped);
      const touched = plain || msg.profile.fomoId !== undefined || msg.profile.avatarUrl !== undefined;
      return { ok: true, result: touched ? "updated" : "noop", ...(skipped.length ? { skipped } : {}) };
    }
  }
}
