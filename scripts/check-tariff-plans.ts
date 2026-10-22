/* Tariff plans of a channel (src/lib/tariff-plans.ts, channel-delete.ts, merge-channel-plans.ts): family resolution, access through a
   subscription on a plan, ONE subscription row per subscriber on a cross-plan payment, extension arithmetic from the current end,
   the channel catalog lists channels only, validation of parentId / plan limit, plan line ("Неделя 1000 ₽ · Месяц 3000 ₽ · и ещё N"),
   «Удалить канал» (author only, blocked with subscribers without the typed name, hard delete of an unused channel, idempotent,
   one notice per subscriber), «Удалить тариф», and the merge script (dry run, apply, idempotency). In-memory fake database.
   Run: npx tsx scripts/check-tariff-plans.ts   (exit code 1 on a failed assertion) */

export {};

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const truth = (name: string, v: boolean) => eq(name, v, true);

/* ---------- a tiny in-memory Prisma ---------- */
type Row = Record<string, any>;
const NOW = new Date("2026-10-22T12:00:00Z");
const DAY = 86_400_000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

const matchValue = (x: any, v: any): boolean => {
  if (v !== null && typeof v === "object" && !(v instanceof Date)) {
    if ("in" in v) return (v.in as unknown[]).includes(x);
    if ("not" in v) return v.not === null ? x !== null && x !== undefined : x !== v.not;
    if ("gt" in v) return x > v.gt;
    if ("gte" in v) return x >= v.gte;
    if ("lt" in v) return x < v.lt;
    if ("lte" in v) return x <= v.lte;
    return true;
  }
  return (x ?? null) === (v ?? null);
};
const match = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => match(row, w));
    if (k === "AND") return (v as Row[]).every((w) => match(row, w));
    return matchValue(row[k], v);
  });

