/* Forwarding of a paid channel's posts to a subscriber's Telegram (Subscription.telegramNotify, «Получать в Telegram»):
   who gets the post, through which bot connection (old TelegramAccount OR the bot from Notification settings), renewal keeps the
   switch, markup-unsafe titles are escaped, long text is cut with a link, failures are visible. Fake prisma + stubbed fetch.
   Run: npx tsx scripts/check-telegram-channel-notify.ts   (exit code 1 on a failed assertion) */

export {}; // a module, so its names do not clash with the other check scripts

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const truth = (name: string, v: boolean) => eq(name, v, true);

/* ---------- fake database ---------- */
type Row = Record<string, any>;
const NOW = Date.now();
const DAY = 86_400_000;
const db = {
  tariffs: [] as Row[],
  subs: [] as Row[],
  accounts: [] as Row[],
  channels: [] as Row[],
  prefs: [] as Row[],
  users: [] as Row[],
};
const match = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([k, v]) => {
    const x = row[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("in" in v) return (v.in as unknown[]).includes(x);
      if ("gt" in v) return x > v.gt;
      if ("not" in v) return v.not === null ? x !== null && x !== undefined : x !== v.not;
      return true;
    }
    return x === v;
  });
const fakePrisma: any = {
  subscriptionTariff: {
    findUnique: async ({ where, select }: any) => {
      const t = db.tariffs.find((r) => r.id === where.id);
      if (!t) return null;
      return { authorId: t.authorId, authorTelegramNotify: t.authorTelegramNotify, subscriptions: db.subs.filter((s) => s.tariffId === t.id && match(s, select.subscriptions.where)).map((s) => ({ subscriberId: s.subscriberId })) };
    },
  },
  subscription: {
    findFirst: async ({ where }: any) => db.subs.filter((s) => match(s, where)).sort((a, b) => +b.endDate - +a.endDate)[0] ?? null,
    updateMany: async ({ where, data }: any) => {
      const rows = db.subs.filter((s) => match(s, where) && (where.endDate === undefined || +s.endDate === +where.endDate));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    findUniqueOrThrow: async ({ where }: any) => db.subs.find((s) => s.id === where.id)!,
    create: async ({ data }: any) => {
      const r = { id: `s${db.subs.length + 1}`, telegramNotify: false, status: "active", ...data };
      db.subs.push(r);
      return r;
    },
  },
  telegramAccount: {
    findMany: async ({ where }: any) => db.accounts.filter((a) => match(a, where)),
    update: async ({ where, data }: any) => void Object.assign(db.accounts.find((a) => a.userId === where.userId) ?? {}, data),
    updateMany: async ({ where, data }: any) => void db.accounts.filter((a) => match(a, where)).forEach((a) => Object.assign(a, data)),
  },
  notificationChannel: {
    findMany: async ({ where }: any) => db.channels.filter((c) => match(c, where)),
    update: async ({ where, data }: any) => void Object.assign(db.channels.find((c) => c.userId === where.userId_channel.userId) ?? {}, data),
    updateMany: async ({ where, data }: any) => void db.channels.filter((c) => match(c, where)).forEach((c) => Object.assign(c, data)),
  },
  notificationPref: { findMany: async ({ where }: any) => db.prefs.filter((p) => match(p, where)) },
  user: { findMany: async ({ where }: any) => db.users.filter((u) => match(u, where)) },
};
(globalThis as any).prisma = fakePrisma;

/* ---------- stubbed Telegram ---------- */
interface Call { token: string; method: string; body: any }
let calls: Call[] = [];
let reply: (c: Call) => any = () => ({ ok: true, result: {} });
(globalThis as any).fetch = async (url: string, init: any) => {
  const m = /\/bot([^/]+)\/(\w+)$/.exec(String(url))!;
  const c: Call = { token: m[1], method: m[2], body: JSON.parse(init.body) };
  calls.push(c);
  return { json: async () => reply(c) };
};
const warns: string[] = [];
console.warn = (...a: unknown[]) => void warns.push(a.map(String).join(" "));

function reset() {
  db.tariffs = [{ id: "t1", authorId: "owner", authorTelegramNotify: false }, { id: "t2", authorId: "owner", authorTelegramNotify: false }];
  db.subs = [];
  db.accounts = [];
  db.channels = [];
  db.prefs = [];
  db.users = ["u1", "u2", "u3", "u4", "u5", "u6", "owner"].map((id) => ({ id, locale: "ru" }));
  calls = [];
  warns.length = 0;
  reply = () => ({ ok: true, result: {} });
}
const sub = (subscriberId: string, over: Row = {}) => ({ id: `s-${subscriberId}-${db.subs.length}`, subscriberId, authorId: "owner", tariffId: "t1", status: "active", endDate: new Date(NOW + 10 * DAY), telegramNotify: true, ...over });
const ownBot = (userId: string, token: string, chat: string) => ({ id: `c-${userId}`, userId, channel: "telegram", address: chat, secret: token, verified: true, enabled: true, lastError: null });
const oldAccount = (userId: string, token: string, chat: string) => ({ userId, botToken: token, chatId: chat, lastError: null });
const sentTo = () => calls.filter((c) => c.method === "sendMessage").map((c) => c.body.chat_id);
const SAFE_TAG = /<\/?(b|i)>/g;
const markupOk = (html: string) => !html.replace(SAFE_TAG, "").replace(/&(amp|lt|gt);/g, "").match(/[<>&]/);

async function main() {
  const { notifyChannelTelegramSubscribers } = await import("../src/lib/telegram");
  const { resolveTelegramTargets, hasTelegramTarget } = await import("../src/lib/telegram-target");
  const { extendSubscription } = await import("../src/lib/subscriptions");

  const text = { key: "notif.tg.newSetup", vars: { title: "T", preview: "P", url: "https://fomo.spot/ideas/1" } };
  const rich = (title: string, fullText: string) => ({ title: { key: "notif.tg.newSetupHead", vars: { title } }, author: "Автор", fullText, link: "/ideas/1" });

  /* ---- 1. the reported case: the bot was connected in Notification settings (NO TelegramAccount) ---- */
  reset();
  db.subs = [sub("u1")];
  db.channels = [ownBot("u1", "111:AAA", "5001")];
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Setup", "Body") });
  eq("1. subscriber who connected his bot in Notification settings (no TelegramAccount) gets the post", sentTo(), ["5001"]);
  eq("1. via his own bot token", calls[0]?.token, "111:AAA");

  /* ---- 2. old TelegramAccount still works ---- */
  reset();
  db.subs = [sub("u1")];
  db.accounts = [oldAccount("u1", "222:BBB", "5002")];
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Setup", "Body") });
  eq("2. old TelegramAccount subscriber gets the post", [sentTo(), calls[0]?.token], [["5002"], "222:BBB"]);

  /* ---- 3. who does NOT get it ---- */
  reset();
  db.subs = [
    sub("u1"),
    sub("u2", { status: "expired" }),
    sub("u3", { endDate: new Date(NOW - DAY) }),
    sub("u4", { tariffId: "t2" }),
    sub("u5", { telegramNotify: false }),
    sub("u6"),
  ];
  db.channels = ["u1", "u2", "u3", "u4", "u5"].map((u, i) => ownBot(u, `${i}:T`, `60${i}`));
  // u6 has the switch on but no bot at all
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Setup", "Body") });
  eq("3. only the active subscriber of THIS channel with the switch on and a bot", sentTo(), ["600"]);
  eq("3. nothing is logged as a failure for the skipped ones", warns.length, 0);

  /* ---- 4. a disabled / unverified bot connection is not a target ---- */
  reset();
  db.channels = [{ ...ownBot("u1", "1:A", "1"), enabled: false }, { ...ownBot("u2", "2:A", "2"), verified: false }, { ...ownBot("u3", "3:A", "3"), secret: null }];
  eq("4. disabled / unverified / no-token(no site bot) -> no target", [...(await resolveTelegramTargets(fakePrisma, ["u1", "u2", "u3"], undefined)).keys()], []);
  eq("4. site bot row (no secret) uses the env token", (await resolveTelegramTargets(fakePrisma, ["u3"], "9:SITE")).get("u3")?.botToken, "9:SITE");
  truth("4. hasTelegramTarget: connected user", await hasTelegramTarget(fakePrisma, "u1", undefined) === false && (db.channels[0].enabled = true) && (await hasTelegramTarget(fakePrisma, "u1", undefined)));

  /* ---- 5. renewal keeps the switch (and the expire sweep / re-pay reuses the same row) ---- */
  reset();
  db.subs = [sub("u1", { status: "expired", endDate: new Date(NOW - 2 * DAY), tariffId: "t1" })];
  db.channels = [ownBot("u1", "111:AAA", "5001")];
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Setup", "Body") });
  eq("5. while expired: no post", sentTo(), []);
  const r = await extendSubscription({ subscriberId: "u1", authorId: "owner", tariffId: "t1", monthlyPrice: 100, durationDays: 30 });
  eq("5. renewal of an expired row: same row, active again, switch still on", [db.subs.length, r.subscription.status, r.subscription.telegramNotify], [1, "active", true]);
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Setup", "Body") });
  eq("5. after the renewal the post arrives", sentTo(), ["5001"]);
  const r2 = await extendSubscription({ subscriberId: "u1", authorId: "owner", tariffId: "t1", monthlyPrice: 100, durationDays: 30 });
  eq("5. renewal in advance keeps the switch too", [db.subs.length, r2.renewed, r2.subscription.telegramNotify], [1, true, true]);

  /* ---- 6. Telegram-markup-unsafe titles / texts ---- */
  reset();
  db.subs = [sub("u1")];
  db.channels = [ownBot("u1", "111:AAA", "5001")];
  const evil = 'EUR/USD <b>long</b> & "stop" <script>x</script> a<b';
  await notifyChannelTelegramSubscribers("t1", { key: "notif.tg.newSetup", vars: { title: evil, preview: evil, url: "https://fomo.spot/ideas/1" } }, { rich: rich(evil, `${evil}\n\n${evil}`) });
  truth("6. rich post: every message is valid HTML (only our own <b>/<i>, everything else escaped)", calls.filter((c) => c.method === "sendMessage").every((c) => markupOk(c.body.text)));
  truth("6. rich post: the title text survives escaped", calls[0].body.text.includes("&lt;script&gt;x&lt;/script&gt;") && calls[0].body.text.includes("a&lt;b"));
  calls = [];
  await notifyChannelTelegramSubscribers("t1", { key: "notif.tg.newSetup", vars: { title: evil, preview: evil, url: "https://fomo.spot/ideas/1" } });
  truth("6. teaser: every var escaped, template <b> kept", calls.length === 1 && markupOk(calls[0].body.text) && calls[0].body.text.startsWith("🔔 Новый сетап: <b>EUR/USD &lt;b&gt;long"));
  calls = [];
  await notifyChannelTelegramSubscribers("t1", "<b>ready</b> &amp; escaped by the caller");
  eq("6. plain string is sent as given (the caller escaped it)", calls[0]?.body.text, "<b>ready</b> &amp; escaped by the caller");

  /* ---- 7. long text: cut, with the link ---- */
  reset();
  db.subs = [sub("u1")];
  db.channels = [ownBot("u1", "111:AAA", "5001")];
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Long", ("Абзац <1> & текст. ".repeat(40) + "\n\n").repeat(60)) });
  const msgs = calls.filter((c) => c.method === "sendMessage");
  truth("7. rich: several messages, each <= 4096, at most 4", msgs.length > 1 && msgs.length <= 4 && msgs.every((c) => c.body.text.length <= 4096));
  truth("7. rich: valid markup in every part", msgs.every((c) => markupOk(c.body.text)));
  const last = msgs[msgs.length - 1].body;
  truth("7. rich: the last part has the «open on the site» button with an absolute link", /^https?:\/\/.+\/ideas\/1/.test(last.reply_markup?.inline_keyboard?.[0]?.[0]?.url ?? ""));
  calls = [];
  await notifyChannelTelegramSubscribers("t1", { key: "notif.tg.newSetup", vars: { title: "T", preview: "Ж".repeat(9000), url: "https://fomo.spot/ideas/1" } });
  truth("7. teaser with a 9000-char preview fits Telegram's limit and keeps the link", calls.length === 1 && calls[0].body.text.length <= 4096 && calls[0].body.text.includes("https://fomo.spot/ideas/1"));
  calls = [];
  await notifyChannelTelegramSubscribers("t1", "x".repeat(6000));
  truth("7. a 6000-char plain string is cut to a valid message", calls.length === 1 && calls[0].body.text.length <= 4096 && calls[0].body.parse_mode === undefined);

  /* ---- 8. no duplicate with the preference-aware dispatcher ---- */
  reset();
  db.subs = [sub("u1"), sub("u2"), sub("u3"), sub("u4")];
  db.channels = [ownBot("u1", "111:AAA", "5001"), ownBot("u2", "222:BBB", "5002"), ownBot("u3", "333:CCC", "5003")];
  db.accounts = [oldAccount("u2", "222:BBB", "5002"), oldAccount("u3", "OTHER:BOT", "5999"), oldAccount("u4", "444:DDD", "5004")];
  db.prefs = [];
  await notifyChannelTelegramSubscribers("t1", text, { dedupeEvent: "new_post_in_subscribed_channel", rich: rich("Setup", "Body") });
  eq("8. covered by the dispatcher (u1 settings-bot, u2 same bot as old account) -> no second copy; u3 (different old bot) and u4 (old account only) get theirs", sentTo().sort(), ["5004", "5999"]);
  reset();
  db.subs = [sub("u1")];
  db.channels = [ownBot("u1", "111:AAA", "5001")];
  db.prefs = [{ userId: "u1", event: "new_post_in_subscribed_channel", channel: "telegram", enabled: false }];
  await notifyChannelTelegramSubscribers("t1", text, { dedupeEvent: "new_post_in_subscribed_channel", rich: rich("Setup", "Body") });
  eq("8. Telegram switched off for the event in the matrix, but the channel switch is on -> the dispatcher skips him, so the forward is sent", sentTo(), ["5001"]);

  /* ---- 9. the owner's own copy ---- */
  reset();
  db.tariffs[0].authorTelegramNotify = true;
  db.channels = [ownBot("owner", "777:OWN", "7000")];
  await notifyChannelTelegramSubscribers("t1", text, { dedupeEvent: "new_post_in_subscribed_channel", rich: rich("Setup", "Body") });
  eq("9. owner with the switch on gets a copy even with dedupe (not a dispatcher recipient of his own post)", sentTo(), ["7000"]);

  /* ---- 10. failures are visible, never kill the others, never print the token ---- */
  reset();
  db.subs = [sub("u1"), sub("u2")];
  db.channels = [ownBot("u1", "111:SECRETTOKEN", "5001"), ownBot("u2", "222:BBB", "5002")];
  reply = (c) => (c.token === "111:SECRETTOKEN" ? { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } : { ok: true, result: {} });
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Setup", "Body") });
  eq("10. one dead bot does not stop the other subscriber", sentTo().sort(), ["5001", "5002"]);
  truth("10. the failure is logged (one line, reason from Telegram)", warns.length === 1 && warns[0].includes("Forbidden: bot was blocked") && warns[0].includes("u1"));
  truth("10. no token in the log", !warns.join("\n").includes("SECRETTOKEN"));
  eq("10. the reason is stored on the row the user sees", db.channels[0].lastError, "Forbidden: bot was blocked by the user");
  reply = () => ({ ok: true, result: {} });
  await notifyChannelTelegramSubscribers("t1", text, { rich: rich("Setup", "Body") });
  eq("10. a later success clears the stored error", db.channels[0].lastError, null);
  (globalThis as any).fetch = async (url: string) => {
    throw new Error(`fetch failed for ${url}`); // a failed fetch names the URL, and the token sits in it
  };
  db.channels[1].secret = "222:SECRETTOKEN";
  warns.length = 0;
  await notifyChannelTelegramSubscribers("t1", text);
  truth("10. a network error is logged without the token", warns.length >= 1 && !warns.join("\n").includes("SECRETTOKEN"));

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
