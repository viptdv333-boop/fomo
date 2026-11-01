/* Account mirror (one account on fomo.spot and terminal.fomo.spot): configuration, HMAC signing / verification (method, path and direction are
   signed), replay window, wire format, profile whitelist and sender-side clipping, status mapping, fomoId collision rule, avatar checks,
   the RECEIVER rules against an in-memory fake database (privileged accounts untouchable, compare-and-swap on passwords, e-mail change
   needs the same hash, sign-up completion rules, idempotency) and the sending side against a fake peer (retries, 404, ordering, never throws).
   Run: npx tsx scripts/check-account-mirror.ts   (exit code 1 on a failed assertion) */
import { readFileSync } from "node:fs";
import {
  AVATAR_DOWNLOAD_TIMEOUT_MS,
  BACKOFF_MS,
  CRITICAL_BACKOFF_MS,
  CRITICAL_OPS,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  LIMITS,
  MIRROR_PATH,
  MIRROR_VERSION,
  NOT_FOUND_PAUSES_MS,
  NonceCache,
  PROFILE_EXCLUDED,
  PROFILE_FIELDS,
  REPLAY_WINDOW_MS,
  REQUEST_TIMEOUT_AVATAR_MS,
  REQUEST_TIMEOUT_MS,
  altFomoId,
  avatarFetchUrl,
  backoffFor,
  changedFields,
  clip,
  constantTimeEqual,
  inboundBucket,
  isCriticalOp,
  isMirrorAvatarPath,
  mainWinsProfile,
  mirrorConfig,
  mirrorDirection,
  mirrorMessageSchema,
  mirroredStatus,
  normalizePeerUrl,
  profileFromUser,
  profileToPrismaData,
  shouldRetryStatus,
  signRequest,
  signingString,
  sniffImage,
  verifyRequest,
} from "../src/lib/account-mirror";
import { applyMirrorMessage, applyPulledProfile, type Db } from "../src/lib/account-mirror-server";
import { FOMO_ID_REGEX } from "../src/lib/fomoId";
import { routeAllowed } from "../src/lib/site-mode";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const SECRET = "a".repeat(64);
const bc = (c: string) => "$2b$10$" + c.repeat(53);
const HASH = bc("A");
const HASH_B = bc("B");
const HASH_C = bc("C");
const DIR = mirrorDirection("main", "terminal");

type Row = Record<string, any>;
/** Just enough of Prisma's user delegate for the receiver: findUnique / findMany / create / update / updateMany over an array. */
function fakeDb(rows: Row[]) {
  let n = 0;
  const match = (r: Row, w: Row) => Object.entries(w).every(([k, v]) => r[k] === v);
  const apply = (r: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === "object" && "increment" in v ? (r[k] ?? 0) + v.increment : v;
  };
  const user = {
    findUnique: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
    findFirst: async ({ where }: any) =>
      rows.find((r) =>
        Object.entries(where).every(([k, v]: [string, any]) => (v && typeof v === "object" && "equals" in v ? String(r[k]).toLowerCase() === String(v.equals).toLowerCase() : r[k] === v)),
      ) ?? null,
    findMany: async ({ where }: any) => rows.filter((r) => match(r, where ?? {})),
    create: async ({ data }: any) => {
      const r = { id: "new" + ++n, role: "USER", sessionVersion: 0, avatarUrl: null, ...data };
      rows.push(r);
      return r;
    },
    update: async ({ where, data }: any) => {
      const r = rows.find((x) => match(x, where))!;
      apply(r, data);
      return r;
    },
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter((r) => match(r, where));
      hit.forEach((r) => apply(r, data));
      return { count: hit.length };
    },
  };
  return { db: { user } as unknown as Db, rows };
}

