// Idempotency for requests that the offline outbox may send more than once (a reply that was lost, a retry after a timeout, two tabs):
// the browser puts a random `clientId` in the body; the route claims it BEFORE doing the work and a second request with the same id is answered
// with the first one's result instead of creating a duplicate. Table ClientRequest (prisma/migrations/20261010090000_client_requests).
// Requests without a clientId (old app builds, other clients) skip all of this.
//   const claim = await claimClientRequest(userId, body.clientId, "chat_message");
//   if (claim.kind === "duplicate") return NextResponse.json({ duplicate: true, id: claim.resourceId });
//   if (claim.kind === "busy") return NextResponse.json({ error: "Request in progress" }, { status: 409 });
//   ... create ... await claim.attach(created.id) ...   (on a failure BEFORE the thing exists: await claim.release())
import { prisma } from "@/lib/prisma";

const ID = /^[A-Za-z0-9_-]{8,64}$/;
/** a claim that never got its result (the process died between claim and create) is taken over after this long */
export const STALE_CLAIM_MS = 2 * 60 * 1000;
/** rows older than this are pruned (the outbox gives up replaying long before) */
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export function parseClientId(v: unknown): string | null {
  return typeof v === "string" && ID.test(v) ? v : null;
}

/** What an existing claim means for a second request: its result is known, it is still running, or it is dead. */
export function decideConflict(existing: { resourceId: string | null; createdAt: Date | number }, now: number): "duplicate" | "busy" | "stale" {
  if (existing.resourceId) return "duplicate";
  const at = existing.createdAt instanceof Date ? existing.createdAt.getTime() : existing.createdAt;
  return now - at > STALE_CLAIM_MS ? "stale" : "busy";
}

export type Claim =
  | { kind: "none"; attach(id: string): Promise<void>; release(): Promise<void> }
  | { kind: "new"; attach(id: string): Promise<void>; release(): Promise<void> }
  | { kind: "duplicate"; resourceId: string }
  | { kind: "busy" };

const NOOP = { attach: async () => {}, release: async () => {} };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function claimClientRequest(userId: string, clientIdRaw: unknown, kind: string): Promise<Claim> {
  const clientId = parseClientId(clientIdRaw);
  if (!clientId) return { kind: "none", ...NOOP };

  // opportunistic pruning: about 1 request in 50
  if (Math.random() < 0.02) {
    void prisma.clientRequest.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } }).catch(() => {});
  }

  const handle = (): Claim => ({
    kind: "new",
    attach: async (id: string) => {
      await prisma.clientRequest.update({ where: { userId_clientId: { userId, clientId } }, data: { resourceId: id } }).catch(() => {});
    },
    release: async () => {
      await prisma.clientRequest.delete({ where: { userId_clientId: { userId, clientId } } }).catch(() => {});
    },
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.clientRequest.create({ data: { userId, clientId, kind } });
      return handle();
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await prisma.clientRequest.findUnique({ where: { userId_clientId: { userId, clientId } } });
      if (!existing) continue; // pruned between the two statements: claim again
      const verdict = decideConflict(existing, Date.now());
      if (verdict === "duplicate") return { kind: "duplicate", resourceId: existing.resourceId as string };
      if (verdict === "busy") return { kind: "busy" };
      await prisma.clientRequest.delete({ where: { userId_clientId: { userId, clientId } } }).catch(() => {}); // stale: take it over
    }
  }
  return { kind: "busy" };
}

/**
 * Optional `clientCreatedAt` is NOT used for the stored time (a message back-dated into the past would slip under every reader's «unread»
 * marker): the server time of delivery stands. Kept as a helper for the day this is wanted: clamps to [now - 7 days, now].
 */
export function clampClientTime(v: unknown, now: number): Date {
  const t = typeof v === "number" && Number.isFinite(v) ? v : now;
  return new Date(Math.min(now, Math.max(now - KEEP_MS, t)));
}