function makeDb() {
  const t: Record<string, Row[]> = { tariffs: [], subs: [], ideas: [], payments: [], rooms: [], messages: [], users: [] };
  let seq = 0;
  const table = (name: string) => ({
    findUnique: async ({ where }: any) => t[name].find((r) => match(r, where)) ?? null,
    findUniqueOrThrow: async ({ where }: any) => {
      const r = t[name].find((x) => match(x, where));
      if (!r) throw new Error("not found");
      return r;
    },
    findFirst: async ({ where, orderBy }: any = {}) => {
      const rows = t[name].filter((r) => match(r, where));
      if (orderBy?.endDate === "desc") rows.sort((a, b) => +b.endDate - +a.endDate);
      return rows[0] ?? null;
    },
    findMany: async ({ where, orderBy }: any = {}) => {
      const rows = t[name].filter((r) => match(r, where));
      if (orderBy?.endDate === "desc") rows.sort((a, b) => +b.endDate - +a.endDate);
      return rows.map((r) => ({ ...r }));
    },
    count: async ({ where }: any = {}) => t[name].filter((r) => match(r, where)).length,
    create: async ({ data }: any) => {
      const r = { id: `${name}${++seq}`, ...data };
      t[name].push(r);
      return r;
    },
    update: async ({ where, data }: any) => {
      const r = t[name].find((x) => match(x, where))!;
      Object.assign(r, data);
      return r;
    },
    updateMany: async ({ where, data }: any) => {
      const rows = t[name].filter((r) => match(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    deleteMany: async ({ where }: any = {}) => {
      const keep = t[name].filter((r) => !match(r, where));
      const count = t[name].length - keep.length;
      t[name] = keep;
      return { count };
    },
  });
  const tariffs = table("tariffs");
  const db: any = {
    _t: t,
    subscriptionTariff: {
      ...tariffs,
      // the catalog route also asks for plans / _count / author
      findMany: async ({ where, include, select }: any = {}) => {
        const rows = t.tariffs.filter((r) => match(r, where));
        return rows.map((r) => ({
          ...r,
          ...(include?.plans ? { plans: t.tariffs.filter((p) => p.parentId === r.id).map((p) => ({ ...p })) } : {}),
          ...(include?.author ? { author: { id: r.authorId, displayName: "Автор", avatarUrl: null, rating: 7 } } : {}),
          ...(include?._count ? { _count: { ideas: t.ideas.filter((i) => i.tariffId === r.id).length } } : {}),
        }));
      },
    },
    subscription: table("subs"),
    idea: table("ideas"),
    paymentRequest: table("payments"),
    chatRoom: table("rooms"),
    chatMessage: table("messages"),
    user: table("users"),
    instrument: { findMany: async () => [] },
    $transaction: async (fn: any) => fn(db),
  };
  return db;
}
const db = makeDb();
(globalThis as any).prisma = db;
const T = db._t as Record<string, Row[]>;

function seed() {
  for (const k of Object.keys(T)) T[k] = [];
  const base = { authorId: "author", description: null, isActive: true, archivedAt: null, parentId: null, planName: null, slug: null, channelRoomId: null, paymentMethods: ["card"], cardNumber: null, sbpQrUrl: null, instrumentIds: [] };
  T.tariffs.push(
    // the channel «Торговые сигналы» (Месяц 3000 / 30), its plan «Неделя» 1000 / 7 and «Год» 20000 / 365
    { ...base, id: "ch", name: "Торговые сигналы", planName: "Месяц", price: 3000, durationDays: 30, slug: "signals", channelRoomId: "room1", createdAt: 1 },
    { ...base, id: "pw", name: "Неделя", parentId: "ch", price: 1000, durationDays: 7, createdAt: 2 },
    { ...base, id: "py", name: "Год", parentId: "ch", price: 20000, durationDays: 365, createdAt: 3 },
    // another channel of the same author
    { ...base, id: "other", name: "Другой канал", price: 500, durationDays: 30, createdAt: 4 }
  );
  T.rooms.push({ id: "room1", isArchived: false, isClosed: false });
  T.users.push({ id: "author", role: "USER" }, { id: "adm", role: "ADMIN" });
}
const sub = (id: string, subscriberId: string, tariffId: string | null, endDays: number, over: Row = {}): Row => ({
  id, subscriberId, authorId: "author", tariffId, status: "active", startDate: NOW, endDate: days(endDays), monthlyPrice: 0, durationDays: 30, telegramNotify: false, ...over,
});

async function main() {
  const P = await import("../src/lib/tariff-plans");
  const { canAccessRoom } = await import("../src/lib/channel-access");
  const { extendSubscription, findActiveSubscription } = await import("../src/lib/subscriptions");
  const { closeChannel, deletePlan, confirmNameMatches } = await import("../src/lib/channel-delete");
  const { mergeChannelPlans } = await import("../src/lib/merge-channel-plans");

  /* ---- 1. family resolution (pure + db) ---- */
  seed();
  eq("rootIdOf: a plan -> its channel, a channel -> itself", [P.rootIdOf({ id: "pw", parentId: "ch" }), P.rootIdOf({ id: "ch", parentId: null })], ["ch", "ch"]);
  eq("familyFromRows", P.familyFromRows("ch", T.tariffs as never), ["ch", "pw", "py"]);
  eq("channelRootId(plan) / (channel) / (unknown) / (null)", [await P.channelRootId(db, "pw"), await P.channelRootId(db, "ch"), await P.channelRootId(db, "zzz"), await P.channelRootId(db, null)], ["ch", "ch", null, null]);
  eq("tariffFamily(root) = [root, ...plans]", await P.tariffFamily(db, "ch"), ["ch", "pw", "py"]);
  eq("familyOfTariff(plan id) resolves the channel first", await P.familyOfTariff(db, "py"), ["ch", "pw", "py"]);
  eq("familyOfTariff(unknown) = just that id (as before plans existed)", await P.familyOfTariff(db, "zzz"), ["zzz"]);
  eq("another channel's family does not include these plans", await P.tariffFamily(db, "other"), ["other"]);
  const fams = await P.familiesFor(db, ["pw", "other", null]);
  eq("familiesFor: per tariff id, in two queries", [[...(fams.get("pw") ?? [])], [...(fams.get("other") ?? [])]], [["ch", "pw", "py"], ["other"]]);
  eq("subscriptionAccessWhere", P.subscriptionAccessWhere(["a", "b"]), { OR: [{ tariffId: { in: ["a", "b"] } }, { tariffId: null }] });
  eq("splitTariffName: legacy «Канал: План», clean name + planName, no colon", [P.splitTariffName("Торговые сигналы: Неделя"), P.splitTariffName("Торговые сигналы", "Месяц"), P.splitTariffName("Solo")], [{ channel: "Торговые сигналы", plan: "Неделя" }, { channel: "Торговые сигналы", plan: "Месяц" }, { channel: "Solo", plan: null }]);

  /* ---- 2. access through a subscription on a plan ---- */
  T.subs.push(sub("s1", "onweek", "pw", 5), sub("s2", "onroot", "ch", 5), sub("s3", "onother", "other", 5), sub("s4", "expired", "pw", -1), sub("s5", "legacy", null, 5));
  eq("canAccessRoom: subscriber of a PLAN reads the channel chat", await canAccessRoom(db, "room1", "onweek"), true);
  eq("canAccessRoom: subscriber of the channel row", await canAccessRoom(db, "room1", "onroot"), true);
  eq("canAccessRoom: subscriber of ANOTHER channel is out", await canAccessRoom(db, "room1", "onother"), false);
  eq("canAccessRoom: expired plan subscription is out", await canAccessRoom(db, "room1", "expired"), false);
  eq("canAccessRoom: legacy author-wide stays, author and staff are in", [await canAccessRoom(db, "room1", "legacy"), await canAccessRoom(db, "room1", "author"), await canAccessRoom(db, "room1", "adm")], [true, true, true]);
  eq("findActiveSubscription(channel) sees a plan row", (await findActiveSubscription("onweek", "author", "ch"))?.id, "s1");

  /* ---- 3. ONE row per subscriber on a cross-plan payment; extension arithmetic ---- */
  seed();
  T.subs.push(sub("a1", "u1", "pw", 3, { durationDays: 7 })); // on «Неделя», 3 days left
  const end0 = T.subs[0].endDate as Date;
  const r1 = await extendSubscription({ subscriberId: "u1", authorId: "author", tariffId: "ch", monthlyPrice: 3000, durationDays: 30, now: NOW });
  eq("paying the MONTH while on the WEEK extends the same row (no second row)", [T.subs.length, r1.subscription.id, r1.renewed], [1, "a1", true]);
  eq("the end counts from the current end date: end + 30 days", +r1.endDate, +end0 + 30 * DAY);
  eq("the row now sits on the plan paid last, with its period", [T.subs[0].tariffId, T.subs[0].durationDays], ["ch", 30]);
  const r2 = await extendSubscription({ subscriberId: "u1", authorId: "author", tariffId: "py", monthlyPrice: 20000, durationDays: 365, now: NOW });
  eq("a third plan (Год): still one row, +365 days", [T.subs.length, +r2.endDate, T.subs[0].tariffId], [1, +end0 + 395 * DAY, "py"]);
  // lapsed row: restarts from now on whichever plan is paid
  T.subs.push(sub("a2", "u2", "pw", -2, { status: "expired" }));
  const r3 = await extendSubscription({ subscriberId: "u2", authorId: "author", tariffId: "ch", monthlyPrice: 3000, durationDays: 30, now: NOW });
  eq("an expired row of another plan restarts from now", [T.subs.filter((s) => s.subscriberId === "u2").length, r3.renewed, +r3.endDate], [1, false, +days(30)]);
  // a new subscriber
  const r4 = await extendSubscription({ subscriberId: "u3", authorId: "author", tariffId: "pw", monthlyPrice: 1000, durationDays: 7, now: NOW });
  eq("first payment creates the row on the paid plan", [r4.renewed, T.subs.find((s) => s.subscriberId === "u3")?.tariffId, +r4.endDate], [false, "pw", +days(7)]);
  // old data with two rows: the one ending last is extended, reads stay tolerant
  seed();
  T.subs.push(sub("d1", "dup", "pw", 2), sub("d2", "dup", "ch", 10));
  const r5 = await extendSubscription({ subscriberId: "dup", authorId: "author", tariffId: "pw", monthlyPrice: 1000, durationDays: 7, now: NOW });
  eq("duplicates from old data: the latest row is extended", [r5.subscription.id, +r5.endDate], ["d2", +days(17)]);
  eq("dedupeSubscribers keeps the latest end per person", P.dedupeSubscribers([{ subscriberId: "x", endDate: days(1) }, { subscriberId: "x", endDate: days(9) }, { subscriberId: "y", endDate: days(2) }]).map((r) => [r.subscriberId, +r.endDate]), [["x", +days(9)], ["y", +days(2)]]);
  eq("subscribersByRoot counts a person once per channel", [...P.subscribersByRoot([{ tariffId: "pw", subscriberId: "x" }, { tariffId: "ch", subscriberId: "x" }, { tariffId: "py", subscriberId: "y" }, { tariffId: "other", subscriberId: "x" }, { tariffId: null, subscriberId: "z" }], new Map([["ch", "ch"], ["pw", "ch"], ["py", "ch"], ["other", "other"]]))], [["ch", 2], ["other", 1]]);

  /* ---- 4. the catalog lists channels only, with their plans ---- */
  seed();
  T.subs.push(sub("c1", "x1", "pw", 5), sub("c2", "x1", "ch", 5), sub("c3", "x2", "py", 5), sub("c4", "x3", "pw", -5));
  const { GET } = await import("../src/app/api/channels/route");
  const list = (await (await GET()).json()) as Row[];
  eq("catalog: one entry per channel (plans are not entries)", list.map((c) => c.id).sort(), ["ch", "other"]);
  const ch = list.find((c) => c.id === "ch")!;
  eq("catalog: plans sorted by period then price, with the channel's own plan first by period", ch.plans.map((p: Row) => [p.id, p.label, p.price, p.durationDays]), [["pw", "Неделя", 1000, 7], ["ch", "Месяц", 3000, 30], ["py", "Год", 20000, 365]]);
  eq("catalog: members counted over the family, a person once, expired not counted", ch.subscribersCount, 2);
  eq("catalog: the channel's name is the clean name", ch.name, "Торговые сигналы");
  T.tariffs.find((r) => r.id === "ch")!.archivedAt = NOW;
  eq("catalog: a closed (archived) channel is gone", ((await (await GET()).json()) as Row[]).map((c) => c.id), ["other"]);
  T.tariffs.find((r) => r.id === "ch")!.archivedAt = null;
  T.tariffs.find((r) => r.id === "ch")!.isActive = false;
  eq("catalog: a hidden channel is gone, its plans do not leak", ((await (await GET()).json()) as Row[]).map((c) => c.id), ["other"]);

  /* ---- 5. plan line, default plan ---- */
  const root = { id: "ch", name: "Торговые сигналы", planName: "Месяц", price: 3000, durationDays: 30, isActive: true };
  const plans = [
    { id: "pw", name: "Неделя", parentId: "ch", price: 1000, durationDays: 7, isActive: true },
    { id: "pm", name: "3 месяца", parentId: "ch", price: 7000, durationDays: 90, isActive: true },
    { id: "py", name: "Год", parentId: "ch", price: 20000, durationDays: 365, isActive: true },
    { id: "px", name: "Старый", parentId: "ch", price: 1, durationDays: 1, isActive: false },
  ];
  const views = P.planViews(root, plans);
  eq("planViews: active only, sorted by period then price", views.map((v) => v.id), ["pw", "ch", "pm", "py"]);
  eq("planViews(all) includes inactive ones", P.planViews(root, plans, false).length, 5);
  eq("default plan = the cheapest", P.defaultPlan(views)?.id, "pw");
  const sm = P.planSummary(views, 3);
  eq("card line: first 3 plans + «и ещё N»", [sm.shown.map((v) => v.label), sm.more], [["Неделя", "Месяц", "3 месяца"], 1]);
  eq("labels: plan = its name, the channel row = planName (or the suffix of an old name)", [P.planLabelOf({ name: "Неделя", parentId: "ch" }), P.planLabelOf({ name: "X", planName: "Месяц" }), P.planLabelOf({ name: "X: Год" }), P.planLabelOf({ name: "X" })], ["Неделя", "Месяц", "Год", null]);
  eq("any number of plans: the technical limit is generous", P.MAX_PLANS_PER_CHANNEL >= 50, true);
  eq("the plan list stays sortable at 50 plans", P.sortPlans(Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, durationDays: 50 - i, price: i }))).length, 50);

  /* ---- 6. validation of parentId ---- */
  const parent = { id: "ch", authorId: "author", parentId: null, archivedAt: null };
  eq("parent ok", P.validatePlanParent(parent, "author", 0), { ok: true });
  eq("parent missing", P.validatePlanParent(null, "author", 0), { ok: false, code: "parentNotFound" });
  eq("parent of another author", P.validatePlanParent(parent, "someone", 0), { ok: false, code: "parentNotOwned" });
  eq("parent is itself a plan", P.validatePlanParent({ ...parent, parentId: "x" }, "author", 0), { ok: false, code: "parentNotRoot" });
  eq("parent is closed", P.validatePlanParent({ ...parent, archivedAt: NOW }, "author", 0), { ok: false, code: "parentArchived" });
  eq("49 plans: one more is fine; at the limit: refused", [P.validatePlanParent(parent, "author", P.MAX_PLANS_PER_CHANNEL - 1).ok, P.validatePlanParent(parent, "author", P.MAX_PLANS_PER_CHANNEL)], [true, { ok: false, code: "planLimit" }]);

  /* ---- 7. «Удалить канал» ---- */
  const notices: string[] = [];
  const logs: string[] = [];
  const closeArgs = (over: Row = {}) => ({ rootId: "ch", actorId: "author", now: NOW, notify: async (u: string) => void notices.push(u), log: (l: string) => void logs.push(l), ...over });
  seed();
  T.subs.push(sub("k1", "m1", "pw", 5, { telegramNotify: true }), sub("k2", "m2", "ch", 9), sub("k3", "m1", "ch", 3), sub("k4", "gone", "pw", -3, { status: "expired" }));
  T.ideas.push({ id: "i1", tariffId: "ch", moderationStatus: "published" }, { id: "i2", tariffId: "ch", moderationStatus: "hidden" });
  T.payments.push({ id: "pay1", tariffId: "pw", status: "PENDING" }, { id: "pay2", tariffId: "ch", status: "CONFIRMED" });
  eq("someone else may not delete the channel", (await closeChannel(db, closeArgs({ actorId: "intruder" }))).ok, false);
  eq("… the code is forbidden and nothing changed", [(await closeChannel(db, closeArgs({ actorId: "intruder" }))) as Row, T.tariffs[0].archivedAt].map((x) => (x && "code" in x ? x.code : x)), ["forbidden", null]);
  eq("a plan id is not a channel", ((await closeChannel(db, closeArgs({ rootId: "pw" }))) as Row).code, "notRoot");
  eq("unknown channel", ((await closeChannel(db, closeArgs({ rootId: "nope" }))) as Row).code, "notFound");
  const blocked = (await closeChannel(db, closeArgs())) as Row;
  eq("with ACTIVE subscribers: blocked without the typed name (2 people, a person counted once)", [blocked.ok, blocked.code, blocked.activeSubscribers], [false, "confirmRequired", 2]);
  eq("… also with a wrong name", ((await closeChannel(db, closeArgs({ confirmName: "Другое" }))) as Row).code, "confirmRequired");
  eq("… nothing was touched while blocked", [T.subs.filter((s) => s.status === "active").length, T.tariffs[0].archivedAt, notices.length, logs.length], [3, null, 0, 0]);
  truth("confirmNameMatches: case / spaces insensitive, legacy «Канал: План» accepted by the channel part", confirmNameMatches({ name: "Торговые сигналы: Месяц" }, "  торговые  СИГНАЛЫ ") && confirmNameMatches({ name: "Торговые сигналы: Месяц" }, "Торговые сигналы: Месяц") && !confirmNameMatches({ name: "A" }, ""));
  const done = (await closeChannel(db, closeArgs({ actorId: "adm", actorIsAdmin: true, confirmName: "Торговые сигналы" }))) as Row;
  eq("with the typed name (staff may do it too): archived, 3 subscriptions ended", [done.ok, done.mode, done.cancelled], [true, "archived", 3]);
  eq("subscriptions: cancelled, ended now, Telegram off; the expired row untouched", T.subs.map((s) => [s.id, s.status, +s.endDate === +NOW || s.id === "k4", s.telegramNotify]), [["k1", "cancelled", true, false], ["k2", "cancelled", true, false], ["k3", "cancelled", true, false], ["k4", "expired", true, false]]);
  eq("the channel row is kept, closed, slug freed; plans closed", [T.tariffs[0].archivedAt !== null, T.tariffs[0].isActive, T.tariffs[0].slug, T.tariffs.filter((x) => x.parentId === "ch").every((x) => x.archivedAt && !x.isActive)], [true, false, null, true]);
  eq("paid posts are NOT made public: kept (tariffId stays) and archived", T.ideas.map((i) => [i.tariffId, i.moderationStatus]), [["ch", "archived"], ["ch", "hidden"]]);
  eq("the chat room is archived and closed, not deleted", [T.rooms[0].isArchived, T.rooms[0].isClosed], [true, true]);
  eq("pending payment rejected, confirmed one kept", T.payments.map((p) => p.status), ["REJECTED", "CONFIRMED"]);
  eq("one notice per subscriber (2 people), not per row", notices.sort(), ["m1", "m2"]);
  eq("one audit line", [logs.length, logs[0].startsWith("[channel-close] ")], [1, true]);
  const again = (await closeChannel(db, closeArgs())) as Row;
  eq("idempotent: the second call is a no-op", [again.ok, again.mode, notices.length, logs.length], [true, "already", 2, 1]);
  eq("a closed channel cannot be bought", await P.channelRootId(db, "ch"), "ch");
  // a channel that never had posts / subscriptions / payments is removed outright
  seed();
  const fresh = (await closeChannel(db, closeArgs({ rootId: "other" }))) as Row;
  eq("0 subscribers, nothing ever: simple confirm, no name needed, physically deleted", [fresh.ok, fresh.mode, T.tariffs.some((x) => x.id === "other")], [true, "deleted", false]);
  seed();
  T.subs.push(sub("e1", "old", "pw", -10, { status: "expired" }));
  const oldOnly = (await closeChannel(db, closeArgs())) as Row;
  eq("0 ACTIVE subscribers but history: no name needed, archived (history kept)", [oldOnly.ok, oldOnly.mode, T.tariffs[0].archivedAt !== null], [true, "archived", true]);

  /* ---- 8. «Удалить тариф» ---- */
  seed();
  T.subs.push(sub("q1", "w1", "pw", 6), sub("q2", "w2", "ch", 6));
  T.payments.push({ id: "pp", tariffId: "pw", status: "PENDING" });
  eq("the channel row is not deletable as a plan", ((await deletePlan(db, { planId: "ch", actorId: "author" })) as Row).code, "notAPlan");
  eq("not by someone else", ((await deletePlan(db, { planId: "pw", actorId: "intruder" })) as Row).code, "forbidden");
  const dp = (await deletePlan(db, { planId: "pw", actorId: "author" })) as Row;
  eq("plan deleted: its subscribers move to the channel, term unchanged", [dp.ok, dp.movedSubscriptions, T.tariffs.some((x) => x.id === "pw"), T.subs.map((s) => s.tariffId), +T.subs[0].endDate], [true, 1, false, ["ch", "ch"], +days(6)]);
  eq("… they keep access (family of the channel)", await P.familyOfTariff(db, "ch"), ["ch", "py"]);
  eq("… pending payment of the deleted plan is rejected (it must not grant an author-wide subscription)", T.payments[0].status, "REJECTED");
  eq("the other plan and the channel survive", T.tariffs.map((x) => x.id), ["ch", "py", "other"]);

  /* ---- 9. the merge script ---- */
  seed();
  // the owner's case: two separate channels «Торговые сигналы: Месяц» (13 subs) and «…: Неделя» (0), each with posts and a chat
  const mk = (id: string, name: string, price: number, d: number, room: string) => ({ ...T.tariffs[0], id, name, planName: null, parentId: null, price, durationDays: d, slug: id === "m" ? "signals" : null, channelRoomId: room });
  T.tariffs = [mk("m", "Торговые сигналы: Месяц", 3000, 30, "rm"), mk("w", "Торговые сигналы: Неделя", 1000, 7, "rw")];
  T.rooms = [{ id: "rm" }, { id: "rw" }];
  T.messages = [{ id: "x1", roomId: "rm" }, { id: "x2", roomId: "rw" }, { id: "x3", roomId: "rw" }];
  T.ideas = [{ id: "i1", tariffId: "m" }, { id: "i2", tariffId: "w" }];
  T.subs = [sub("z1", "p1", "m", 5), sub("z2", "p2", "w", 5), sub("z3", "p3", "m", 5), sub("z4", "p3", "w", 20)];
  const snapshot = JSON.stringify(T);
  const dry = await mergeChannelPlans(db, { rootId: "m", planIds: ["w"], rename: "Торговые сигналы", now: NOW }, false);
  eq("dry run: valid, writes nothing", [dry.ok, dry.applied, JSON.stringify(T) === snapshot], [true, false, true]);
  eq("dry run report: names, counts, room action, duplicates", [dry.root?.newName, dry.root?.planName, dry.plans[0].newName, dry.plans[0].ideas, dry.plans[0].chatMessages, dry.plans[0].roomAction, dry.duplicates], ["Торговые сигналы", "Месяц", "Неделя", 1, 2, "move-messages-and-archive", [{ subscriberId: "p3", rows: 2 }]]);
  const bad = await mergeChannelPlans(db, { rootId: "m", planIds: ["nope"], now: NOW }, true);
  eq("unknown plan: refused, nothing written", [bad.ok, JSON.stringify(T) === snapshot], [false, true]);
  const applied = await mergeChannelPlans(db, { rootId: "m", planIds: ["w"], rename: "Торговые сигналы", now: NOW }, true);
  eq("apply: the plan becomes a child; names are the clean channel name + plan names", [applied.applied, T.tariffs.map((x) => [x.id, x.name, x.planName, x.parentId, x.slug])], [true, [["m", "Торговые сигналы", "Месяц", null, "signals"], ["w", "Неделя", null, "m", null]]]);
  eq("apply: subscriptions stay on their rows (no days lost), access by family", [T.subs.map((s) => s.tariffId), await P.tariffFamily(db, "m")], [["m", "w", "m", "w"], ["m", "w"]]);
  eq("apply: posts of the plan move to the channel", T.ideas.map((i) => i.tariffId), ["m", "m"]);
  eq("apply: chat messages move into the channel's room, the old room is archived (not deleted)", [T.messages.map((x) => x.roomId), T.rooms.map((r) => [r.id, r.isArchived ?? false]), T.tariffs.map((x) => x.channelRoomId)], [["rm", "rm", "rm"], [["rm", false], ["rw", true]], ["rm", null]]);
  const snap2 = JSON.stringify(T);
  const second = await mergeChannelPlans(db, { rootId: "m", planIds: ["w"], rename: "Торговые сигналы", now: NOW }, true);
  eq("idempotent: a second apply changes nothing", [second.ok, second.plans[0].alreadyMerged, JSON.stringify(T) === snap2], [true, true, true]);
  const merged = await mergeChannelPlans(db, { rootId: "m", planIds: ["w"], rename: "Торговые сигналы", mergeDuplicates: true, now: NOW }, true);
  eq("--merge-duplicates: one row per person; the later row gets the remaining days of the other", [merged.ok, T.subs.filter((s) => s.subscriberId === "p3" && s.status === "active").length, +T.subs.find((s) => s.id === "z4")!.endDate], [true, 1, +days(25)]);
  // a root without a chat takes the plan's room
  seed();
  T.tariffs = [{ ...mk("m2", "A: Месяц", 3000, 30, "rx"), channelRoomId: null }, mk("w2", "A: Неделя", 1000, 7, "rw")];
  T.rooms = [{ id: "rw" }];
  T.messages = [{ id: "y1", roomId: "rw" }];
  await mergeChannelPlans(db, { rootId: "m2", planIds: ["w2"], now: NOW }, true);
  eq("the channel without a chat takes the plan's room, nothing is lost", [T.tariffs.map((x) => x.channelRoomId), T.messages[0].roomId, T.tariffs[0].name], [["rw", null], "rw", "A"]);

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  if (fails) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