async function main() {
  /* ---- configuration: OFF unless both variables are good ---- */
  eq("config: nothing set -> off", mirrorConfig({}), null);
  eq("config: secret only -> off", mirrorConfig({ ACCOUNT_MIRROR_SECRET: SECRET }), null);
  eq("config: peer only -> off", mirrorConfig({ ACCOUNT_MIRROR_PEER_URL: "http://127.0.0.1:3100" }), null);
  eq("config: short secret -> off", mirrorConfig({ ACCOUNT_MIRROR_SECRET: "short", ACCOUNT_MIRROR_PEER_URL: "http://127.0.0.1:3100" }), null);
  eq("config: both -> on", mirrorConfig({ ACCOUNT_MIRROR_SECRET: SECRET, ACCOUNT_MIRROR_PEER_URL: "http://127.0.0.1:3100/" }), { secret: SECRET, peerUrl: "http://127.0.0.1:3100" });
  eq("peer url: loopback http ok", ["http://127.0.0.1:3000", "http://localhost:3100", "http://[::1]:3100"].map(normalizePeerUrl), ["http://127.0.0.1:3000", "http://localhost:3100", "http://[::1]:3100"]);
  eq("peer url: https anywhere ok", normalizePeerUrl("https://terminal.fomo.spot"), "https://terminal.fomo.spot");
  eq(
    "peer url: plain http to a public host, paths, credentials, junk -> refused",
    ["http://terminal.fomo.spot", "http://127.0.0.1:3100/api", "http://u:p@127.0.0.1:3100", "ftp://127.0.0.1", "nope", "", undefined, "http://127.0.0.1:3100?x=1"].map(normalizePeerUrl),
    [null, null, null, null, null, null, null, null],
  );

  /* ---- signing / verification (method, path and direction are part of the signed text) ---- */
  const body = JSON.stringify({ op: "reset", email: "a@b.co", passwordHash: HASH });
  const t0 = 1_800_000_000_000;
  const sig = await signRequest(SECRET, body, { direction: DIR, now: t0, nonce: "n".repeat(32) });
  const good = { secret: SECRET, body, direction: DIR, timestamp: sig.timestamp, nonce: sig.nonce, signature: sig.signature, now: t0 + 1000 };
  eq("signature: valid request verifies", await verifyRequest(good), true);
  eq("signature: deterministic for the same input", (await signRequest(SECRET, body, { direction: DIR, now: t0, nonce: "n".repeat(32) })).signature, sig.signature);
  eq("signature: 64 hex characters", /^[0-9a-f]{64}$/.test(sig.signature), true);
  eq("signed text: version | method | path | direction | timestamp | nonce | body", signingString({ direction: DIR, timestamp: "1", nonce: "n", body: "b" }), `${MIRROR_VERSION}|POST|${MIRROR_PATH}|main>terminal|1|n|b`);
  eq("signature: the opposite direction is refused (a captured request cannot be reflected)", await verifyRequest({ ...good, direction: mirrorDirection("terminal", "main") }), false);
  eq("signature: another method or path is refused", [await verifyRequest({ ...good, method: "PUT" }), await verifyRequest({ ...good, path: "/api/other" })], [false, false]);
  eq("signature: changed body is refused", await verifyRequest({ ...good, body: body.replace("a@b.co", "x@b.co") }), false);
  eq("signature: other secret is refused", await verifyRequest({ ...good, secret: "b".repeat(64) }), false);
  eq("signature: changed timestamp is refused", await verifyRequest({ ...good, timestamp: String(t0 + 1) }), false);
  eq("signature: changed nonce is refused", await verifyRequest({ ...good, nonce: "m".repeat(32) }), false);
  eq("signature: no secret configured -> refused", [await verifyRequest({ ...good, secret: undefined }), await verifyRequest({ ...good, secret: "" })], [false, false]);
  eq("signature: missing headers -> refused", [await verifyRequest({ ...good, signature: null }), await verifyRequest({ ...good, nonce: undefined }), await verifyRequest({ ...good, timestamp: "" })], [false, false, false]);
  eq("signature: junk headers -> refused", [await verifyRequest({ ...good, signature: "zz" }), await verifyRequest({ ...good, nonce: "short" }), await verifyRequest({ ...good, timestamp: "abc" })], [false, false, false]);
  eq("replay window: exactly 60 s old is accepted", await verifyRequest({ ...good, now: t0 + REPLAY_WINDOW_MS }), true);
  eq("replay window: older than 60 s is refused", await verifyRequest({ ...good, now: t0 + REPLAY_WINDOW_MS + 1 }), false);
  eq("replay window: from the future beyond 60 s is refused", await verifyRequest({ ...good, now: t0 - REPLAY_WINDOW_MS - 1 }), false);
  eq("constant-time compare", [constantTimeEqual("abc", "abc"), constantTimeEqual("abc", "abd"), constantTimeEqual("abc", "ab")], [true, false, false]);

  const cache = new NonceCache(2 * REPLAY_WINDOW_MS, 100);
  eq("nonce cache: first use fresh, second use is a replay", [cache.fresh("n1", t0), cache.fresh("n1", t0 + 1000)], [true, false]);
  eq("nonce cache: forgotten after twice the window", cache.fresh("n1", t0 + 2 * REPLAY_WINDOW_MS + 1), true);
  const small = new NonceCache(10_000, 4);
  for (let i = 0; i < 20; i++) small.fresh("x" + i, t0 + i);
  eq("nonce cache: bounded memory", [small.fresh("x19", t0 + 21), small.fresh("x0", t0 + 22)], [false, true]);

  /* ---- retry policy, limits ---- */
  eq("retry: 5xx and 429 are retried, 404 / 400 are final", [500, 502, 429, 404, 400, 401, 200].map(shouldRetryStatus), [true, true, true, false, false, false, false]);
  eq("backoff: profile / login copy 3 tries, first at once", [...BACKOFF_MS], [0, 400, 1200]);
  const critTotal = CRITICAL_BACKOFF_MS.reduce<number>((a, b) => a + b, 0);
  eq("backoff: sign-up / password / e-mail messages are retried for about 5 minutes", [critTotal >= 240_000, critTotal <= 330_000, CRITICAL_BACKOFF_MS[0]], [true, true, 0]);
  eq("critical ops: register, password, reset, email (not profile / ensure)", [[...CRITICAL_OPS], ["register", "password", "reset", "email", "profile", "ensure"].map(isCriticalOp)], [["register", "password", "reset", "email"], [true, true, true, true, false, false]]);
  eq("backoff per op", [backoffFor("password") === CRITICAL_BACKOFF_MS, backoffFor("profile") === BACKOFF_MS, backoffFor("ensure") === BACKOFF_MS], [true, true, true]);
  eq("not_found pauses: a few, with a pause", [NOT_FOUND_PAUSES_MS.length, NOT_FOUND_PAUSES_MS[0] >= 1000], [3, true]);
  eq("avatar messages: the sender waits longer than the receiver's avatar download", [REQUEST_TIMEOUT_AVATAR_MS > AVATAR_DOWNLOAD_TIMEOUT_MS, REQUEST_TIMEOUT_AVATAR_MS > REQUEST_TIMEOUT_MS], [true, true]);
  const bCrit = inboundBucket("password");
  const bProfile = inboundBucket("profile");
  eq("inbound limits: critical ops have their own, stricter bucket; profile / ensure noise cannot starve them", [bCrit.key !== bProfile.key, bCrit.limit < bProfile.limit, inboundBucket("reset").key === bCrit.key, inboundBucket("register").key === bCrit.key, inboundBucket("email").key === bCrit.key, inboundBucket("ensure").key === bProfile.key], [true, true, true, true, true, true]);

  /* ---- status mapping ---- */
  eq("status: APPROVED mirrors as APPROVED, PENDING / BANNED / unknown are not mirrored", ["APPROVED", "PENDING", "BANNED", "", null, undefined].map(mirroredStatus), ["APPROVED", null, null, null, null, null]);

  /* ---- profile whitelist ---- */
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const userModel = /^model User \{([\s\S]*?)^\}/m.exec(schema)![1];
  const SCALARS = new Set(["String", "Int", "Boolean", "DateTime", "Decimal", "Json", "Float", "BigInt", "UserRole", "UserStatus"]);
  const scalarFields = userModel
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/))
    .filter((p) => SCALARS.has(p[1].replace(/[?\[\]]/g, "")))
    .map((p) => p[0]);
  const classified = new Set<string>([...PROFILE_FIELDS, ...PROFILE_EXCLUDED]);
  eq("whitelist: every scalar column of User is classified (mirrored or excluded)", scalarFields.filter((f) => !classified.has(f)), []);
  eq("whitelist: nothing is both mirrored and excluded", PROFILE_FIELDS.filter((f) => (PROFILE_EXCLUDED as readonly string[]).includes(f)), []);
  eq("whitelist: every listed field exists in User", [...PROFILE_FIELDS, ...PROFILE_EXCLUDED].filter((f) => !scalarFields.includes(f)), []);
  eq(
    "whitelist: roles, ban, money, rating and credentials are never mirrored",
    ["role", "status", "bannedUntil", "banReason", "rating", "ratingBonus", "sessionVersion", "subscriptionPrice", "paymentCard", "donationCard", "sbpQrUrl", "passwordHash", "email"].filter((f) => (PROFILE_FIELDS as readonly string[]).includes(f)),
    [],
  );

  const record = {
    id: "c1", email: "a@b.co", passwordHash: HASH, role: "OWNER", status: "APPROVED", rating: 9, paymentCard: "4111111111111111", donationCard: "x", sbpQrUrl: "/uploads/payment-qr/1/a.png",
    subscriptionPrice: 500, bannedUntil: null, displayName: "Anna", fomoId: "fomo_user1234567", bio: null, avatarUrl: "/uploads/avatars/c1/0b3f.jpg",
    firstName: "Anna", lastName: null, birthDate: new Date("1990-05-17T00:00:00Z"), city: "Moscow", workplace: "X", exchangeExperience: "3y",
    specializations: ["futures", "options"], socialLinks: { telegram: "@anna" }, locale: "en", dmEnabled: false,
  };
  const wire = profileFromUser(record);
  eq("profileFromUser: whitelisted fields only, dates as ISO", wire, {
    displayName: "Anna", fomoId: "fomo_user1234567", bio: null, avatarUrl: "/uploads/avatars/c1/0b3f.jpg", firstName: "Anna", lastName: null,
    birthDate: "1990-05-17T00:00:00.000Z", city: "Moscow", workplace: "X", exchangeExperience: "3y", specializations: ["futures", "options"],
    socialLinks: { telegram: "@anna" }, locale: "en", dmEnabled: false,
  });
  eq("profileFromUser: a partial update carries only what changed", profileFromUser({ city: "Kazan", paymentCard: "4111", role: "ADMIN" }), { city: "Kazan" });
  eq("profileFromUser: avatar removed -> null; external or foreign avatar is dropped", [profileFromUser({ avatarUrl: null }), profileFromUser({ avatarUrl: "https://evil.example/a.jpg" }), profileFromUser({ avatarUrl: "/uploads/ideas/1/a.jpg" })], [{ avatarUrl: null }, {}, {}]);
  eq("profileFromUser: bad locale / non-boolean dmEnabled dropped", profileFromUser({ locale: "xx", dmEnabled: "yes" }), {});
  eq("profileToPrismaData: no fomoId / avatar (the receiver handles those), birthDate back to Date", profileToPrismaData(wire), {
    displayName: "Anna", bio: null, firstName: "Anna", lastName: null, birthDate: new Date("1990-05-17T00:00:00.000Z"), city: "Moscow", workplace: "X",
    exchangeExperience: "3y", specializations: ["futures", "options"], socialLinks: { telegram: "@anna" }, locale: "en", dmEnabled: false,
  });
  eq("profileToPrismaData: absent fields stay absent, null birthDate clears", [profileToPrismaData({ city: "X" }), profileToPrismaData({ birthDate: null })], [{ city: "X" }, { birthDate: null }]);

  /* ---- sender-side clipping: valid source data never makes the receiver's schema refuse the whole message ---- */
  eq("profileFromUser: a NULL or malformed fomoId is skipped, not sent", [profileFromUser({ fomoId: null }), profileFromUser({ fomoId: "a b" }), profileFromUser({ fomoId: "ab" })], [{}, {}, {}]);
  eq("profileFromUser: an empty display name is skipped", [profileFromUser({ displayName: "  " }), profileFromUser({ displayName: null })], [{}, {}]);
  const nasty = profileFromUser({
    displayName: "D".repeat(300), bio: "b".repeat(5000), firstName: "f".repeat(400), city: "c".repeat(400), workplace: "w".repeat(900), exchangeExperience: "e".repeat(400),
    specializations: [...Array.from({ length: 80 }, (_, i) => "s".repeat(250) + i), 5, null, "", "  "],
    socialLinks: { telegram: "t".repeat(900), website: "w".repeat(2000), evil: "x", vk: 42 },
  });
  eq("profileFromUser: long values are clipped to the wire limits", [
    nasty.displayName!.length, nasty.bio!.length, nasty.firstName!.length, nasty.city!.length, nasty.workplace!.length, nasty.exchangeExperience!.length,
    nasty.specializations!.length, nasty.specializations![0].length, nasty.socialLinks!.telegram!.length, nasty.socialLinks!.website!.length, Object.keys(nasty.socialLinks!),
  ], [LIMITS.displayName, LIMITS.bio, LIMITS.firstName, LIMITS.city, LIMITS.workplace, LIMITS.exchangeExperience, LIMITS.specializations, LIMITS.specialization, LIMITS.socialShort, LIMITS.website, ["telegram", "website"]]);
  eq("profileFromUser: the clipped profile passes the receiver's schema", mirrorMessageSchema.safeParse({ op: "profile", email: "a@b.co", profile: nasty }).success, true);
  eq("profileFromUser: a whole odd source record still makes a valid register message", mirrorMessageSchema.safeParse({ op: "register", email: "a@b.co", passwordHash: HASH, profile: profileFromUser({ ...record, fomoId: null, ...nasty }) }).success, true);
  eq("clip: never leaves half of a surrogate pair", [clip("ab\u{1F600}cd", 3), clip("abc", 3), clip("abcd", 3)], ["ab", "abc", "abc"]);
  eq("changedFields: unchanged values are not sent, non-whitelisted keys never are", changedFields({ city: "Kazan", bio: "x" }, { city: "Kazan", bio: "y", paymentCard: "1", birthDate: null }), { bio: "y", birthDate: null });
  eq("changedFields: dates and lists compare by value", changedFields({ birthDate: new Date("2000-01-01"), specializations: ["a"] }, { birthDate: new Date("2000-01-01"), specializations: ["a"] }), {});

  /* ---- wire format (zod) ---- */
  const reg = { op: "register", email: "a@b.co", passwordHash: HASH, profile: { displayName: "Anna" } };
  eq("schema: register / ensure / password / reset / email / profile accepted", [
    mirrorMessageSchema.safeParse(reg).success,
    mirrorMessageSchema.safeParse({ ...reg, op: "ensure", profile: wire }).success,
    mirrorMessageSchema.safeParse({ op: "password", email: "a@b.co", passwordHash: HASH_B, oldHash: HASH }).success,
    mirrorMessageSchema.safeParse({ op: "reset", email: "a@b.co", passwordHash: HASH }).success,
    mirrorMessageSchema.safeParse({ op: "email", email: "a@b.co", newEmail: "c@d.co", passwordHash: HASH }).success,
    mirrorMessageSchema.safeParse({ op: "profile", email: "a@b.co", profile: { city: "X" } }).success,
  ], [true, true, true, true, true, true]);
  eq("schema: a user-initiated password change without the old hash, an e-mail change without the hash are refused", [
    mirrorMessageSchema.safeParse({ op: "password", email: "a@b.co", passwordHash: HASH }).success,
    mirrorMessageSchema.safeParse({ op: "email", email: "a@b.co", newEmail: "c@d.co" }).success,
  ], [false, false]);
  eq("schema: a plaintext password is not a hash", mirrorMessageSchema.safeParse({ op: "reset", email: "a@b.co", passwordHash: "hunter2hunter2" }).success, false);
  eq("schema: unknown op, missing displayName, bad e-mail refused", [
    mirrorMessageSchema.safeParse({ op: "delete", email: "a@b.co" }).success,
    mirrorMessageSchema.safeParse({ ...reg, profile: {} }).success,
    mirrorMessageSchema.safeParse({ ...reg, email: "not-an-email" }).success,
  ], [false, false, false]);
  eq("schema: bad fomoId / avatar path / locale refused", [
    mirrorMessageSchema.safeParse({ op: "profile", email: "a@b.co", profile: { fomoId: "a b" } }).success,
    mirrorMessageSchema.safeParse({ op: "profile", email: "a@b.co", profile: { avatarUrl: "https://evil.example/a.jpg" } }).success,
    mirrorMessageSchema.safeParse({ op: "profile", email: "a@b.co", profile: { avatarUrl: "/uploads/avatars/../../etc/passwd" } }).success,
    mirrorMessageSchema.safeParse({ op: "profile", email: "a@b.co", profile: { locale: "de" } }).success,
  ], [false, false, false, false]);
  const sneaky = mirrorMessageSchema.safeParse({ op: "register", email: "a@b.co", passwordHash: HASH, profile: { displayName: "A", role: "OWNER", status: "APPROVED", paymentCard: "4111" }, role: "OWNER" });
  eq("schema: role / status / money keys are stripped, never reach the receiver", sneaky.success && JSON.stringify(sneaky.data), JSON.stringify({ op: "register", email: "a@b.co", passwordHash: HASH, profile: { displayName: "A" } }));

  /* ---- fomoId collision ---- */
  const alt = await altFomoId("fomo_user1234567", "Anna@B.co");
  eq("fomoId: collision alternative is deterministic, case-insensitive on the e-mail, valid", [alt === (await altFomoId("fomo_user1234567", "anna@b.co")), FOMO_ID_REGEX.test(alt), alt.startsWith("fomo_user1234567_")], [true, true, true]);
  eq("fomoId: differs per e-mail", alt !== (await altFomoId("fomo_user1234567", "other@b.co")), true);
  const longAlt = await altFomoId("x".repeat(33), "a@b.co");
  eq("fomoId: a 33-character id still fits after the suffix", [longAlt.length, FOMO_ID_REGEX.test(longAlt)], [33, true]);

  /* ---- avatars ---- */
  eq("avatar path: our upload paths only", [
    "/uploads/avatars/clx9a1/3f2a-b.jpg", "/uploads/avatars/clx9a1/3f2a.png", "/uploads/avatars/clx9a1/3f2a.webp",
    "https://evil.example/uploads/avatars/a/b.jpg", "/uploads/avatars/../x/b.jpg", "/uploads/ideas/a/b.jpg", "/uploads/avatars/a/b.svg", "/uploads/avatars/a/b.jpg?x=1", "//evil.example/a.jpg", "", null,
  ].map(isMirrorAvatarPath), [true, true, true, false, false, false, false, false, false, false, false]);
  eq("avatar fetch url: peer origin + validated path, nothing else", [
    avatarFetchUrl("http://127.0.0.1:3000", "/uploads/avatars/c1/a.jpg"),
    avatarFetchUrl("http://127.0.0.1:3000", "https://evil.example/a.jpg"),
    avatarFetchUrl("http://evil.example", "/uploads/avatars/c1/a.jpg"),
  ], ["http://127.0.0.1:3000/uploads/avatars/c1/a.jpg", null, null]);
  eq("image sniffing: real magic bytes, not the content type", [
    sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0])), sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    sniffImage(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), sniffImage(new TextEncoder().encode("GIF89a")),
    sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), sniffImage(new TextEncoder().encode("<html>")), sniffImage(new Uint8Array(0)),
  ], ["jpeg", "png", "webp", "gif", null, null, null]);

  /* ---- the terminal instance serves exactly this one internal route ---- */
  eq("terminal allowlist: /api/internal/account-mirror open, other internal routes closed", [
    routeAllowed("terminal", "/api/internal/account-mirror", true), routeAllowed("terminal", "/api/internal/other", true), routeAllowed("terminal", "/api/internal", true), routeAllowed("terminal", "/api/internal/account-mirror/x", true),
  ], [true, false, false, false]);
  eq("main site serves it (as everything)", routeAllowed("main", MIRROR_PATH, true), true);

  /* ---- the RECEIVER against an in-memory database ---- */
  {
    const rows: Row[] = [
      { id: "u1", email: "anna@b.co", passwordHash: HASH, role: "USER", status: "APPROVED", fomoId: "fomo_user1111111", sessionVersion: 0, city: null },
      { id: "o1", email: "owner@b.co", passwordHash: HASH, role: "OWNER", status: "APPROVED", fomoId: "fomo_user2222222", sessionVersion: 0, city: "Owner town" },
      { id: "a1", email: "admin@b.co", passwordHash: HASH, role: "ADMIN", status: "APPROVED", fomoId: "fomo_user3333333", sessionVersion: 0 },
      { id: "p1", email: "pend@b.co", passwordHash: HASH_C, role: "USER", status: "PENDING", fomoId: "fomo_user4444444", sessionVersion: 0 },
      { id: "p2", email: "pendadmin@b.co", passwordHash: HASH_C, role: "ADMIN", status: "PENDING", fomoId: "fomo_user5555555", sessionVersion: 0 },
      { id: "k1", email: "kim@gmail.com", passwordHash: HASH, role: "USER", status: "APPROVED", fomoId: "fomo_user6666666", sessionVersion: 0 },
      { id: "k2", email: "k.im2@gmail.com", passwordHash: HASH, role: "USER", status: "PENDING", fomoId: "fomo_user7777777", sessionVersion: 0 },
      { id: "k3", email: "kim2@gmail.com", passwordHash: HASH, role: "USER", status: "APPROVED", fomoId: "fomo_user8888888", sessionVersion: 0 },
      { id: "x1", email: "taken@b.co", passwordHash: HASH, role: "USER", status: "APPROVED", fomoId: "fomo_user9999999", sessionVersion: 0 },
    ];
    const { db } = fakeDb(rows);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    const run = (m: unknown) => applyMirrorMessage(mirrorMessageSchema.parse(m), db);
    const res = async (m: unknown) => {
      const r = await run(m);
      return [r.result, r.reason ?? null];
    };

    // password: compare-and-swap on the old hash
    eq("receiver password: old hash matches -> new hash stored, sessions of this site closed", [await res({ op: "password", email: "anna@b.co", passwordHash: HASH_B, oldHash: HASH }), row("u1").passwordHash === HASH_B, row("u1").sessionVersion], [["updated", null], true, 1]);
    eq("receiver password: a retry of the same message is a no-op (no second session eviction)", [await res({ op: "password", email: "anna@b.co", passwordHash: HASH_B, oldHash: HASH }), row("u1").sessionVersion], [["noop", null], 1]);
    eq("receiver password: a different old hash (the passwords of the two accounts differ) -> skipped, account untouched", [await res({ op: "password", email: "anna@b.co", passwordHash: HASH_C, oldHash: HASH }), row("u1").passwordHash === HASH_B, row("u1").sessionVersion], [["skipped", "mismatch"], true, 1]);
    eq("receiver password: unknown address -> not_found", await res({ op: "password", email: "nobody@b.co", passwordHash: HASH_C, oldHash: HASH }), ["not_found", null]);
    // reset: unconditional but USER only
    eq("receiver reset: applied whatever the receiver had (mailbox ownership was proven)", [await res({ op: "reset", email: "anna@b.co", passwordHash: HASH_C }), row("u1").passwordHash === HASH_C, row("u1").sessionVersion], [["updated", null], true, 2]);
    // privileged accounts are untouchable
    const priv = [
      { op: "password", email: "owner@b.co", passwordHash: HASH_B, oldHash: HASH },
      { op: "reset", email: "owner@b.co", passwordHash: HASH_B },
      { op: "email", email: "owner@b.co", newEmail: "pwned@b.co", passwordHash: HASH },
      { op: "password", email: "admin@b.co", passwordHash: HASH_B, oldHash: HASH },
      { op: "reset", email: "admin@b.co", passwordHash: HASH_B },
      { op: "email", email: "admin@b.co", newEmail: "pwned2@b.co", passwordHash: HASH },
    ];
    const privReplies = [];
    for (const m of priv) privReplies.push(await res(m));
    eq("receiver: password / reset / email for OWNER and ADMIN are all skipped as privileged", privReplies, priv.map(() => ["skipped", "privileged"]));
    eq("receiver: OWNER and ADMIN rows are exactly as before", [row("o1").passwordHash === HASH, row("o1").email, row("o1").city, row("o1").sessionVersion, row("a1").passwordHash === HASH, row("a1").email, row("a1").sessionVersion], [true, "owner@b.co", "Owner town", 0, true, "admin@b.co", 0]);
    // profile-only ops work for every role: display fields sync, credentials and role never move
    const ownerBefore = JSON.stringify({ role: row("o1").role, status: row("o1").status, email: row("o1").email, hash: row("o1").passwordHash, sv: row("o1").sessionVersion });
    eq("receiver profile: an OWNER's display fields sync (name, city, social links)", [
      await res({ op: "profile", email: "owner@b.co", profile: { city: "Oslo", displayName: "The Owner", socialLinks: { telegram: "@o" } } }), row("o1").city, row("o1").displayName, row("o1").socialLinks,
    ], [["updated", null], "Oslo", "The Owner", { telegram: "@o" }]);
    eq("receiver profile: an ADMIN's display fields sync too", [await res({ op: "profile", email: "admin@b.co", profile: { bio: "hello" } }), row("a1").bio], [["updated", null], "hello"]);
    eq("receiver profile: role, status, e-mail, hash and sessions of the OWNER are exactly as before", JSON.stringify({ role: row("o1").role, status: row("o1").status, email: row("o1").email, hash: row("o1").passwordHash, sv: row("o1").sessionVersion }), ownerBefore);
    eq("receiver profile: the e-mail is matched without regard to case", [await res({ op: "profile", email: "OWNER@b.co", profile: { city: "Rome" } }), row("o1").city], [["updated", null], "Rome"]);
    // e-mail change: same current hash required
    eq("receiver email: the account with a different hash is not renamed", [await res({ op: "email", email: "anna@b.co", newEmail: "anna2@b.co", passwordHash: HASH_B }), row("u1").email], [["skipped", "mismatch"], "anna@b.co"]);
    eq("receiver email: same hash -> renamed, sessions closed", [await res({ op: "email", email: "anna@b.co", newEmail: "anna2@b.co", passwordHash: HASH_C }), row("u1").email, row("u1").sessionVersion], [["updated", null], "anna2@b.co", 3]);
    eq("receiver email: a retry after the rename is a no-op", [await res({ op: "email", email: "anna@b.co", newEmail: "anna2@b.co", passwordHash: HASH_C }), row("u1").sessionVersion], [["noop", null], 3]);
    eq("receiver email: a new address that belongs to another account here -> conflict, nothing renamed", [await res({ op: "email", email: "anna2@b.co", newEmail: "taken@b.co", passwordHash: HASH_C }), row("u1").email], [["conflict", null], "anna2@b.co"]);
    eq("receiver email: nobody has either address -> not_found", await res({ op: "email", email: "ghost@b.co", newEmail: "ghost2@b.co", passwordHash: HASH_C }), ["not_found", null]);
    // sign-up
    eq("receiver ensure: an existing account is left alone (other password, other profile)", [await res({ op: "ensure", email: "anna2@b.co", passwordHash: HASH, profile: { displayName: "Other", city: "Elsewhere" } }), row("u1").passwordHash === HASH_C, row("u1").city], [["exists", null], true, null]);
    eq("receiver register: abandoned PENDING USER signup is completed", [await res({ op: "register", email: "pend@b.co", passwordHash: HASH_B, profile: { displayName: "Pat", city: "Perm" } }), row("p1").status, row("p1").passwordHash === HASH_B, row("p1").city], [["completed", null], "APPROVED", true, "Perm"]);
    eq("receiver register: PENDING ADMIN is never completed", [await res({ op: "register", email: "pendadmin@b.co", passwordHash: HASH_B, profile: { displayName: "Evil" } }), row("p2").status, row("p2").passwordHash === HASH_C], [["skipped", "privileged"], "PENDING", true]);
    eq("receiver register: the alias check of the local sign-up also guards the completion branch", [await res({ op: "register", email: "k.im2@gmail.com", passwordHash: HASH_B, profile: { displayName: "Kim" } }), row("k2").status, row("k2").passwordHash === HASH], [["alias_conflict", null], "PENDING", true]);
    eq("receiver register: a new address that is another spelling of an approved mailbox is not created", [await res({ op: "register", email: "k.i.m@gmail.com", passwordHash: HASH_B, profile: { displayName: "Kim" } }), rows.some((r) => r.email === "k.i.m@gmail.com")], [["alias_conflict", null], false]);
    const before = rows.length;
    const created = await run({ op: "register", email: "new@b.co", passwordHash: HASH_B, profile: { displayName: "Newbie", fomoId: "fomo_user0000001", locale: "en", city: "Oslo", socialLinks: null } });
    const nu = rows[rows.length - 1];
    eq("receiver register: a new account is APPROVED / USER with the same fomoId, hash and profile", [created.result, rows.length - before, nu.status, nu.role, nu.fomoId, nu.passwordHash === HASH_B, nu.displayName, nu.locale, nu.city], ["created", 1, "APPROVED", "USER", "fomo_user0000001", true, "Newbie", "en", "Oslo"]);
    const dup = await run({ op: "register", email: "new@b.co", passwordHash: HASH_C, profile: { displayName: "Again" } });
    eq("receiver register: repeated -> exists, the first copy stays", [dup.result, rows.length - before, rows[rows.length - 1].passwordHash === HASH_B], ["exists", 1, true]);
    const clash = await run({ op: "register", email: "clash@b.co", passwordHash: HASH_B, profile: { displayName: "Clash", fomoId: "fomo_user1111111" } });
    const cl = rows[rows.length - 1];
    eq("receiver register: a fomoId taken by another account gets the deterministic alternative, reported", [clash.result, clash.fomoIdChanged, cl.fomoId === (await altFomoId("fomo_user1111111", "clash@b.co")), FOMO_ID_REGEX.test(cl.fomoId)], ["created", true, true, true]);
    const noId = await run({ op: "register", email: "noid@b.co", passwordHash: HASH_B, profile: { displayName: "NoId" } });
    eq("receiver register: no fomoId in the message (NULL at the source) -> one is generated", [noId.result, FOMO_ID_REGEX.test(rows[rows.length - 1].fomoId), noId.fomoIdChanged ?? false], ["created", true, false]);
    const withAvatar = await run({ op: "register", email: "av@b.co", passwordHash: HASH_B, profile: { displayName: "Av", avatarUrl: "/uploads/avatars/zz/a.jpg" } });
    eq("receiver register: an avatar that cannot be fetched (mirror off here) leaves the account without one and says so", [withAvatar.result, withAvatar.skipped, rows[rows.length - 1].avatarUrl], ["created", ["avatarUrl"], null]);
    // profile
    eq("receiver profile: plain fields of a USER account are updated", [await res({ op: "profile", email: "new@b.co", profile: { city: "Bergen", dmEnabled: false, specializations: ["x"] } }), rows.find((r) => r.email === "new@b.co")!.city], [["updated", null], "Bergen"]);
    eq("receiver profile: a taken fomoId is skipped, the other fields still apply", await (async () => {
      const r = await run({ op: "profile", email: "new@b.co", profile: { fomoId: "fomo_user9999999", city: "Oslo" } });
      return [r.result, r.skipped, rows.find((x) => x.email === "new@b.co")!.city, rows.find((x) => x.email === "new@b.co")!.fomoId];
    })(), ["updated", ["fomoId"], "Oslo", "fomo_user0000001"]);
    eq("receiver profile: unknown address -> not_found", await res({ op: "profile", email: "nobody@b.co", profile: { city: "X" } }), ["not_found", null]);
  }

  /* ---- profile reconcile at login: main wins, empty never blanks ---- */
  eq("mainWinsProfile: fields with a value win", mainWinsProfile({ displayName: "Main", bio: "b", firstName: "F", city: "C", specializations: ["x"], birthDate: "1990-01-01T00:00:00.000Z", dmEnabled: false, locale: "en", avatarUrl: "/uploads/avatars/a/b.jpg", fomoId: "fomo_user1234567" }), { displayName: "Main", fomoId: "fomo_user1234567", bio: "b", avatarUrl: "/uploads/avatars/a/b.jpg", firstName: "F", birthDate: "1990-01-01T00:00:00.000Z", city: "C", specializations: ["x"], locale: "en", dmEnabled: false });
  eq("mainWinsProfile: empty values (null, blank, empty list, link-less object) never blank local ones", mainWinsProfile({ bio: null, firstName: "  ", lastName: "", city: null, specializations: [], socialLinks: { telegram: "", vk: " " }, birthDate: null, avatarUrl: null, workplace: "" }), {});
  eq("mainWinsProfile: the column defaults (locale ru, dmEnabled true) are not values; social links keep only the filled keys", mainWinsProfile({ locale: "ru", dmEnabled: true, socialLinks: { telegram: "@a", vk: "" } }), { socialLinks: { telegram: "@a" } });
  {
    const rows: Row[] = [
      { id: "l1", email: "me@b.co", passwordHash: HASH_C, role: "USER", status: "APPROVED", fomoId: "fomo_user1000001", displayName: "Local Name", bio: "local bio", city: "Local city", firstName: null, locale: "en", avatarUrl: null, sessionVersion: 0 },
      { id: "l2", email: "boss@b.co", passwordHash: HASH_C, role: "OWNER", status: "APPROVED", fomoId: "fomo_user1000002", displayName: "", bio: null, avatarUrl: "/uploads/avatars/l2/keep.jpg", sessionVersion: 0 },
      { id: "l3", email: "other@b.co", passwordHash: HASH, role: "USER", status: "APPROVED", fomoId: "fomo_user1000003", sessionVersion: 0 },
    ];
    const { db } = fakeDb(rows);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    const pulled: import("../src/lib/account-mirror").MirrorProfile = { displayName: "Main Name", bio: null, city: "", firstName: "Maria", specializations: [], locale: "ru", dmEnabled: true, avatarUrl: "/uploads/avatars/zz/main.jpg", fomoId: "fomo_user1000003" };
    const r1 = await applyPulledProfile("l1", pulled, db);
    eq("pull apply: main wins for filled fields, empty ones do not blank, defaults do not override, a taken fomoId is skipped, passwords untouched", [
      r1.applied, row("l1").displayName, row("l1").firstName, row("l1").bio, row("l1").city, row("l1").locale, row("l1").fomoId, row("l1").passwordHash === HASH_C, row("l1").sessionVersion,
    ], [true, "Main Name", "Maria", "local bio", "Local city", "en", "fomo_user1000001", true, 0]);
    eq("pull apply: an avatar that cannot be fetched is reported and the current avatar stays", [r1.skipped.sort(), row("l1").avatarUrl, row("l2").avatarUrl], [["avatarUrl", "fomoId"], null, "/uploads/avatars/l2/keep.jpg"]);
    const r2 = await applyPulledProfile("l2", { displayName: "The Boss", fomoId: "fomo_user1000009", city: "Rome" }, db);
    eq("pull apply: a privileged local account gets the display fields too, never credentials or role", [r2.applied, row("l2").displayName, row("l2").city, row("l2").fomoId, row("l2").role, row("l2").passwordHash === HASH_C, row("l2").sessionVersion], [true, "The Boss", "Rome", "fomo_user1000009", "OWNER", true, 0]);
    eq("pull apply: an unknown local user is a no-op", await applyPulledProfile("nobody", { displayName: "X" }, db), { applied: false, skipped: [] });

    // the answering side (fomo.spot)
    rows.push({ id: "m1", email: "Main.User@b.co", passwordHash: HASH_B, role: "USER", status: "APPROVED", fomoId: "fomo_user2000001", displayName: "Main User", bio: "hi", city: null, firstName: "Mu", lastName: null, birthDate: new Date("1991-02-03T00:00:00Z"), specializations: ["futures"], socialLinks: { telegram: "@mu" }, locale: "en", dmEnabled: false, avatarUrl: "/uploads/avatars/m1/abc.jpg", paymentCard: "4111111111111111", sbpQrUrl: "/uploads/payment-qr/m1/q.png", subscriptionPrice: 100, rating: 5, bannedUntil: null, banReason: null, ratingBonus: 1 });
    rows.push({ id: "m2", email: "chief@b.co", passwordHash: HASH_B, role: "OWNER", status: "APPROVED", fomoId: "fomo_user2000002", displayName: "Chief", bio: null, avatarUrl: "/uploads/avatars/m2/c.jpg", paymentCard: "5555", sessionVersion: 0 });
    const ask = (email: string) => applyMirrorMessage(mirrorMessageSchema.parse({ op: "pull", email }), db);
    const ans = await ask("main.user@B.CO");
    const text = JSON.stringify(ans);
    eq("pull answer: result pulled with exactly the whitelisted fields (address matched without regard to case)", [ans.result, ans.profile], ["pulled", {
      displayName: "Main User", fomoId: "fomo_user2000001", bio: "hi", avatarUrl: "/uploads/avatars/m1/abc.jpg", firstName: "Mu", lastName: null, birthDate: "1991-02-03T00:00:00.000Z",
      city: null, specializations: ["futures"], socialLinks: { telegram: "@mu" }, locale: "en", dmEnabled: false,
    }]);
    eq("pull answer: no hash, role, status, e-mail, money, rating or ban in the payload", ["passwordHash", "role", "status", "email", "paymentCard", "sbpQrUrl", "subscriptionPrice", "rating", "banReason", "bannedUntil", HASH_B, "b.co", "4111"].filter((w) => text.includes(w)), []);
    const own = await ask("chief@b.co");
    eq("pull answer: an OWNER's profile is answered too (display fields only, no credentials)", [own.result, own.profile?.displayName, JSON.stringify(own).includes(HASH_B), JSON.stringify(own).includes("OWNER"), JSON.stringify(own).includes("5555")], ["pulled", "Chief", false, false, false]);
    eq("pull answer: an unknown address -> not_found, no profile", [(await ask("ghost@b.co")).result, (await ask("ghost@b.co")).profile], ["not_found", undefined]);
    eq("pull schema: nothing but the address is sent", [mirrorMessageSchema.safeParse({ op: "pull", email: "a@b.co" }).success, mirrorMessageSchema.safeParse({ op: "pull" }).success], [true, false]);
    eq("pull: a pull is not a critical op (the usual 3 tries and the 300/min bucket)", [isCriticalOp("pull"), backoffFor("pull") === BACKOFF_MS], [false, true]);
  }

  /* ---- the sending side against a fake peer ---- */
  process.env.ACCOUNT_MIRROR_SECRET = SECRET;
  process.env.ACCOUNT_MIRROR_PEER_URL = "http://127.0.0.1:3100";
  const client = await import("../src/lib/account-mirror-client");
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...a: unknown[]) => {
    warnings.push(a.join(" "));
  };
  type Call = { url: string; headers: Record<string, string>; body: string };
  type Step = number | "throw" | { result: string; profile?: unknown };
  let calls: Call[] = [];
  let script: Step[] = [];
  let fetchDelay = 0;
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    if (fetchDelay) await new Promise((r) => setTimeout(r, fetchDelay));
    const next: Step = script.length ? script.shift()! : 200;
    if (next === "throw") throw new TypeError("fetch failed");
    if (typeof next === "object") return new Response(JSON.stringify({ ok: true, ...next }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, result: "created" }), { status: next });
  }) as unknown as typeof fetch;
  const settle = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));
  const user = { id: "uid1", email: "anna@b.co", passwordHash: HASH, status: "APPROVED", displayName: "Anna", role: "OWNER", paymentCard: "4111111111111111", fomoId: "fomo_user1234567", locale: "ru" };

  client.mirrorRegister(user);
  await settle();
  eq("client: one signed POST to the peer's internal route", [calls.length, calls[0]?.url], [1, "http://127.0.0.1:3100" + MIRROR_PATH]);
  const sent = calls[0];
  const hdr = { secret: SECRET, body: sent.body, timestamp: sent.headers[HEADER_TIMESTAMP], nonce: sent.headers[HEADER_NONCE], signature: sent.headers[HEADER_SIGNATURE] };
  eq("client: the request verifies with the shared secret for the direction main>terminal only", [await verifyRequest({ ...hdr, direction: "main>terminal" }), await verifyRequest({ ...hdr, direction: "terminal>main" })], [true, false]);
  const sentJson = JSON.parse(sent.body);
  eq("client: the register body has the hash and the whitelisted profile, no role / status / money", [sentJson.op, sentJson.passwordHash, Object.keys(sentJson.profile).sort(), "role" in sentJson, "status" in sentJson], ["register", HASH, ["displayName", "fomoId", "locale"], false, false]);
  eq("client: the body passes the receiver's schema", mirrorMessageSchema.safeParse(sentJson).success, true);

  calls = [];
  script = [500, "throw", 200];
  client.mirrorReset("uid1", "anna@b.co", HASH);
  await settle(BACKOFF_MS[1] + BACKOFF_MS[2] + 300);
  eq("client: 5xx and network errors are retried, a fresh nonce each time", [calls.length, new Set(calls.map((c) => c.headers[HEADER_NONCE])).size], [3, 3]);

  calls = [];
  script = [500, 500, 500, 200];
  client.mirrorPassword("uid1", "anna@b.co", HASH, HASH_B);
  await settle(CRITICAL_BACKOFF_MS[1] + CRITICAL_BACKOFF_MS[2] + CRITICAL_BACKOFF_MS[3] + 400);
  eq("client: a password change survives a restarting peer (4th try, past the 3 tries of a profile edit)", calls.length, 4);
  eq("client: the password message carries the old and the new hash", [JSON.parse(calls[0].body).oldHash, JSON.parse(calls[0].body).passwordHash], [HASH, HASH_B]);

  calls = [];
  script = [404, 200];
  client.mirrorEmail("uid1", "anna@b.co", "anna2@b.co", HASH);
  await settle(500);
  eq("client: 404 (peer has the mirror off or another secret) is final, no retry", calls.length, 1);
  eq("client: the e-mail message carries the sender's current hash", JSON.parse(calls[0].body).passwordHash, HASH);

  calls = [];
  warnings.length = 0;
  script = [400, 200];
  client.mirrorProfile("uid1", "anna@b.co", { city: "Kazan" });
  await settle(300);
  eq("client: 400 is final and logged with the operation, without any payload", [calls.length, warnings.some((w) => w.includes("profile") && w.includes("400")), warnings.some((w) => w.includes("Kazan") || w.includes("anna"))], [1, true, false]);

  calls = [];
  script = ["throw", "throw", "throw"];
  client.mirrorProfile("uid1", "anna@b.co", { city: "Kazan" });
  await settle(BACKOFF_MS[1] + BACKOFF_MS[2] + 300);
  eq("client: a profile edit gives up after its 3 tries without throwing", calls.length, BACKOFF_MS.length);

  calls = [];
  script = [{ result: "not_found" }, { result: "updated" }];
  client.mirrorProfile("uid1", "anna@b.co", { city: "Kazan" });
  await settle(NOT_FOUND_PAUSES_MS[0] + 400);
  eq("client: not_found for a profile edit is retried after a pause (a rename or the sign-up copy may still be on the way)", calls.length, 2);
  calls = [];
  script = [{ result: "not_found" }, { result: "created" }];
  client.mirrorEmail("uid1", "anna@b.co", "anna3@b.co", HASH);
  await settle(300);
  eq("client: not_found for an e-mail change is final", calls.length, 1);

  // ordering: keyed by the sender's user id, so what follows an e-mail change waits for the rename
  calls = [];
  script = [];
  fetchDelay = 300;
  client.mirrorEmail("uid1", "anna@b.co", "anna4@b.co", HASH);
  client.mirrorProfile("uid1", "anna4@b.co", { city: "Oslo" });
  client.mirrorProfile("uid2", "other@b.co", { city: "Rome" });
  await settle(100);
  const early = calls.map((c) => JSON.parse(c.body).op + ":" + JSON.parse(c.body).email);
  await settle(700);
  const late = calls.map((c) => JSON.parse(c.body).op + ":" + JSON.parse(c.body).email);
  fetchDelay = 0;
  // the two chains run side by side, so only the order INSIDE one account is a property (which chain's request is logged first is not)
  eq(
    "client: one account's messages go out in order (the rename first, the next one only after it finished); other accounts do not wait",
    [[...early].sort(), late.indexOf("email:anna@b.co") < late.indexOf("profile:anna4@b.co"), late.length, late.slice(0, 2).sort()],
    [["email:anna@b.co", "profile:other@b.co"], true, 3, ["email:anna@b.co", "profile:other@b.co"]]
  );

  calls = [];
  script = [];
  client.mirrorEnsure(user);
  await settle();
  client.mirrorEnsure(user);
  await settle();
  eq("client: ensure asks the peer once per address (remembered after a delivered answer)", calls.length, 1);
  client.mirrorEnsure({ ...user, id: "u3", email: "banned@b.co", status: "BANNED" });
  client.mirrorEnsure({ ...user, id: "u4", email: "pending@b.co", status: "PENDING" });
  await settle();
  eq("client: accounts that are not APPROVED are not mirrored", calls.length, 1);
  calls = [];
  client.mirrorEnsure({ ...user, id: "u5", email: "nofomo@b.co", fomoId: null });
  await settle();
  eq("client: a source user without a fomoId still produces a valid ensure message", [calls.length, mirrorMessageSchema.safeParse(JSON.parse(calls[0].body)).success], [1, true]);

  calls = [];
  client.mirrorProfile("uid1", "anna@b.co", { city: "Kazan", paymentCard: "4111", role: "ADMIN" });
  client.mirrorProfile("uid1", "anna@b.co", { paymentCard: "4111" });
  client.mirrorProfile("uid1", null, { city: "X" });
  await settle();
  eq("client: a profile edit sends only whitelisted changed fields; nothing to send -> no request", [calls.length, JSON.parse(calls[0].body).profile], [1, { city: "Kazan" }]);
  eq("client: mirrorActive follows the variables", client.mirrorActive(), true);

  /* ---- mirrorLogin: on fomo.spot ensure, on the terminal pull + apply (main wins) ---- */
  calls = [];
  script = [];
  client.mirrorLogin({ ...user, id: "m-a", email: "main-login@b.co" });
  await settle();
  eq("login on fomo.spot: the old behaviour (ensure), no pull", calls.map((c) => JSON.parse(c.body).op), ["ensure"]);

  process.env.SITE_MODE = "terminal";
  const applied: Array<[string, unknown]> = [];
  calls = [];
  script = [];
  client.mirrorLogin({ ...user, id: "t-0", email: "noapplier@b.co" });
  await settle();
  eq("login on the terminal without a registered applier falls back to ensure", calls.map((c) => JSON.parse(c.body).op), ["ensure"]);

  client.registerPullApplier(async (id, profile) => {
    applied.push([id, profile]);
  });
  const mainProfile = { displayName: "Main Name", fomoId: "fomo_user1234567", bio: "main bio", avatarUrl: "/uploads/avatars/m1/abc.jpg", city: null };
  calls = [];
  script = [{ result: "pulled", profile: mainProfile }];
  client.mirrorLogin({ ...user, id: "t-1", email: "t1@b.co" });
  await settle();
  eq("login on the terminal asks fomo.spot for the profile: one signed `pull` carrying only the address, direction terminal>main", await (async () => {
    const c = calls[0];
    const v = { secret: SECRET, body: c.body, timestamp: c.headers[HEADER_TIMESTAMP], nonce: c.headers[HEADER_NONCE], signature: c.headers[HEADER_SIGNATURE] };
    return [calls.length, JSON.parse(c.body), await verifyRequest({ ...v, direction: "terminal>main" }), await verifyRequest({ ...v, direction: "main>terminal" })];
  })(), [1, { op: "pull", email: "t1@b.co" }, true, false]);
  eq("login on the terminal: the pulled profile is applied to the local account", applied, [["t-1", mainProfile]]);
  client.mirrorLogin({ ...user, id: "t-1", email: "T1@b.co" });
  await settle();
  eq("login on the terminal: throttled, once per address (any case) per 6 hours", [calls.length, applied.length], [1, 1]);

  calls = [];
  applied.length = 0;
  script = [{ result: "pulled", profile: { displayName: "x", role: "OWNER", locale: "de", avatarUrl: "https://evil.example/a.jpg" } }];
  client.mirrorLogin({ ...user, id: "t-2", email: "t2@b.co" });
  await settle();
  eq("login on the terminal: a pulled profile that fails the schema is never applied", [calls.length, applied.length], [1, 0]);

  calls = [];
  script = [{ result: "not_found" }, 200];
  client.mirrorLogin({ ...user, id: "t-3", email: "t3@b.co" });
  await settle();
  eq("login on the terminal: fomo.spot has no such address -> nothing applied, the account is created there (ensure)", [calls.map((c) => JSON.parse(c.body).op), applied.length], [["pull", "ensure"], 0]);

  calls = [];
  script = [{ result: "skipped" }];
  client.mirrorLogin({ ...user, id: "t-4", email: "t4@b.co" });
  await settle();
  client.mirrorLogin({ ...user, id: "t-4", email: "t4@b.co" });
  await settle();
  eq("login on the terminal: a refused pull applies nothing and is not asked again", [calls.length, applied.length], [1, 0]);

  calls = [];
  script = ["throw", "throw", "throw"];
  client.mirrorLogin({ ...user, id: "t-5", email: "t5@b.co" });
  await settle(BACKOFF_MS[1] + BACKOFF_MS[2] + 300);
  eq("login on the terminal: fomo.spot unreachable -> silent, nothing applied, no throw", [calls.length, applied.length], [BACKOFF_MS.length, 0]);

  calls = [];
  client.registerPullApplier(async () => {
    throw new Error("db down");
  });
  script = [{ result: "pulled", profile: mainProfile }];
  client.mirrorLogin({ ...user, id: "t-6", email: "t6@b.co" });
  await settle();
  eq("login on the terminal: an applier that fails is swallowed (login is never blocked)", calls.length, 1);

  calls = [];
  client.mirrorLogin({ ...user, id: "t-7", email: "t7@b.co", status: "BANNED" });
  await settle();
  eq("login on the terminal: not an APPROVED account -> nothing is asked", calls.length, 0);
  delete process.env.SITE_MODE;

  globalThis.fetch = (async () => {
    throw new Error("must not be called");
  }) as unknown as typeof fetch;
  delete process.env.ACCOUNT_MIRROR_SECRET;
  let threw = false;
  try {
    client.mirrorRegister({ ...user, id: "o1", email: "off@b.co" });
    client.mirrorEnsure({ ...user, id: "o2", email: "off2@b.co" });
    client.mirrorLogin({ ...user, id: "o3", email: "off4@b.co" });
    client.mirrorPassword("o1", "off@b.co", HASH, HASH_B);
    client.mirrorReset("o1", "off@b.co", HASH_B);
    client.mirrorEmail("o1", "off@b.co", "off3@b.co", HASH);
    client.mirrorProfile("o1", "off@b.co", { city: "X" });
    await settle();
  } catch {
    threw = true;
  }
  eq("client: with the secret unset every call is a silent no-op (feature OFF)", [threw, client.mirrorActive()], [false, false]);
  globalThis.fetch = realFetch;
  console.warn = realWarn;

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
