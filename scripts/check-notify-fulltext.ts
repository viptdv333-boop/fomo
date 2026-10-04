/* Full text in e-mail / Telegram notifications: splitting, escaping, size caps, ACCESS (paywall),
   webhook field, and an end-to-end run through the dispatcher with a fake Prisma and a fake fetch.
   No network, no database.   Run: npx tsx scripts/check-notify-fulltext.ts   (exit code 1 on a failure) */

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const yes = (name: string, cond: boolean) => eq(name, cond, true);

/** Telegram HTML sanity: only <b>/<i> tags, balanced; no raw < > &; entities limited to amp/lt/gt. */
function tgHtmlProblems(html: string): string[] {
  const bad: string[] = [];
  const stripped = html.replace(/<\/?(?:b|i)>/g, "");
  if (/[<>]/.test(stripped)) bad.push("raw angle bracket outside <b>/<i>");
  if (/&(?!(?:amp|lt|gt);)/.test(stripped)) bad.push("unknown or broken entity");
  for (const tag of ["b", "i"]) {
    const open = (html.match(new RegExp(`<${tag}>`, "g")) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    if (open !== close) bad.push(`unbalanced <${tag}>`);
  }
  return bad;
}
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

type Call = { url: string; init: any };
function installFetch(responder: (url: string, init: any) => { status?: number; json?: unknown } = () => ({ json: { ok: true, result: {} } })) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responder(String(url), init);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

async function main() {
  process.env.RESEND_API_KEY = "re_test";
  process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
  process.env.TELEGRAM_API_BASE = "https://tg.example.test";
  process.env.WHATSAPP_TOKEN = "wa-token";
  process.env.WHATSAPP_PHONE_ID = "1555000";
  process.env.WHATSAPP_TEMPLATE_CODE = "fomo_code";
  process.env.WHATSAPP_TEMPLATE_NOTIFY = "fomo_notify";

  const text = await import("../src/lib/notify-text");
  const tg = await import("../src/lib/notify-channels/telegram");
  const types = await import("../src/lib/notify-channels/types");
  const mailRender = await import("../src/lib/notify-email-render");
  const email = await import("../src/lib/notify-channels/email");
  const webhook = await import("../src/lib/notify-channels/webhook");

  /* ---- toPlainText / images ---- */
  eq("plain text: CRLF -> LF, blank-line runs collapsed, trimmed", text.toPlainText("  a\r\n\r\n\r\n\r\nb  \r\n"), "a\n\nb");
  eq("plain text: literal < > in prose is NOT treated as HTML", text.toPlainText("buy if x<5 and y>3"), "buy if x<5 and y>3");
  eq("plain text: editor HTML -> paragraphs and a readable link", text.toPlainText('<p>Hello &amp; <b>bye</b></p><p>See <a href="https://x.io/a">this</a></p>'), "Hello & bye\n\nSee this (https://x.io/a)");
  eq("plain text: <script> dropped", text.toPlainText("<p>hi</p><script>alert(1)</script>"), "hi");
  eq("plain text: hard cap, no cut surrogate pair", text.toPlainText("😀".repeat(10), 5).length <= 5, true);
  eq("images: only our uploads and only pictures", text.imageUrlsFromAttachments([{ url: "/uploads/a.png", name: "a.png" }, { url: "https://evil.example/x.png", name: "x.png" }, { url: "/uploads/doc.pdf", name: "doc.pdf" }, { url: "https://fomo.spot/uploads/b.jpg", name: "b" }]), ["/uploads/a.png", "https://fomo.spot/uploads/b.jpg"]);
  eq("asset url: absolute, never locale-prefixed, foreign refused", [text.absoluteAsset("/uploads/a.png"), text.absoluteAsset("https://evil.example/a.png")], ["https://fomo.spot/uploads/a.png", null]);

  /* ---- splitting ---- */
  const para = (i: number) => `Paragraph ${i}: ${"AT&T <bonds> & stocks rose; the S&P gained 2.5%. ".repeat(6).trim()}`;
  const long = Array.from({ length: 28 }, (_, i) => para(i)).join("\n\n"); // ~ 9.5k chars
  const base = { title: "Anna <b>posted</b> & more", body: "Teaser", link: "/ideas/42", locale: "ru", author: "Anna <script>" };

  const parts = tg.buildTelegramMessages("555", { ...base, fullText: long });
  eq("telegram long: 3-4 messages", parts.length >= 3 && parts.length <= tg.TG_MAX_PARTS, true);
  eq("telegram long: no part over 4096 chars", parts.filter((p) => p.text.length > 4096).length, 0);
  eq("telegram long: HTML is well-formed in every part", parts.flatMap((p) => tgHtmlProblems(p.text)), []);
  eq("telegram long: link button only on the LAST part", parts.map((p) => Boolean(p.reply_markup)), parts.map((_, i) => i === parts.length - 1));
  eq("telegram long: button = «Открыть на сайте» -> absolute link", parts[parts.length - 1].reply_markup!.inline_keyboard[0][0], { text: "Открыть на сайте", url: "https://fomo.spot/ideas/42" });
  yes("telegram long: first part starts with the bold title, escaped", parts[0].text.startsWith("<b>Anna &lt;b&gt;posted&lt;/b&gt; &amp; more</b>\n"));
  yes("telegram long: author line italic + escaped", parts[0].text.includes("<i>Anna &lt;script&gt;</i>"));
  yes("telegram long: later parts carry (k/n) markers", parts.slice(1).every((p, i) => p.text.startsWith(`<i>(${i + 2}/${parts.length})</i>\n`)));
  const stripHead = (t: string, i: number) => (i === 0 ? t.replace(/^<b>[^\n]*\n(?:[^\n]+\n)*\n/, "") : t.replace(/^<i>\(\d+\/\d+\)<\/i>\n/, ""));
  const body = parts.map((p, i) => unesc(stripHead(p.text, i))).join("\n\n");
  yes("telegram long: nothing lost or duplicated (text round-trips, paragraphs intact)", body.replace(/\s+/g, " ").trim() === long.replace(/\s+/g, " ").trim());
  yes("telegram long: cuts fall on paragraph boundaries", parts.slice(0, -1).every((p) => /[.%]$/.test(unesc(p.text).trimEnd())));
  yes("telegram long: not truncated -> no «read on the site» line", !parts.some((p) => p.text.includes("читать полностью")));
  eq("telegram: preview off, HTML mode", [parts[0].parse_mode, parts[0].disable_web_page_preview], ["HTML", true]);

  const huge = Array.from({ length: 300 }, (_, i) => para(i)).join("\n\n"); // ~ 100k chars
  const cut = tg.buildTelegramMessages("555", { ...base, locale: "en", fullText: huge, suppressed: 2 });
  eq("telegram huge: capped at 4 messages", cut.length, tg.TG_MAX_PARTS);
  eq("telegram huge: each <= 4096 and well-formed", cut.flatMap((p) => (p.text.length > 4096 ? ["too long"] : tgHtmlProblems(p.text))), []);
  yes("telegram huge: ends with «read the full text on the site» + suppressed note", cut[3].text.includes("<i>… read the full text on the site</i>") && cut[3].text.includes("were not sent"));
  yes("telegram huge: button on the last part, English label", cut[3].reply_markup!.inline_keyboard[0][0].text === "Open on the site" && cut.slice(0, 3).every((p) => !p.reply_markup));

  const worst = tg.buildTelegramMessages("1", { ...base, fullText: "&<>".repeat(6000) }); // every char expands 4-5x
  eq("telegram escape-heavy text: still <= 4096 per part and well-formed", worst.flatMap((p) => (p.text.length > 4096 ? ["too long"] : tgHtmlProblems(p.text))), []);
  const noBoundary = tg.buildTelegramMessages("1", { ...base, fullText: "x".repeat(9000) });
  eq("telegram text without any boundary: hard-cut, still valid", noBoundary.flatMap((p) => (p.text.length > 4096 ? ["too long"] : tgHtmlProblems(p.text))), []);
  const emoji = tg.buildTelegramMessages("1", { ...base, fullText: "😀".repeat(5000) });
  yes("telegram emoji text: no lone surrogate at a cut", emoji.every((p) => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(p.text)));

  const short = tg.buildTelegramMessages("555", { ...base, fullText: "Short & sweet" });
  eq("telegram short full text: ONE message with the button", [short.length, Boolean(short[0].reply_markup), short[0].text], [1, true, "<b>Anna &lt;b&gt;posted&lt;/b&gt; &amp; more</b>\n<i>Anna &lt;script&gt;</i>\nTeaser\n\nShort &amp; sweet"]);
  const same = tg.buildTelegramMessages("555", { title: "Anna in «Room»", body: "hello wor…", locale: "ru", link: "/chat", fullText: "hello world, this is the whole message", author: "Anna" });
  eq("telegram: teaser that is a prefix of the full text is not repeated; author already in title is not repeated", same[0].text, "<b>Anna in «Room»</b>\n\nhello world, this is the whole message");
  eq("telegram: without fullText the old single teaser is unchanged", tg.buildTelegramMessages("1", { title: "T", body: "B", locale: "en", link: "/x" }).map((p) => p.text), ["<b>T</b>\nB"]);

  /* ---- Telegram send: order, photo, failures ---- */
  {
    const m = installFetch();
    try {
      const r = await tg.send({ id: "c", userId: "u", address: "555" }, { ...base, fullText: long, images: ["/uploads/a.png", "/uploads/b.png"] });
      const methods = m.calls.map((c) => c.url.split("/").pop());
      eq("telegram send: ok", r, { ok: true });
      eq("telegram send: parts in order, then one sendPhoto", methods, [...parts.map(() => "sendMessage"), "sendPhoto"]);
      eq("telegram send: texts are the built parts, in order", m.calls.slice(0, parts.length).map((c) => JSON.parse(c.init.body).text), parts.map((p) => p.text));
      const photo = JSON.parse(m.calls[m.calls.length - 1].init.body);
      eq("telegram photo: public absolute URL, escaped caption, silent", [photo.photo, photo.caption, photo.disable_notification], ["https://fomo.spot/uploads/a.png", "Anna &lt;b&gt;posted&lt;/b&gt; &amp; more (+1)", true]);
    } finally {
      m.restore();
    }
    const m2 = installFetch((url) => (url.endsWith("sendPhoto") ? { status: 400, json: { ok: false, error_code: 400, description: "wrong file identifier" } } : { json: { ok: true, result: {} } }));
    try {
      eq("telegram: a picture Telegram cannot fetch never fails the notification", (await tg.send({ id: "c", userId: "u", address: "555" }, { ...base, fullText: "short", images: ["/uploads/a.png"] })).ok, true);
    } finally {
      m2.restore();
    }
    const m3 = installFetch();
    try {
      await tg.send({ id: "c", userId: "u", address: "555" }, { ...base, fullText: "short", images: ["https://evil.example/x.png"] });
      eq("telegram: foreign image URL is never forwarded", m3.calls.map((c) => c.url.split("/").pop()), ["sendMessage"]);
      m3.calls.length = 0;
      await tg.send({ id: "c", userId: "u", address: "555" }, { ...base, images: ["/uploads/a.png"] });
      eq("telegram: no fullText (no access) -> no picture either", m3.calls.map((c) => c.url.split("/").pop()), ["sendMessage"]);
    } finally {
      m3.restore();
    }
    const m4 = installFetch(() => ({ status: 403, json: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } }));
    try {
      const blocked = await tg.send({ id: "c", userId: "u", address: "555" }, { ...base, fullText: long });
      eq("telegram long: blocked bot = permanent, stops after the first part", [blocked.ok, blocked.permanent, m4.calls.length], [false, true, 1]);
    } finally {
      m4.restore();
    }
  }

  /* ---- e-mail rendering ---- */
  {
    const evil = {
      title: 'Hi <img src=x onerror=alert(1)> "q"',
      author: '<script>alert("a")</script>',
      body: "teaser",
      fullText: 'Line1 <script>alert(1)</script> & "x"\njavascript:alert(1)\n\nSee https://example.com/a?b=1&c=2. and (https://x.io/y) <https://z.io/>\n\n<b>bold?</b>',
      images: ['/uploads/a"onerror="alert(1).png', "https://evil.example/x.png"],
      link: "https://fomo.spot/ideas/42",
      settingsUrl: "https://fomo.spot/profile?tab=notifications",
      locale: "ru",
      baseUrl: "https://fomo.spot",
    };
    const r = mailRender.renderNotificationEmail(evil);
    yes("email: no raw <script> / <img src=x> / <b> from user text", !/<script|<img src=x|<b>bold/i.test(r.html));
    yes("email: user markup shows up escaped", r.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && r.html.includes("&lt;img src=x onerror=alert(1)&gt;") && r.html.includes("&lt;b&gt;bold?&lt;/b&gt;"));
    yes("email: quotes escaped inside the attribute-bearing image URL", !/src="[^"]*"onerror/.test(r.html) && r.html.includes("&quot;onerror=&quot;"));
    yes("email: foreign image dropped", !r.html.includes("evil.example"));
    yes("email: URL in the text becomes a link, trailing period/paren stay outside", r.html.includes('<a href="https://example.com/a?b=1&amp;c=2" style="color:#16a34a;word-break:break-all;">https://example.com/a?b=1&amp;c=2</a>.') && r.html.includes('href="https://x.io/y"'));
    yes("email: javascript: is never a link", !/href="javascript/i.test(r.html) && r.html.includes("javascript:alert(1)"));
    yes("email: paragraphs and line breaks", r.html.includes("<br>") && (r.html.match(/<p style=/g) ?? []).length >= 4);
    yes("email: button «Открыть на сайте» to the item", r.html.includes(">Открыть на сайте</a>") && r.html.includes('href="https://fomo.spot/ideas/42"'));
    yes("email: settings link «Настройки уведомлений»", r.html.includes('href="https://fomo.spot/profile?tab=notifications"') && r.html.includes("Настройки уведомлений"));
    yes("email: viewport meta (responsive) and fluid width", r.html.includes('name="viewport"') && r.html.includes("max-width:600px") && r.html.includes('width="100%"'));
    yes("email: subject is the short title, single line", r.subject.length <= 120 && !/[\r\n]/.test(r.subject));
    yes("email: plain-text alternative has title, text, link and settings", r.text.includes("Line1 <script>alert(1)</script> & \"x\"") && r.text.includes("https://fomo.spot/ideas/42") && r.text.includes("tab=notifications") && !r.text.includes("<table"));
    yes("email: teaser shown only when it is not the start of the full text", r.html.includes(">teaser<"));

    const big = mailRender.renderNotificationEmail({ ...evil, fullText: "&<>\"'\n\n".repeat(60_000) });
    yes(`email: huge text -> html <= 100 KB (got ${big.html.length})`, big.html.length <= mailRender.MAX_EMAIL_HTML);
    yes("email: cut text says «читать полностью на сайте»", big.html.includes("читать полностью на сайте") && big.text.includes("читать полностью на сайте"));
    const plain = mailRender.renderNotificationEmail({ ...evil, fullText: "short" });
    yes("email: short text is not marked as cut", !plain.html.includes("читать полностью"));
    const teaserOnly = mailRender.renderNotificationEmail({ ...evil, fullText: undefined });
    yes("email: no fullText (no access) -> only the teaser, no images", teaserOnly.html.includes(">teaser<") && !teaserOnly.html.includes("<img src=") && !teaserOnly.html.includes("Line1"));

    const m = installFetch();
    try {
      const sent = await email.send({ id: "c", userId: "u", address: "a@b.co" }, { title: "Anna in room", body: "hi…", link: "/chat?room=1", locale: "en", fullText: "hi there <b>all</b>", author: "Anna" });
      const payload = JSON.parse(m.calls[0].init.body);
      eq("email send: ok, Resend gets html + text + List-Unsubscribe", [sent.ok, typeof payload.html, typeof payload.text, payload.headers["List-Unsubscribe"]], [true, "string", "string", "<https://fomo.spot/en/profile?tab=notifications>"]);
      yes("email send: localized item + settings links, escaped text", payload.html.includes("https://fomo.spot/en/chat?room=1") && payload.html.includes("hi there &lt;b&gt;all&lt;/b&gt;") && payload.html.includes("Open on the site"));
    } finally {
      m.restore();
    }
  }

  /* ---- MAX / VK plain text ---- */
  {
    const one = types.plainText({ title: "T", body: "b", link: "/x", locale: "en", fullText: "Full body text", author: "Al" }, 3800);
    eq("plain text channels: title, author, full text, link", one, "T\nAl\nb\n\nFull body text\n\nhttps://fomo.spot/en/x");
    const clipped = types.plainText({ title: "T", link: "/x", locale: "en", fullText: "w ".repeat(5000), suppressed: 1 }, 3800);
    yes("plain text channels: clipped to the limit, link and note kept, «read on the site» added", clipped.length <= 3800 && clipped.includes("https://fomo.spot/en/x") && clipped.includes("read the full text on the site") && clipped.includes("1 more"));
    eq("plain text channels: without fullText unchanged", types.plainText({ title: "T", body: "b", link: "/x", locale: "en" }), "T\nb\nhttps://fomo.spot/en/x");
  }

  /* ---- webhook ---- */
  {
    const w = webhook.buildWebhookBody({ title: "T", body: "b", link: "/x", locale: "en", fullText: "FULL & <text>", author: "Al", images: ["/uploads/a.png", "https://evil.example/a.png"] }, 1_800_000_000_000);
    eq("webhook: additive fullText / author / images", [w.fullText, w.author, w.images, w.body, w.text.includes("FULL")], ["FULL & <text>", "Al", ["https://fomo.spot/uploads/a.png"], "b", false]);
    const t = webhook.buildWebhookBody({ title: "T", body: "b", link: "/x", locale: "en" });
    eq("webhook: no access -> empty fullText, no images", [t.fullText, t.author, t.images], ["", null, []]);
  }

  /* ---- ACCESS: the gate + end to end through the real dispatcher with a fake DB ---- */
  const dispatch = await import("../src/lib/notify-dispatch");
  const b = { title: "t", body: "teaser", link: "/x", locale: "ru" };
  eq("gate: allowed recipient gets the full text", dispatch.withFullContent(b, { fullText: "FULL", fullTextFor: ["a"], author: "Al" }, "a"), { ...b, fullText: "FULL", author: "Al" });
  eq("gate: recipient outside fullTextFor keeps the teaser", dispatch.withFullContent(b, { fullText: "FULL", fullTextFor: ["a"] }, "z"), b);
  eq("gate: EMPTY allow-list = nobody", dispatch.withFullContent(b, { fullText: "FULL", fullTextFor: [] }, "a"), b);
  eq("gate: no allow-list = every recipient (public content)", dispatch.withFullContent(b, { fullText: "FULL" }, "z"), { ...b, fullText: "FULL" });
  eq("gate: nothing to add without fullText", dispatch.withFullContent(b, { images: ["/uploads/a.png"], fullTextFor: ["a"] }, "a"), b);

  type Row = Record<string, any>;
  const channels: Row[] = [];
  const users: Row[] = [];
  const follows: Row[] = [];
  const subscriptions: Row[] = [];
  const fake = {
    notificationChannel: {
      findMany: async (a: any) => channels.filter((c) => a.where.userId.in.includes(c.userId)),
      update: async () => ({}),
    },
    notificationPref: { findMany: async () => [] },
    notificationSetting: { findMany: async () => [] },
    user: { findMany: async (a: any) => users.filter((u) => a.where.id.in.includes(u.id)) },
    notification: { createManyAndReturn: async (a: any) => a.data.map((d: Row, i: number) => ({ id: `n${i}`, isRead: false, createdAt: new Date(), body: null, link: null, ...d })) },
    follow: { findMany: async (a: any) => follows.filter((f) => f.authorId === a.where.authorId) },
    subscription: {
      findMany: async (a: any) =>
        subscriptions.filter(
          (s) => s.status === "active" && s.endDate > new Date() && (!a.where.authorId || s.authorId === a.where.authorId) && (!a.where.tariffId || s.tariffId === a.where.tariffId) && (!a.where.subscriber || true) &&
            (!a.where.subscriberId?.in || a.where.subscriberId.in.includes(s.subscriberId)) && !(a.where.subscriberId?.notIn ?? []).includes(s.subscriberId)
        ),
    },
    pushSubscription: { findMany: async () => [] },
  };
  (globalThis as any).prisma = fake;
  // Prisma is already imported by the dispatcher: patch the model delegates in place.
  const { prisma } = await import("../src/lib/prisma");
  for (const [k, v] of Object.entries(fake)) {
    try {
      Object.defineProperty(prisma, k, { value: v, configurable: true, writable: true });
    } catch {
      (prisma as any)[k] = v;
    }
  }
  const usingFake = (prisma as any).notification === fake.notification;
  yes("e2e: fake Prisma installed", usingFake);

  if (usingFake) {
    const notifications = await import("../src/lib/notifications");
    for (const id of ["a", "b", "c"]) {
      users.push({ id, locale: "ru" });
      channels.push({ id: `tg-${id}`, userId: id, channel: "telegram", address: `chat-${id}`, verified: true, enabled: true, secret: null, failCount: 0, lastError: null, lastSentAt: new Date() });
      channels.push({ id: `em-${id}`, userId: id, channel: "email", address: `${id}@x.io`, verified: true, enabled: true, secret: null, failCount: 0, lastError: null, lastSentAt: new Date() });
      follows.push({ authorId: "author", followerId: id });
    }
    subscriptions.push({ subscriberId: "a", authorId: "author", tariffId: null, status: "active", endDate: new Date(Date.now() + 86_400_000) });
    subscriptions.push({ subscriberId: "b", authorId: "author", tariffId: null, status: "active", endDate: new Date(Date.now() - 86_400_000) }); // expired
    const SECRET = "PAID-SETUP-BODY-7731";

    async function run(fn: () => Promise<unknown>, expect: number) {
      const m = installFetch();
      try {
        await fn();
        for (let i = 0; i < 100 && m.calls.length < expect; i++) await new Promise((r) => setTimeout(r, 20));
        await new Promise((r) => setTimeout(r, 60));
        return m.calls;
      } finally {
        m.restore();
      }
    }
    const who = (calls: Call[]) => {
      const out: Record<string, string> = {};
      for (const c of calls) {
        const b = JSON.parse(c.init.body);
        if (c.url.includes("/sendMessage")) out[`tg-${b.chat_id}`] = b.text;
        else if (c.url.includes("resend")) out[`em-${b.to[0][0]}`] = b.html + "\n" + b.text;
      }
      return out;
    };

    // paid single idea: followers a (active subscription), b (expired), c (never subscribed)
    const paid = await run(
      () => notifications.notifyFollowers("author", "new_idea", "Author published", "Idea title", "/ideas/9", { fullText: SECRET, author: "Author", paywalled: true }),
      6
    );
    const w = who(paid);
    eq("paywall: the subscriber gets the full text in Telegram AND e-mail", [w["tg-chat-a"]?.includes(SECRET), w["em-a"]?.includes(SECRET)], [true, true]);
    eq("paywall: expired subscriber and non-subscriber get the teaser only (Telegram + e-mail)", [w["tg-chat-b"]?.includes(SECRET), w["em-b"]?.includes(SECRET), w["tg-chat-c"]?.includes(SECRET), w["em-c"]?.includes(SECRET)], [false, false, false, false]);
    eq("paywall: they still get the teaser notification", [w["tg-chat-b"]?.includes("Idea title"), w["em-c"]?.includes("Idea title")], [true, true]);

    // free idea: everybody
    const free = await run(() => notifications.notifyFollowers("author", "new_idea", "Author published", "Idea title", "/ideas/9", { fullText: SECRET + "-FREE", author: "Author", paywalled: false }), 6);
    const wf = who(free);
    eq("free idea: every follower gets the full text", ["tg-chat-a", "tg-chat-b", "tg-chat-c", "em-a", "em-b", "em-c"].map((k) => wf[k]?.includes(SECRET + "-FREE")), [true, true, true, true, true, true]);

    // channel post: recipients are the channel's active subscribers only
    subscriptions.push({ subscriberId: "a", authorId: "author", tariffId: "T1", status: "active", endDate: new Date(Date.now() + 86_400_000) });
    const ch = await run(() => notifications.notifyChannelSubscribers("T1", ["author"], "Channel post", "Idea title", "/ideas/10", "channel_post", { fullText: SECRET }), 2);
    const wc = who(ch);
    eq("channel post: only subscribers are notified, with the full text", [Object.keys(wc).sort(), wc["tg-chat-a"]?.includes(SECRET)], [["em-a", "tg-chat-a"], true]);

    // without `full` nothing changes: the old short messages
    const old = await run(() => notifications.createNotification({ userId: "c", type: "new_message", title: "Anna wrote", body: "short", link: "/messages" }), 2);
    const wo = who(old);
    eq("no full content: classic teaser (bold title + body), no button change", wo["tg-chat-c"], "<b>Anna wrote</b>\nshort");

    // direct message: the full text goes to its recipient
    const dm = await run(() => notifications.createNotification({ userId: "c", type: "new_message", title: "Anna wrote", body: "long mess…", link: "/messages", full: { fullText: "long message " + SECRET, author: "Anna" } }), 2);
    const wd = who(dm);
    eq("DM: full text to its recipient only", [Object.keys(wd).sort(), wd["tg-chat-c"]?.includes(SECRET)], [["em-c", "tg-chat-c"], true]);

    // rate limit / dedupe unchanged: the same full message twice within 30 s -> sent once; a different full text with the same teaser -> sent
    const mk = (t: string) => notifications.createNotification({ userId: "a", type: "new_message", title: "Bob wrote", body: "same teaser…", link: "/messages", full: { fullText: t } });
    const first = await run(() => mk("full one"), 2);
    const dup = await run(() => mk("full one"), 1);
    const other = await run(() => mk("full two"), 2);
    eq("anti-spam: identical message deduped, a different full text with the same teaser is not", [first.length, dup.length, other.length], [2, 0, 2]);
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
