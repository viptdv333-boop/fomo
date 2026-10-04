/* Deep-link / code connect flows: token hashing, expiry, one-time use, attempt cap, bot-start parsing.
   Run: npx tsx scripts/check-notify-link.ts   (exit code 1 on a failed assertion) */
import {
  CODE_TTL_MS,
  LINK_TOKEN_TTL_MS,
  checkSecret,
  consumeLinkToken,
  hashSecret,
  isTelegramBotToken,
  looksLikeToken,
  newCode,
  newLinkToken,
  type LinkStore,
} from "../src/lib/notify-link";
import { localeFromLangCode, secretMatches, tokenFromStartText } from "../src/lib/notify-bots";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/** In-memory stand-in for the NotificationChannel table (same claim-by-hash semantics as the SQL UPDATE ... WHERE linkTokenHash = hash). */
function memoryStore() {
  const rows = new Map<string, { id: string; userId: string; channel: string; linkTokenHash: string | null; linkExpiresAt: Date | null; address: string | null; verified: boolean }>();
  const store: LinkStore = {
    async findByHash(channel, hash) {
      for (const r of rows.values()) if (r.channel === channel && r.linkTokenHash === hash) return { id: r.id, userId: r.userId, linkExpiresAt: r.linkExpiresAt };
      return null;
    },
    async claim(id, hash, data) {
      const r = rows.get(id);
      if (!r || r.linkTokenHash !== hash) return false;
      Object.assign(r, { address: data.address, verified: true, linkTokenHash: null, linkExpiresAt: null });
      return true;
    },
  };
  return { rows, store };
}

