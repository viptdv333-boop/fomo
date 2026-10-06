/* FCM delivery to the Android app: service-account loading, RS256 JWT, access-token cache, message shape,
   error mapping, dead-token cleanup, retry, no-op when unconfigured, dispatcher wiring. Fake fetch + a generated RSA key; no network, no DB.
   Run: npx tsx scripts/check-fcm.ts   (exit code 1 on a failed assertion) */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  androidChannelFor,
  buildMessage,
  classifyError,
  isFcmConfigured,
  loadServiceAccount,
  safeLink,
  sendFcmToUser,
  signJwt,
  type FcmStore,
  type ServiceAccount,
} from "../src/lib/fcm";
import { isValidPushToken } from "../src/lib/native-app";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const SA_JSON = JSON.stringify({ type: "service_account", project_id: "fomo3-c2798", client_email: "fcm@fomo3-c2798.iam.gserviceaccount.com", private_key: privateKey, token_uri: "https://oauth2.googleapis.com/token" });
const account: ServiceAccount = { client_email: "fcm@fomo3-c2798.iam.gserviceaccount.com", private_key: privateKey, project_id: "fomo3-c2798", token_uri: "https://oauth2.googleapis.com/token" };

/* ---- 1. configuration ---- */
eq("nothing configured -> null / not configured", [loadServiceAccount({} as NodeJS.ProcessEnv), isFcmConfigured({} as NodeJS.ProcessEnv)], [null, false]);
eq("inline JSON loads, project from the JSON", loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: SA_JSON } as unknown as NodeJS.ProcessEnv)?.project_id, "fomo3-c2798");
eq("FCM_PROJECT_ID overrides", loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: SA_JSON, FCM_PROJECT_ID: "other" } as unknown as NodeJS.ProcessEnv)?.project_id, "other");
eq("broken JSON -> null", loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: "{nope" } as unknown as NodeJS.ProcessEnv), null);
eq("JSON without private key -> null", loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b", project_id: "p" }) } as unknown as NodeJS.ProcessEnv), null);
eq("missing file -> null", loadServiceAccount({ FCM_SERVICE_ACCOUNT_FILE: path.join(os.tmpdir(), "nope-fcm.json") } as unknown as NodeJS.ProcessEnv), null);
{
  const f = path.join(os.tmpdir(), `fcm-check-${process.pid}.json`);
  fs.writeFileSync(f, SA_JSON);
  eq("file loads", loadServiceAccount({ FCM_SERVICE_ACCOUNT_FILE: f } as unknown as NodeJS.ProcessEnv)?.client_email, account.client_email);
  fs.unlinkSync(f);
}
eq("non-https token_uri falls back to Google's", loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...JSON.parse(SA_JSON), token_uri: "http://evil/" }) } as unknown as NodeJS.ProcessEnv)?.token_uri, "https://oauth2.googleapis.com/token");

/* ---- 2. JWT ---- */
{
  const now = Date.UTC(2026, 9, 6, 12, 0, 0);
  const jwt = signJwt(account, now);
  const [h, c, s] = jwt.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  eq("JWT header", header, { alg: "RS256", typ: "JWT" });
  eq("JWT claims", claims, { iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: account.token_uri, iat: now / 1000, exp: now / 1000 + 3600 });
  const v = crypto.createVerify("RSA-SHA256");
  v.update(`${h}.${c}`);
  eq("JWT signature verifies with the public key", v.verify(publicKey, Buffer.from(s, "base64url")), true);
}

