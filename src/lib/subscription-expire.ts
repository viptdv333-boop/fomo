/// Lifecycle of a finished paid-channel subscription: «active» + past endDate -> «expired» (the owner's list moves it to the
/// «Истекшие» section, the subscriber gets one notice) -> deleted for good EXPIRED_KEEP_DAYS later. No DB client and no next/*
/// imports here: the pure rules plus runExpireSweep(), which takes the db and the notifier as parameters (so a fake can drive it).
/// The timer lives in server/subscription-expire-sweep.ts. Check: npx tsx scripts/check-subscription-expire.ts
///
/// Access never depended on this job (every check is «status active AND endDate > now»); it only keeps the stored status honest and
/// the owner's member list clean. A renewal (extendSubscription / the owner's +N дн.) treats «expired» like any lapsed row: restart from now.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_KEEP_DAYS = 14;
/** A «закончилась» notice is sent only for terms that ended this recently; older backlog is expired silently (no flood on the first run). */
export const NOTIFY_WITHIN_DAYS = 3;
const BATCH = 500;
const MAX_BATCHES = 20;

export interface SubRow { id: string; status: string; endDate: Date | string | number }

function ms(v: Date | string | number): number {
  return new Date(v).getTime();
}

/** EXPIRED_KEEP_DAYS env -> days to keep an expired row (default 14; 0 is allowed = delete on the next pass; junk -> default). */
export function keepDaysFromEnv(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_KEEP_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 3650) : DEFAULT_KEEP_DAYS;
}

/** Stored as active but the term is over: the job flips it to «expired». */
export function shouldExpire(row: SubRow, now: Date): boolean {
  const e = ms(row.endDate);
  return row.status === "active" && Number.isFinite(e) && e < now.getTime();
}

/** Over for more than `keepDays`: the row is removed for good (an «active» one that long past is expired and removed in the same pass). */
export function shouldDelete(row: SubRow, now: Date, keepDays: number): boolean {
  const e = ms(row.endDate);
  return (row.status === "expired" || row.status === "active") && Number.isFinite(e) && e < now.getTime() - keepDays * DAY_MS;
}

/** Whether a freshly expired row gets the «закончилась» notice (a term that ended long ago is expired silently). */
export function shouldNotifyExpired(row: SubRow, now: Date): boolean {
  const e = ms(row.endDate);
  return Number.isFinite(e) && e < now.getTime() && e >= now.getTime() - NOTIFY_WITHIN_DAYS * DAY_MS;
}

/** Owner panel: rows split for display. «Active» = status active and not past endDate; everything else is in the expired section. */
export function splitMembers<T extends { isActive: boolean }>(list: T[]): { active: T[]; expired: T[] } {
  return { active: list.filter((m) => m.isActive), expired: list.filter((m) => !m.isActive) };
}

/** Prisma `where` of a subscription that counts as a member right now (counters, owner/public). */
export function activeSubWhere(now: Date = new Date()) {
  return { status: "active", endDate: { gt: now } } as const;
}

// ---- the job ----

export interface ExpiredSub {
  id: string;
  subscriberId: string;
  endDate: Date;
  tariff: { id: string; slug: string | null; name: string } | null;
}

/** The slice of the Prisma client the sweep uses (a fake implements the same three calls). */
export interface ExpireDb {
  subscription: {
    findMany(args: unknown): Promise<ExpiredSub[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface ExpireNotice { recipients: string[]; type: "subscription_expired"; title: { key: string; vars: Record<string, string | number> }; body: { key: string }; link: string }

export interface ExpireResult { expired: number; notified: number; deleted: number }

/** One pass. Idempotent: a second run right after finds nothing (the expiry is a compare-and-set, so a renewal that lands meanwhile wins). */
export async function runExpireSweep(
  db: ExpireDb,
  notify: (n: ExpireNotice) => Promise<unknown>,
  opts: { now?: Date; keepDays?: number } = {}
): Promise<ExpireResult> {
  const now = opts.now ?? new Date();
  const keepDays = opts.keepDays ?? DEFAULT_KEEP_DAYS;
  const out: ExpireResult = { expired: 0, notified: 0, deleted: 0 };

  for (let round = 0; round < MAX_BATCHES; round++) {
    const rows = await db.subscription.findMany({
      where: { status: "active", endDate: { lt: now } },
      select: { id: true, subscriberId: true, endDate: true, tariff: { select: { id: true, slug: true, name: true } } },
      orderBy: { endDate: "desc" },
      take: BATCH,
    });
    if (rows.length === 0) break;
    for (const s of rows) {
      // compare-and-set on the same condition: a renewal that moved endDate forward since the read is left alone
      const res = await db.subscription.updateMany({
        where: { id: s.id, status: "active", endDate: { lt: now } },
        data: { status: "expired" },
      });
      if (res.count !== 1) continue;
      out.expired++;
      if (!s.tariff || !shouldNotifyExpired({ id: s.id, status: "active", endDate: s.endDate }, now)) continue;
      try {
        await notify({
          recipients: [s.subscriberId],
          type: "subscription_expired",
          title: { key: "ns.notif.subExpired.title", vars: { channel: s.tariff.name } },
          body: { key: "ns.notif.subExpired.body" },
          link: `/channels/${s.tariff.slug || s.tariff.id}`,
        });
        out.notified++;
      } catch (e) {
        console.error("[SubscriptionExpire] notify failed", e instanceof Error ? e.message : e);
      }
    }
    if (rows.length < BATCH) break;
  }

  const del = await db.subscription.deleteMany({
    where: { status: "expired", endDate: { lt: new Date(now.getTime() - keepDays * DAY_MS) } },
  });
  out.deleted = del.count;
  return out;
}
