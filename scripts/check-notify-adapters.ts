/* Channel adapters against a mocked fetch: payload shapes, error classification
   (transient vs permanent), SSRF validation of the webhook URL, webhook signature.
   Run: npx tsx scripts/check-notify-adapters.ts   (exit code 1 on a failed assertion) */
import { createHmac } from "node:crypto";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

type Call = { url: string; init: any };
function mockFetch(responder: (url: string, init: any) => { status?: number; json?: unknown; throws?: Error }) {
  const calls: Call[] = [];
  const f = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responder(String(url), init);
    if (r.throws) throw r.throws;
    const status = r.status ?? 200;
    return new Response([204, 205, 304].includes(status) ? null : JSON.stringify(r.json ?? {}), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}
const msg = { title: "Anna <b>replied</b>", body: "hello & bye", link: "/ideas/42", locale: "en" };

async function main() {
  // env for the adapters under test (set BEFORE the modules read it)
  process.env.RESEND_API_KEY = "re_test";
  process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
  process.env.TELEGRAM_BOT_USERNAME = "fomo_bot";
  process.env.TELEGRAM_API_BASE = "https://tg.example.test";
  process.env.MAX_BOT_TOKEN = "max-token";
  process.env.MAX_BOT_USERNAME = "fomo_max_bot";
  process.env.WHATSAPP_TOKEN = "wa-token";
  process.env.WHATSAPP_PHONE_ID = "1555000";
  process.env.WHATSAPP_TEMPLATE_CODE = "fomo_code";
  process.env.WHATSAPP_TEMPLATE_NOTIFY = "fomo_notify";
  process.env.VK_GROUP_TOKEN = "vk-token";
  process.env.VK_COMMUNITY_NAME = "fomo";

  const email = await import("../src/lib/notify-channels/email");
  const telegram = await import("../src/lib/notify-channels/telegram");
  const max = await import("../src/lib/notify-channels/max");
  const whatsapp = await import("../src/lib/notify-channels/whatsapp");
  const vk = await import("../src/lib/notify-channels/vk");
  const webhook = await import("../src/lib/notify-channels/webhook");
  const ssrf = await import("../src/lib/ssrf");
  const { absoluteLink } = await import("../src/lib/notify-channels/types");

  /* ---- links ---- */
  eq("absolute link ru: no prefix", absoluteLink("/ideas/42", "ru"), "https://fomo.spot/ideas/42");
  eq("absolute link en: /en prefix", absoluteLink("/ideas/42", "en"), "https://fomo.spot/en/ideas/42");
  eq("absolute link cn: /zh prefix", absoluteLink("/ideas/42", "cn"), "https://fomo.spot/zh/ideas/42");
  eq("absolute link kept as is", absoluteLink("https://example.com/x", "ru"), "https://example.com/x");

  /* ---- e-mail (Resend) ---- */
  {
    const m = mockFetch(() => ({ status: 200, json: { id: "1" } }));
    const r = await email.send({ id: "c", userId: "u", address: "a@b.co" }, msg, { fetch: m.f });
    const body = JSON.parse(m.calls[0].init.body);
    eq("email: ok", r, { ok: true });
    eq("email: Resend endpoint + bearer", [m.calls[0].url, m.calls[0].init.headers.Authorization], ["https://api.resend.com/emails", "Bearer re_test"]);
    eq("email: recipient + subject", [body.to, body.subject], [["a@b.co"], msg.title]);
    eq("email: user text is HTML-escaped", body.html.includes("&lt;b&gt;replied&lt;/b&gt;") && !body.html.includes("<b>replied"), true);
    eq("email: absolute localized link", body.html.includes("https://fomo.spot/en/ideas/42"), true);
    const bad = await email.send({ id: "c", userId: "u", address: "x@y.zz" }, msg, { fetch: mockFetch(() => ({ status: 422, json: { message: "Invalid `to`" } })).f });
    eq("email: 422 is permanent", [bad.ok, bad.permanent], [false, true]);
    const rl = await email.send({ id: "c", userId: "u", address: "x@y.zz" }, msg, { fetch: mockFetch(() => ({ status: 429 })).f });
    eq("email: 429 is transient", [rl.ok, rl.permanent], [false, false]);
    const down = await email.send({ id: "c", userId: "u", address: "x@y.zz" }, msg, { fetch: mockFetch(() => ({ throws: new Error("ECONNRESET") })).f });
    eq("email: network error is transient and never throws", [down.ok, down.permanent, down.error], [false, undefined, "ECONNRESET"]);
  }

  /* ---- Telegram (site bot) via the global fetch (shared transport) ---- */
  {
    const realFetch = globalThis.fetch;
    try {
      let m = mockFetch(() => ({ json: { ok: true, result: {} } }));
      globalThis.fetch = m.f;
      const r = await telegram.send({ id: "c", userId: "u", address: "555" }, msg);
      const body = JSON.parse(m.calls[0].init.body);
      eq("telegram: ok", r, { ok: true });
      eq("telegram: URL goes through the relay base + token", m.calls[0].url, "https://tg.example.test/bot123:ABC/sendMessage");
      eq("telegram: chat id + HTML mode", [body.chat_id, body.parse_mode], ["555", "HTML"]);
      eq("telegram: title bold, user text escaped", body.text, "<b>Anna &lt;b&gt;replied&lt;/b&gt;</b>\nhello &amp; bye");
      eq("telegram: open-button with absolute localized link", body.reply_markup.inline_keyboard[0][0], { text: "Open", url: "https://fomo.spot/en/ideas/42" });
      const ru = telegram.buildTelegramPayload("1", { ...msg, locale: "ru" });
      eq("telegram: button label in the recipient's language", ru.reply_markup!.inline_keyboard[0][0].text, "Открыть");
      eq("telegram: suppressed note appended", telegram.buildTelegramPayload("1", { ...msg, suppressed: 3 }).text.includes("<i>(3 more notifications were not sent"), true);

      m = mockFetch(() => ({ status: 403, json: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } }));
      globalThis.fetch = m.f;
      const blocked = await telegram.send({ id: "c", userId: "u", address: "555" }, msg);
      eq("telegram: 403 blocked = permanent", [blocked.ok, blocked.permanent], [false, true]);
      m = mockFetch(() => ({ status: 429, json: { ok: false, error_code: 429, description: "Too Many Requests: retry after 5", parameters: { retry_after: 5 } } }));
      globalThis.fetch = m.f;
      const flood = await telegram.send({ id: "c", userId: "u", address: "555" }, msg);
      eq("telegram: 429 = transient", [flood.ok, flood.permanent], [false, false]);
      m = mockFetch(() => ({ throws: new Error("fetch failed") }));
      globalThis.fetch = m.f;
      eq("telegram: network error = transient", (await telegram.send({ id: "c", userId: "u", address: "555" }, msg)).permanent, undefined);
      eq("telegram: permanent classifier", [telegram.isPermanentTelegramError(400, "Bad Request: chat not found"), telegram.isPermanentTelegramError(400, "Bad Request: can't parse entities"), telegram.isPermanentTelegramError(502, "")], [true, false, false]);
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ---- MAX ---- */
  {
    const m = mockFetch(() => ({ json: { message: { body: {} } } }));
    const r = await max.send({ id: "c", userId: "u", address: "9001" }, msg, { fetch: m.f });
    eq("max: ok", r, { ok: true });
    eq("max: POST /messages?user_id=", [m.calls[0].url, m.calls[0].init.method], ["https://platform-api.max.ru/messages?user_id=9001", "POST"]);
    eq("max: token in Authorization header (no Bearer)", m.calls[0].init.headers.Authorization, "max-token");
    eq("max: plain text with title, body and absolute link", JSON.parse(m.calls[0].init.body).text, "Anna <b>replied</b>\nhello & bye\nhttps://fomo.spot/en/ideas/42");
    const nf = await max.send({ id: "c", userId: "u", address: "9001" }, msg, { fetch: mockFetch(() => ({ status: 404, json: { code: "chat.not.found", message: "no chat" } })).f });
    eq("max: chat not found = permanent", [nf.ok, nf.permanent], [false, true]);
    const auth = await max.send({ id: "c", userId: "u", address: "9001" }, msg, { fetch: mockFetch(() => ({ status: 401, json: { code: "verify.token", message: "Invalid access_token" } })).f });
    eq("max: 401 (our token) is NOT the user's fault", [auth.ok, auth.permanent], [false, false]);
    const s500 = await max.send({ id: "c", userId: "u", address: "9001" }, msg, { fetch: mockFetch(() => ({ status: 503 })).f });
    eq("max: 5xx transient", s500.permanent, false);
  }

  /* ---- WhatsApp Cloud API ---- */
  {
    eq("whatsapp: phone normalisation", [whatsapp.normalizePhone("+7 (900) 123-45-67"), whatsapp.normalizePhone("8 900 123"), whatsapp.normalizePhone("abc"), whatsapp.normalizePhone("+0123456789")], ["79001234567", null, null, null]);
    eq("whatsapp: template params collapse newlines and runs of spaces", whatsapp.waParam("a\nb\t\tc     d"), "a b c d");
    const m = mockFetch(() => ({ json: { messages: [{ id: "wamid" }] } }));
    const r = await whatsapp.send({ id: "c", userId: "u", address: "79001234567" }, { ...msg, locale: "cn" }, { fetch: m.f });
    const body = JSON.parse(m.calls[0].init.body);
    eq("whatsapp: ok", r, { ok: true });
    eq("whatsapp: Graph endpoint + bearer", [m.calls[0].url, m.calls[0].init.headers.Authorization], ["https://graph.facebook.com/v21.0/1555000/messages", "Bearer wa-token"]);
    eq("whatsapp: template message in the recipient's language (zh_CN)", [body.type, body.template.name, body.template.language.code], ["template", "fomo_notify", "zh_CN"]);
    eq("whatsapp: 3 body parameters title/body/link", body.template.components[0].parameters.map((p: any) => p.text), ["Anna <b>replied</b>", "hello & bye", "https://fomo.spot/zh/ideas/42"]);
    eq("whatsapp: never sends free text", body.text, undefined);
    const code = await whatsapp.sendCode("79001234567", "123456", "ru", { fetch: m.f });
    const cb = JSON.parse(m.calls[1].init.body);
    eq("whatsapp: code via the authentication template (+ copy-code button)", [code.ok, cb.template.name, cb.template.language.code, cb.template.components[0].parameters[0].text, cb.template.components[1].sub_type], [true, "fomo_code", "ru", "123456", "url"]);
    const nr = await whatsapp.send({ id: "c", userId: "u", address: "79001234567" }, msg, { fetch: mockFetch(() => ({ status: 400, json: { error: { code: 131026, message: "Message undeliverable" } } })).f });
    eq("whatsapp: 131026 (not on WhatsApp) = permanent", [nr.ok, nr.permanent], [false, true]);
    const tok = await whatsapp.send({ id: "c", userId: "u", address: "79001234567" }, msg, { fetch: mockFetch(() => ({ status: 401, json: { error: { code: 190, message: "token expired" } } })).f });
    eq("whatsapp: 190 (our token) = not permanent", tok.permanent, false);
    delete process.env.WHATSAPP_TOKEN;
    eq("whatsapp: not configured without env", [whatsapp.isConfigured(), (await whatsapp.send({ id: "c", userId: "u", address: "7900" }, msg, { fetch: m.f })).ok], [false, false]);
    process.env.WHATSAPP_TOKEN = "wa-token";
  }

  /* ---- VK ---- */
  {
    const m = mockFetch(() => ({ json: { response: 12345 } }));
    const r = await vk.send({ id: "c", userId: "u", address: "777" }, msg, { fetch: m.f });
    const form = new URLSearchParams(m.calls[0].init.body);
    eq("vk: ok", r, { ok: true });
    eq("vk: messages.send form", [m.calls[0].url, form.get("user_id"), form.get("access_token"), form.get("v")], ["https://api.vk.com/method/messages.send", "777", "vk-token", "5.199"]);
    eq("vk: random_id present", Number(form.get("random_id")) > 0, true);
    eq("vk: message text", form.get("message"), "Anna <b>replied</b>\nhello & bye\nhttps://fomo.spot/en/ideas/42");
    const denied = await vk.send({ id: "c", userId: "u", address: "777" }, msg, { fetch: mockFetch(() => ({ json: { error: { error_code: 901, error_msg: "Can't send messages for users without permission" } } })).f });
    eq("vk: 901 = permanent", [denied.ok, denied.permanent], [false, true]);
    const flood = await vk.send({ id: "c", userId: "u", address: "777" }, msg, { fetch: mockFetch(() => ({ json: { error: { error_code: 9, error_msg: "Flood control" } } })).f });
    eq("vk: 9 (flood) = transient", [flood.ok, flood.permanent], [false, false]);
  }

  /* ---- SSRF ---- */
  {
    const bad: Array<[string, string]> = [
      ["http://example.com/hook", "https_only"],
      ["https://user:pw@example.com/hook", "credentials_in_url"],
      ["https://127.0.0.1/hook", "ip_literal_not_allowed"],
      ["https://[::1]/hook", "ip_literal_not_allowed"],
      ["https://10.0.0.5/hook", "ip_literal_not_allowed"],
      ["https://169.254.169.254/latest/meta-data", "ip_literal_not_allowed"],
      ["https://2130706433/hook", "ip_literal_not_allowed"],
      ["https://0x7f000001/hook", "ip_literal_not_allowed"],
      ["https://localhost/hook", "private_host"],
      ["https://db.internal/hook", "private_host"],
      ["https://intranet/hook", "private_host"],
      ["https://example.com:8080/hook", "port_not_allowed"],
      ["ftp://example.com/x", "https_only"],
      ["not a url", "invalid_url"],
    ];
    for (const [u, reason] of bad) {
      const c = ssrf.validateOutboundUrl(u);
      eq(`ssrf: reject ${u}`, c.ok ? "accepted" : c.reason, reason);
    }
    eq("ssrf: accept a normal https hook", ssrf.validateOutboundUrl("https://hooks.zapier.com/hooks/catch/1/abc/").ok, true);
    eq("ssrf: accept :8443", ssrf.validateOutboundUrl("https://example.com:8443/h").ok, true);
    const priv = ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "ff02::1", "2001:db8::1"];
    eq("ssrf: private/reserved addresses", priv.filter((ip) => !ssrf.isPrivateIp(ip)), []);
    const pub = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
    eq("ssrf: public addresses pass", pub.filter((ip) => ssrf.isPrivateIp(ip)), []);
    eq("ssrf: DNS to private address rejected", await ssrf.assertResolvesPublic("evil.example.com", async () => [{ address: "10.0.0.7", family: 4 }]), { ok: false, reason: "resolves_to_private_address" });
    eq("ssrf: mixed public+private answer rejected", (await ssrf.assertResolvesPublic("evil.example.com", async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }])).ok, false);
    eq("ssrf: public DNS passes", (await ssrf.assertResolvesPublic("ok.example.com", async () => [{ address: "93.184.216.34", family: 4 }])).ok, true);
    eq("ssrf: DNS failure rejected", (await ssrf.assertResolvesPublic("nx.example.com", async () => { throw new Error("ENOTFOUND"); })).ok, false);
  }

  /* ---- Webhook adapter ---- */
  {
    const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const row = { id: "c", userId: "u", address: "https://hooks.example.com/h/abc", secret: "s3cret" };
    const m = mockFetch(() => ({ status: 204 }));
    const now = () => 1_800_000_000_000;
    const r = await webhook.send(row, msg, { fetch: m.f, lookup: publicLookup, now });
    eq("webhook: ok on 204", r, { ok: true });
    const call = m.calls[0];
    eq("webhook: POST, no redirect following", [call.init.method, call.init.redirect], ["POST", "manual"]);
    const ts = call.init.headers["X-Fomo-Timestamp"];
    eq("webhook: timestamp header = unix seconds", ts, "1800000000");
    const expected = "sha256=" + createHmac("sha256", "s3cret").update(`${ts}.${call.init.body}`).digest("hex");
    eq("webhook: HMAC-SHA256 over `${timestamp}.${body}`", call.init.headers["X-Fomo-Signature"], expected);
    const payload = JSON.parse(call.init.body);
    eq("webhook: JSON shape", [payload.event, payload.title, payload.body, payload.link, payload.locale], ["notification", msg.title, msg.body, "https://fomo.spot/en/ideas/42", "en"]);
    eq("webhook: Slack `text` and Discord `content` compatible", [typeof payload.text, payload.content === payload.text], ["string", true]);
    eq("webhook: signature depends on the secret", webhook.sign("a", "1", "x") !== webhook.sign("b", "1", "x"), true);

    eq("webhook: redirect response is a failure, not followed", (await webhook.send(row, msg, { fetch: mockFetch(() => ({ status: 302 })).f, lookup: publicLookup })).permanent, true);
    eq("webhook: 404 = permanent", (await webhook.send(row, msg, { fetch: mockFetch(() => ({ status: 404 })).f, lookup: publicLookup })).permanent, true);
    eq("webhook: 500 = transient", (await webhook.send(row, msg, { fetch: mockFetch(() => ({ status: 500 })).f, lookup: publicLookup })).permanent, false);
    eq("webhook: timeout = transient", (await webhook.send(row, msg, { fetch: mockFetch(() => ({ throws: Object.assign(new Error("x"), { name: "TimeoutError" }) })).f, lookup: publicLookup })).error, "timeout");

    const neverCalled = mockFetch(() => ({ status: 200 }));
    const internal = await webhook.send({ ...row, address: "https://hooks.example.com/h" }, msg, { fetch: neverCalled.f, lookup: async () => [{ address: "192.168.0.10", family: 4 }] });
    eq("webhook: host resolving to a private IP is refused WITHOUT any request", [internal.ok, internal.permanent, neverCalled.calls.length], [false, true, 0]);
    const lit = await webhook.send({ ...row, address: "https://127.0.0.1/h" }, msg, { fetch: neverCalled.f, lookup: publicLookup });
    eq("webhook: IP literal refused without any request", [lit.ok, neverCalled.calls.length], [false, 0]);
    const http = await webhook.send({ ...row, address: "http://hooks.example.com/h" }, msg, { fetch: neverCalled.f, lookup: publicLookup });
    eq("webhook: plain http refused", [http.ok, neverCalled.calls.length], [false, 0]);
    eq("webhook: missing secret refused", (await webhook.send({ ...row, secret: null }, msg, { fetch: neverCalled.f, lookup: publicLookup })).ok, false);
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
