// Receiving side of the user-data copy of the account mirror (op "userdata"): applies one blob of the user's terminal data (settings, indicators,
// drawings ...) that was edited on the OTHER site to THIS instance's database. The route (api/internal/account-mirror) has already checked the
// signature, the replay window and the rate limit. Like the rest of the receiving side it never calls a sending function, so a mirrored write
// cannot bounce back. The account is found by e-mail (case-insensitive); a kind that is not on the whitelist is refused; the NEWER copy wins.
import { prisma } from "./prisma";
import type { MirrorMessage, MirrorReply } from "./account-mirror";
import { incomingWins, isMirroredKind } from "./userdata-sync";
import { KIND_MAX_BYTES, MAX_BYTES, upsertUserData } from "./userdata-store";

export type UserDataMessage = Extract<MirrorMessage, { op: "userdata" }>;
export type UserDataMirrorDb = Pick<typeof prisma, "user" | "terminalUserData">;

export async function applyUserDataMessage(msg: UserDataMessage, db: UserDataMirrorDb = prisma): Promise<MirrorReply> {
  if (!isMirroredKind(msg.kind)) return { ok: true, result: "skipped" };
  const user = await db.user.findFirst({ where: { email: { equals: msg.email, mode: "insensitive" } }, select: { id: true } });
  if (!user) return { ok: true, result: "not_found" };
  const where = { userId_kind_key: { userId: user.id, kind: msg.kind, key: msg.key } };
  const local = await db.terminalUserData.findUnique({ where, select: { updatedAt: true } });
  if (!incomingWins(local?.updatedAt.getTime(), msg.at)) return { ok: true, result: "noop" };
  if (msg.deleted) {
    if (!local) return { ok: true, result: "noop" };
    await db.terminalUserData.deleteMany({ where: { userId: user.id, kind: msg.kind, key: msg.key } });
    return { ok: true, result: "updated" };
  }
  if (msg.data === undefined) return { ok: true, result: "noop" };
  if (JSON.stringify(msg.data).length > (KIND_MAX_BYTES[msg.kind] ?? MAX_BYTES)) return { ok: true, result: "skipped" };
  const r = await upsertUserData(db, user.id, msg.kind, msg.key, msg.data, new Date(msg.at));
  return r === "ok" ? { ok: true, result: "updated" } : { ok: true, result: "skipped" };
}