/* ---- fake FCM server ---- */
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
function fakeFcm(script: (deviceToken: string, call: number) => Reply, opts: { expiresIn?: number } = {}) {
  const log = { tokenCalls: 0, sendCalls: [] as Array<{ url: string; auth: string; body: Record<string, any> }>, assertions: [] as string[] };
  const calls = new Map<string, number>();
  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === account.token_uri) {
      log.tokenCalls++;
      const body = new URLSearchParams(String(init?.body));
      log.assertions.push(body.get("grant_type") ?? "");
      return new Response(JSON.stringify({ access_token: `at-${log.tokenCalls}`, expires_in: opts.expiresIn ?? 3600 }), { status: 200 });
    }
    const parsed = JSON.parse(String(init?.body));
    const dev = parsed.message.token as string;
    const n = (calls.get(dev) ?? 0) + 1;
    calls.set(dev, n);
    log.sendCalls.push({ url, auth: String((init?.headers as Record<string, string>).Authorization), body: parsed });
    const r = script(dev, n);
    return new Response(r.body === undefined ? "{}" : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { fetchFn, log };
}
function memStore(tokens: Array<{ id: string; token: string }>) {
  const rows = [...tokens];
  const store: FcmStore = {
    async listTokens() {
      return [...rows];
    },
    async deleteToken(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  return { store, rows };
}
const sleeps: number[] = [];
const sleep = async (ms: number) => void sleeps.push(ms);
const payload = { title: "Новое сообщение", body: "привет", link: "/messages?conversation=1", type: "new_message", event: "dm" };

async function main() {
  /* ---- 3. happy path, URL / auth / token cache ---- */
  {
    let clock = Date.UTC(2026, 9, 6, 12, 0, 0);
    const srv = fakeFcm(() => ({ status: 200, body: { name: "projects/x/messages/1" } }));
    const { store } = memStore([{ id: "a", token: "tok-a".padEnd(30, "x") }, { id: "b", token: "tok-b".padEnd(30, "x") }]);
    const deps = { fetch: srv.fetchFn, now: () => clock, sleep, store, account };
    const r1 = await sendFcmToUser("u1", payload, deps);
    eq("two devices accepted", r1, { sent: 2, devices: 2 });
    eq("one token request for concurrent sends", srv.log.tokenCalls, 1);
    eq("grant type", srv.log.assertions[0], "urn:ietf:params:oauth:grant-type:jwt-bearer");
    eq("v1 URL uses the project", srv.log.sendCalls[0].url, "https://fcm.googleapis.com/v1/projects/fomo3-c2798/messages:send");
    eq("bearer access token", srv.log.sendCalls[0].auth, "Bearer at-1");

    // same client (same deps object -> new client each call because fetch is given); build one deps with a shared client by using a single call with many sends instead
    const srv2 = fakeFcm(() => ({ status: 200 }), { expiresIn: 3600 });
    const many = memStore(Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, token: `tok-m${i}`.padEnd(30, "x") })));
    await sendFcmToUser("u1", payload, { fetch: srv2.fetchFn, now: () => clock, sleep, store: many.store, account });
    eq("cache: five sends, one token request", srv2.log.tokenCalls, 1);
  }

  /* ---- 4. token expiry (cache until ~5 min before expiry) is exercised through one client: a long retry sequence ---- */
  {
    let clock = Date.UTC(2026, 9, 6, 12, 0, 0);
    // first send fails with 500 and the (fake) sleep advances the clock past expiry - margin, so the retry must mint a new token
    const srv = fakeFcm((_d, n) => (n === 1 ? { status: 500, body: { error: { status: "INTERNAL" } } } : { status: 200 }), { expiresIn: 3600 });
    const m = memStore([{ id: "x", token: "tok-x".padEnd(30, "x") }]);
    const slow = async (ms: number) => {
      sleeps.push(ms);
      clock += 3400 * 1000; // 56 min later: inside the 5 min refresh margin
    };
    const r = await sendFcmToUser("u1", payload, { fetch: srv.fetchFn, now: () => clock, sleep: slow, store: m.store, account });
    eq("retry after 500 succeeds", r.sent, 1);
    eq("expired cached token was re-minted (2 token requests)", srv.log.tokenCalls, 2);
    eq("second attempt carries the new token", srv.log.sendCalls.map((c) => c.auth), ["Bearer at-1", "Bearer at-2"]);
  }

  /* ---- 5. message shape ---- */
  {
    const m = buildMessage("T".repeat(30), { title: "t".repeat(300), body: "b".repeat(500), link: "https://fomo.spot/ideas/5?x=1", type: "price_alert", event: "price_alert" }) as { message: any };
    eq("title/body are short", [m.message.notification.title.length, m.message.notification.body.length], [100, 180]);
    eq("channel by event", [m.message.android.notification.channel_id, m.message.data.channel], ["terminal", "terminal"]);
    eq("own absolute link becomes a path", m.message.data.link, "/ideas/5?x=1");
    eq("tag = collapse key = notification tag", [m.message.data.tag === m.message.android.collapse_key, m.message.android.notification.tag === m.message.data.tag], [true, true]);
    eq("every data value is a string", Object.values(m.message.data).every((v) => typeof v === "string"), true);
    eq("high priority", m.message.android.priority, "HIGH");
    eq("explicit tag wins", (buildMessage("T".repeat(30), { ...payload, tag: "room-1" }) as any).message.data.tag, "room-1");
    eq("channels", ["dm", "mention", "chat_room_message", "price_alert", "line_alert", "calendar_reminder", "payment_events", undefined].map((e) => androidChannelFor(e as string | undefined)), ["messages", "messages", "messages", "terminal", "terminal", "calendar", "general", "general"]);
    eq("safeLink", [safeLink("/a/b"), safeLink("//evil.com"), safeLink("https://evil.com/x"), safeLink("javascript:alert(1)"), safeLink("/a\\b"), safeLink("https://www.fomo.spot"), safeLink(undefined)], ["/a/b", "", "", "", "", "/", ""]);
  }

  /* ---- 6. error mapping ---- */
  eq("UNREGISTERED is dead", classifyError(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }).dead, true);
  eq("NOT_FOUND with an FCM detail is dead", classifyError(404, { error: { status: "NOT_FOUND", details: [{ "@type": "x", errorCode: "SOMETHING" }] } }).dead, true);
  eq("bare NOT_FOUND (maybe a wrong project) is NOT dead", classifyError(404, { error: { status: "NOT_FOUND", message: "Requested entity was not found." } }).dead, false);
  eq("INVALID_ARGUMENT on the token is dead", classifyError(400, { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } }).dead, true);
  eq("INVALID_ARGUMENT with a token field violation is dead", classifyError(400, { error: { status: "INVALID_ARGUMENT", details: [{ fieldViolations: [{ field: "message.token" }] }] } }).dead, true);
  eq("INVALID_ARGUMENT on our payload is NOT dead", classifyError(400, { error: { status: "INVALID_ARGUMENT", message: "Invalid value at 'message.data'" } }).dead, false);
  eq("429 / 503 retryable, not dead", [classifyError(429, { error: { status: "RESOURCE_EXHAUSTED" } }), classifyError(503, {})].map((f) => [f.retryable, f.dead]), [[true, false], [true, false]]);
  eq("403 sender mismatch is neither", [classifyError(403, { error: { status: "PERMISSION_DENIED", details: [{ errorCode: "SENDER_ID_MISMATCH" }] } })].map((f) => [f.retryable, f.dead]), [[false, false]]);

  /* ---- 7. cleanup, retry, mixed outcomes ---- */
  {
    sleeps.length = 0;
    const srv = fakeFcm((d, n) => {
      if (d.startsWith("tok-dead")) return { status: 404, body: { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } } };
      if (d.startsWith("tok-limit")) return n < 3 ? { status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } }, headers: { "retry-after": "2" } } : { status: 200 };
      if (d.startsWith("tok-down")) return { status: 503, body: { error: { status: "UNAVAILABLE" } } };
      if (d.startsWith("tok-badpayload")) return { status: 400, body: { error: { status: "INVALID_ARGUMENT", message: "bad data" } } };
      return { status: 200 };
    });
    const m = memStore(["tok-ok", "tok-dead", "tok-limit", "tok-down", "tok-badpayload"].map((t, i) => ({ id: `id${i}`, token: t.padEnd(30, "x") })));
    const r = await sendFcmToUser("u1", payload, { fetch: srv.fetchFn, now: () => 0, sleep, store: m.store, account });
    eq("accepted: ok + the one that recovered after 429s", r, { sent: 2, devices: 5 });
    eq("only the dead token was deleted", m.rows.map((x) => x.id), ["id0", "id2", "id3", "id4"]);
    eq("Retry-After honoured (2 s) for 429", sleeps.includes(2000), true);
    eq("503 gives up after 3 attempts", srv.log.sendCalls.filter((c) => c.body.message.token.startsWith("tok-down")).length, 3);
    eq("a bad payload is not retried", srv.log.sendCalls.filter((c) => c.body.message.token.startsWith("tok-badpayload")).length, 1);
  }

  /* ---- 8. revoked access token -> one refresh ---- */
  {
    let first = true;
    const srv = fakeFcm(() => {
      if (first) {
        first = false;
        return { status: 401, body: { error: { status: "UNAUTHENTICATED" } } };
      }
      return { status: 200 };
    });
    const m = memStore([{ id: "z", token: "tok-z".padEnd(30, "x") }]);
    const r = await sendFcmToUser("u1", payload, { fetch: srv.fetchFn, now: () => 0, sleep, store: m.store, account });
    eq("401 -> new access token -> delivered", [r.sent, srv.log.tokenCalls], [1, 2]);
  }

  /* ---- 9. token endpoint down: nothing deleted, nothing thrown ---- */
  {
    const fetchFn = (async () => new Response("no", { status: 500 })) as typeof fetch;
    const m = memStore([{ id: "q", token: "tok-q".padEnd(30, "x") }]);
    const r = await sendFcmToUser("u1", payload, { fetch: fetchFn, now: () => 0, sleep, store: m.store, account });
    eq("auth failure: sent 0, token kept", [r.sent, m.rows.length], [0, 1]);
  }

  /* ---- 10. not configured: silent no-op, no network ---- */
  {
    let called = 0;
    const fetchFn = (async () => (called++, new Response("{}"))) as typeof fetch;
    const m = memStore([{ id: "n", token: "tok-n".padEnd(30, "x") }]);
    const r = await sendFcmToUser("u1", payload, { fetch: fetchFn, store: m.store, account: null });
    eq("no service account -> {0,0}, no request", [r, called], [{ sent: 0, devices: 0 }, 0]);
  }

  /* ---- 11. registration token validation (shared by the page and the API route) ---- */
  eq("push token validation", [isValidPushToken("a".repeat(30)), isValidPushToken("short"), isValidPushToken("bad token ".repeat(5)), isValidPushToken(5), isValidPushToken("x:y_z-1.".repeat(10))], [true, false, false, false, true]);

  /* ---- 12. wiring (source guards: the dispatcher needs a DB to run) ---- */
  {
    const root = path.join(__dirname, "..");
    const dispatch = fs.readFileSync(path.join(root, "src/lib/notify-dispatch.ts"), "utf8");
    const i = dispatch.indexOf("if (d.webpush)");
    const j = dispatch.indexOf("sendFcmToUser(", i);
    const k = dispatch.indexOf("const jobs", i);
    eq("dispatcher: FCM is sent inside the webpush decision (same preference cell + quiet hours)", i > 0 && j > i && j < k, true);
    const webpushAdapter = fs.readFileSync(path.join(root, "src/lib/notify-channels/webpush.ts"), "utf8");
    eq("webpush adapter (test button) also reaches FCM devices", webpushAdapter.includes("sendFcmToUser"), true);
    const matrix = fs.readFileSync(path.join(root, "src/components/profile/notifications/PrefMatrix.tsx"), "utf8");
    eq("matrix: webpush column counts app devices as connected", matrix.includes("fcmConfigured && data.webpush.appDevices"), true);
    const { decide } = await import("../src/lib/notify-decide");
    const quiet = { enabled: true, startMin: 23 * 60, endMin: 8 * 60, timezone: "UTC" };
    eq("quiet hours turn the webpush decision off (so FCM too)", decide({ event: "dm", quiet, now: new Date("2026-10-04T02:00:00Z") }).webpush, false);
    eq("user override off for «В приложении» turns it off", decide({ event: "dm", overrides: { "dm:webpush": false } }).webpush, false);
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
main();