async function main() {
  const t0 = Date.parse("2026-10-04T10:00:00Z");

  /* ---- token properties ---- */
  const a = newLinkToken(t0);
  const b = newLinkToken(t0);
  eq("token: fits Telegram/MAX start parameter (<=64 of [A-Za-z0-9_-])", looksLikeToken(a.token), true);
  eq("token: unique", a.token !== b.token, true);
  eq("token: only the SHA-256 is kept (64 hex), never the token", [a.hash.length, /^[0-9a-f]{64}$/.test(a.hash), a.hash === a.token], [64, true, false]);
  eq("token: hash is deterministic", hashSecret(a.token), a.hash);
  eq("token: expires in 30 minutes", a.expiresAt.getTime() - t0, LINK_TOKEN_TTL_MS);
  eq("token: shape check rejects junk / injection", ["", "short", "x".repeat(65), "a b c d e f g h i j k", "../../etc/passwd/aaaaaaaa", undefined, 12345].map(looksLikeToken), [false, false, false, false, false, false, false]);

  /* ---- code properties ---- */
  const c = newCode(t0);
  eq("code: 6 digits", /^\d{6}$/.test(c.code), true);
  eq("code: stored hashed", [c.hash === c.code, c.hash.length], [false, 64]);
  eq("code: expires in 15 minutes", c.expiresAt.getTime() - t0, CODE_TTL_MS);
  const row = { linkTokenHash: c.hash, linkExpiresAt: c.expiresAt };
  eq("code check: right code", checkSecret(row, c.code, new Date(t0 + 60_000)), { ok: true });
  eq("code check: wrong code", checkSecret(row, "000000" === c.code ? "111111" : "000000", new Date(t0 + 60_000)), { ok: false, reason: "mismatch" });
  eq("code check: expired", checkSecret(row, c.code, new Date(t0 + CODE_TTL_MS + 1)), { ok: false, reason: "expired" });
  eq("code check: exactly at expiry is expired", checkSecret(row, c.code, new Date(t0 + CODE_TTL_MS)), { ok: false, reason: "expired" });
  eq("code check: nothing pending", checkSecret({ linkTokenHash: null, linkExpiresAt: null }, c.code), { ok: false, reason: "no_token" });

  /* ---- deep-link consumption: valid / unknown / expired / one-time / cross-channel ---- */
  {
    const { rows, store } = memoryStore();
    const t = newLinkToken(t0);
    rows.set("r1", { id: "r1", userId: "user-1", channel: "telegram", linkTokenHash: t.hash, linkExpiresAt: t.expiresAt, address: null, verified: false });

    eq("consume: wrong channel does not match", await consumeLinkToken(store, "max", t.token, "42", null, new Date(t0 + 1000)), { ok: false, reason: "unknown" });
    eq("consume: random token unknown", await consumeLinkToken(store, "telegram", newLinkToken().token, "42", null, new Date(t0 + 1000)), { ok: false, reason: "unknown" });
    eq("consume: malformed token rejected before any lookup", await consumeLinkToken(store, "telegram", "x", "42"), { ok: false, reason: "bad_format" });
    eq("consume: expired token", await consumeLinkToken(store, "telegram", t.token, "42", null, new Date(t0 + LINK_TOKEN_TTL_MS + 1)), { ok: false, reason: "expired" });
    eq("consume: a failed attempt does not burn the token", rows.get("r1")!.linkTokenHash, t.hash);

    const ok = await consumeLinkToken(store, "telegram", t.token, "555000", "@anna", new Date(t0 + 5 * 60_000));
    eq("consume: valid token links the right user", ok, { ok: true, userId: "user-1", rowId: "r1" });
    eq("consume: row now verified with the chat id and the token is gone", [rows.get("r1")!.verified, rows.get("r1")!.address, rows.get("r1")!.linkTokenHash], [true, "555000", null]);
    eq("consume: ONE-TIME — second use fails", await consumeLinkToken(store, "telegram", t.token, "999", null, new Date(t0 + 6 * 60_000)), { ok: false, reason: "unknown" });
    eq("consume: the address cannot be hijacked by replaying the link", rows.get("r1")!.address, "555000");
  }

  /* ---- race: two simultaneous /start with the same token — only one wins ---- */
  {
    const { rows, store } = memoryStore();
    const t = newLinkToken(t0);
    rows.set("r1", { id: "r1", userId: "user-1", channel: "telegram", linkTokenHash: t.hash, linkExpiresAt: t.expiresAt, address: null, verified: false });
    const now = new Date(t0 + 1000);
    const [x, y] = await Promise.all([consumeLinkToken(store, "telegram", t.token, "111", null, now), consumeLinkToken(store, "telegram", t.token, "222", null, now)]);
    eq("race: exactly one of two concurrent uses succeeds", [x.ok, y.ok].filter(Boolean).length, 1);
    eq("race: the loser is told 'used' or 'unknown'", [x, y].filter((r) => !r.ok).map((r) => (r as any).reason).every((r) => r === "used" || r === "unknown"), true);
  }

  /* ---- Telegram own-bot token shape ---- */
  eq("bot token: real-looking token accepted", isTelegramBotToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0"), true);
  eq("bot token: junk rejected", ["", "abc", "123:short", "123456789:AAH/../etc", "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0" + String.fromCharCode(10), " 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0", 5, null].map(isTelegramBotToken), [false, false, false, false, false, false, false, false]);

  /* ---- bot update helpers ---- */
  eq("start text: with token", tokenFromStartText("/start abcDEF123_-xyzabcdef1234"), "abcDEF123_-xyzabcdef1234");
  eq("start text: bare /start", tokenFromStartText("/start"), undefined);
  eq("start text: /start@botname token", tokenFromStartText("/start@fomo_bot TOKEN_1234567890123456"), "TOKEN_1234567890123456");
  eq("start text: other command", tokenFromStartText("/help me"), undefined);
  eq("lang code -> locale", ["ru-RU", "en", "en-US", "zh-hans", "de", undefined].map(localeFromLangCode), ["ru", "en", "en", "cn", "ru", "ru"]);
  eq("webhook secret: match", secretMatches("topsecret", "topsecret"), true);
  eq("webhook secret: mismatch", secretMatches("topsecreT", "topsecret"), false);
  eq("webhook secret: different length", secretMatches("short", "topsecret"), false);
  eq("webhook secret: missing header", secretMatches(null, "topsecret"), false);
  eq("webhook secret: server secret not configured -> everything refused", secretMatches("anything", undefined), false);

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
