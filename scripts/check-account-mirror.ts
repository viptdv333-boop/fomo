/* Account mirror (one account on fomo.spot and terminal.fomo.spot): configuration, HMAC signing / verification, replay window, wire format,
   profile whitelist, status mapping, fomoId collision rule, avatar checks, and the sending side against a fake peer (retries, 404, never throws).
   Run: npx tsx scripts/check-account-mirror.ts   (exit code 1 on a failed assertion) */
import { readFileSync } from "node:fs";
import {
  BACKOFF_MS,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  MIRROR_PATH,
  NonceCache,
  PROFILE_EXCLUDED,
  PROFILE_FIELDS,
  REPLAY_WINDOW_MS,
  altFomoId,
  avatarFetchUrl,
  constantTimeEqual,
  isMirrorAvatarPath,
  mirrorConfig,
  mirrorMessageSchema,
  mirroredStatus,
  normalizePeerUrl,
  profileFromUser,
  profileToPrismaData,
  shouldRetryStatus,
  signRequest,
  sniffImage,
  verifyRequest,
} from "../src/lib/account-mirror";
import { FOMO_ID_REGEX } from "../src/lib/fomoId";
import { routeAllowed } from "../src/lib/site-mode";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const SECRET = "a".repeat(64);
const HASH = "$2b$10$" + "abcdefghijklmnopqrstuv".padEnd(53, "A");

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

  /* ---- signing / verification ---- */
  const body = JSON.stringify({ op: "password", email: "a@b.co", passwordHash: HASH });
  const t0 = 1_800_000_000_000;
  const sig = await signRequest(SECRET, body, t0, "n".repeat(32));
  const good = { secret: SECRET, body, timestamp: sig.timestamp, nonce: sig.nonce, signature: sig.signature, now: t0 + 1000 };
  eq("signature: valid request verifies", await verifyRequest(good), true);
  eq("signature: deterministic for the same input", (await signRequest(SECRET, body, t0, "n".repeat(32))).signature, sig.signature);
  eq("signature: 64 hex characters", /^[0-9a-f]{64}$/.test(sig.signature), true);
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

  /* ---- retry policy ---- */
  eq("retry: 5xx and 429 are retried, 404 / 400 are final", [500, 502, 429, 404, 400, 401, 200].map(shouldRetryStatus), [true, true, true, false, false, false, false]);
  eq("backoff: 3 tries, first at once", [...BACKOFF_MS], [0, 400, 1200]);

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

  /* ---- wire format (zod) ---- */
  const reg = { op: "register", email: "a@b.co", passwordHash: HASH, profile: { displayName: "Anna" } };
  eq("schema: register / ensure / password / email / profile accepted", [
    mirrorMessageSchema.safeParse(reg).success,
    mirrorMessageSchema.safeParse({ ...reg, op: "ensure", profile: wire }).success,
    mirrorMessageSchema.safeParse({ op: "password", email: "a@b.co", passwordHash: HASH }).success,
    mirrorMessageSchema.safeParse({ op: "email", email: "a@b.co", newEmail: "c@d.co" }).success,
    mirrorMessageSchema.safeParse({ op: "profile", email: "a@b.co", profile: { city: "X" } }).success,
  ], [true, true, true, true, true]);
  eq("schema: a plaintext password is not a hash", mirrorMessageSchema.safeParse({ op: "password", email: "a@b.co", passwordHash: "hunter2hunter2" }).success, false);
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

  /* ---- the sending side against a fake peer ---- */
  process.env.ACCOUNT_MIRROR_SECRET = SECRET;
  process.env.ACCOUNT_MIRROR_PEER_URL = "http://127.0.0.1:3100";
  const client = await import("../src/lib/account-mirror-client");
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  console.warn = () => {};
  type Call = { url: string; headers: Record<string, string>; body: string };
  let calls: Call[] = [];
  let script: Array<number | "throw"> = [];
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    const next = script.length ? script.shift()! : 200;
    if (next === "throw") throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ ok: true, result: "created" }), { status: next });
  }) as unknown as typeof fetch;
  const settle = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));
  const user = { email: "anna@b.co", passwordHash: HASH, status: "APPROVED", displayName: "Anna", role: "OWNER", paymentCard: "4111111111111111", fomoId: "fomo_user1234567", locale: "ru" };

  client.mirrorRegister(user);
  await settle();
  eq("client: one signed POST to the peer's internal route", [calls.length, calls[0]?.url], [1, "http://127.0.0.1:3100" + MIRROR_PATH]);
  const sent = calls[0];
  eq(
    "client: the request verifies with the shared secret",
    await verifyRequest({ secret: SECRET, body: sent.body, timestamp: sent.headers[HEADER_TIMESTAMP], nonce: sent.headers[HEADER_NONCE], signature: sent.headers[HEADER_SIGNATURE] }),
    true,
  );
  const sentJson = JSON.parse(sent.body);
  eq("client: the register body has the hash and the whitelisted profile, no role / status / money", [sentJson.op, sentJson.passwordHash, Object.keys(sentJson.profile).sort(), "role" in sentJson, "status" in sentJson], ["register", HASH, ["displayName", "fomoId", "locale"], false, false]);
  eq("client: the body passes the receiver's schema", mirrorMessageSchema.safeParse(sentJson).success, true);

  calls = [];
  script = [500, "throw", 200];
  client.mirrorPassword("anna@b.co", HASH);
  await settle(BACKOFF_MS[1] + BACKOFF_MS[2] + 300);
  eq("client: 5xx and network errors are retried, a fresh nonce each time", [calls.length, new Set(calls.map((c) => c.headers[HEADER_NONCE])).size], [3, 3]);

  calls = [];
  script = [404, 200];
  client.mirrorEmail("anna@b.co", "anna2@b.co");
  await settle(500);
  eq("client: 404 (peer has the mirror off or another secret) is final, no retry", calls.length, 1);

  calls = [];
  script = ["throw", "throw", "throw"];
  client.mirrorPassword("anna@b.co", HASH);
  await settle(BACKOFF_MS[1] + BACKOFF_MS[2] + 300);
  eq("client: gives up after the last try without throwing", calls.length, BACKOFF_MS.length);

  calls = [];
  script = [];
  client.mirrorEnsure(user);
  await settle();
  client.mirrorEnsure(user);
  await settle();
  eq("client: ensure asks the peer once per address (remembered after a delivered answer)", calls.length, 1);
  client.mirrorEnsure({ ...user, email: "banned@b.co", status: "BANNED" });
  client.mirrorEnsure({ ...user, email: "pending@b.co", status: "PENDING" });
  await settle();
  eq("client: accounts that are not APPROVED are not mirrored", calls.length, 1);

  calls = [];
  client.mirrorProfile("anna@b.co", { city: "Kazan", paymentCard: "4111", role: "ADMIN" });
  client.mirrorProfile("anna@b.co", { paymentCard: "4111" });
  client.mirrorProfile(null, { city: "X" });
  await settle();
  eq("client: a profile edit sends only whitelisted changed fields; nothing to send -> no request", [calls.length, JSON.parse(calls[0].body).profile], [1, { city: "Kazan" }]);

  globalThis.fetch = (async () => {
    throw new Error("must not be called");
  }) as unknown as typeof fetch;
  delete process.env.ACCOUNT_MIRROR_SECRET;
  let threw = false;
  try {
    client.mirrorRegister({ ...user, email: "off@b.co" });
    client.mirrorEnsure({ ...user, email: "off2@b.co" });
    client.mirrorPassword("off@b.co", HASH);
    client.mirrorEmail("off@b.co", "off3@b.co");
    client.mirrorProfile("off@b.co", { city: "X" });
    await settle();
  } catch {
    threw = true;
  }
  eq("client: with the secret unset every call is a silent no-op (feature OFF)", threw, false);
  globalThis.fetch = realFetch;
  console.warn = realWarn;

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
