/* Check of the chart-state account sync (src/lib/chart/sync-logic.ts pure rules, src/lib/chart/account-sync.ts channels).
   OFFLINE: localStorage, window/document and fetch are replaced by stubs; the "server" is an in-memory copy of /api/terminal/userdata
   (it keeps JSON like jsonb: keys come back sorted, 401 for a guest, uid in every GET answer). Run:  npx tsx scripts/check-chart-sync.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
let passes = 0;
function ok(cond: boolean, name: string, note = "") {
  if (cond) passes++;
  else fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}
const eq = (a: unknown, b: unknown, name: string) => ok(JSON.stringify(a) === JSON.stringify(b), name, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────── environment stubs ───────────── */

type Store = Map<string, string>;
const devices: Record<string, Store> = { pc: new Map(), phone: new Map() };
let store: Store = devices.pc;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
} as unknown as Storage;

const winL: Record<string, (() => void)[]> = {};
const docL: Record<string, (() => void)[]> = {};
(globalThis as unknown as { window: unknown }).window = { addEventListener: (t: string, f: () => void) => (winL[t] ||= []).push(f) };
const doc = { visibilityState: "visible", addEventListener: (t: string, f: () => void) => (docL[t] ||= []).push(f) };
(globalThis as unknown as { document: unknown }).document = doc;

/** The account database: user -> "kind|key" -> data (stored the jsonb way: object keys sorted). */
const db: Record<string, Map<string, unknown>> = { u1: new Map(), u2: new Map() };
let sessionUser: string | null = "u1";
const log: { method: string; kind?: string; key?: string; keepalive?: boolean; status: number }[] = [];
let putStatus = 0; // forced answer for PUT (0 = normal)
const sortKeys = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v);

(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init?: { method?: string; body?: string; keepalive?: boolean }) => {
  const method = init?.method ?? "GET";
  const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  if (!sessionUser) {
    log.push({ method, status: 401 });
    return res(401, { error: "Unauthorized" });
  }
  const mem = db[sessionUser];
  if (method === "GET") {
    const u = new URL(url, "http://x");
    const kind = u.searchParams.get("kind") as string;
    const key = u.searchParams.get("key") as string;
    const v = mem.get(`${kind}|${key}`);
    log.push({ method, kind, key, status: 200 });
    return res(200, { items: v === undefined ? [] : [{ key, data: v, updatedAt: "2026-01-01T00:00:00Z" }], uid: sessionUser });
  }
  const b = JSON.parse(init?.body ?? "{}") as { kind: string; key: string; data: unknown };
  if (putStatus) {
    log.push({ method, kind: b.kind, key: b.key, status: putStatus });
    return res(putStatus, { error: "x" });
  }
  mem.set(`${b.kind}|${b.key}`, sortKeys(b.data));
  log.push({ method, kind: b.kind, key: b.key, keepalive: init?.keepalive, status: 200 });
  return res(200, { ok: true });
};

async function main() {
  const L = await import("../src/lib/chart/sync-logic");
  const S = await import("../src/lib/chart/account-sync");
  S.timing.debounce = 40;
  S.timing.gap = 25;
  S.timing.recheck = 150;
  S.timing.guestFor = 400;

  /* ───────────── pure rules ───────────── */
  console.log("-- decide()");
  const loc = (at: number, empty = false, exists = true) => ({ exists, at, empty });
  eq(L.decide(loc(0, false, false), null, false), "none", "nothing here, nothing there: nothing");
  eq(L.decide(loc(500), null, false), "push", "no account copy, local state: push");
  eq(L.decide(loc(0, true), null, false), "none", "no account copy, legacy empty local: nothing");
  eq(L.decide(loc(500, true), null, false), "push", "no account copy, stamped empty local (user cleared it): push");
  eq(L.decide(loc(0, false, false), { at: 100, empty: false }, false), "pull", "nothing local: take the account copy");
  eq(L.decide(loc(100), { at: 200, empty: false }, false), "pull", "account newer: pull");
  eq(L.decide(loc(300), { at: 200, empty: false }, false), "push", "local newer: push");
  eq(L.decide(loc(300, true), { at: 200, empty: false }, false), "push", "local newer and empty (deliberate clear): push");
  eq(L.decide(loc(100), { at: 200, empty: true }, false), "pull", "account newer and empty (cleared elsewhere): pull");
  eq(L.decide(loc(0), { at: 200, empty: false }, false), "pull", "legacy local (no at) loses to a stamped copy");
  eq(L.decide(loc(0), { at: 200, empty: true }, false), "push", "legacy non-empty local is never replaced by an empty account copy");
  eq(L.decide(loc(0, true), { at: 200, empty: true }, false), "pull", "legacy empty vs empty account copy: pull (harmless)");
  eq(L.decide(loc(200, true), { at: 200, empty: false }, false), "pull", "tie: empty local, non-empty account: pull");
  eq(L.decide(loc(200), { at: 200, empty: true }, false), "push", "tie: non-empty local never wiped by an empty account copy");
  eq(L.decide(loc(200), { at: 200, empty: false }, false), "none", "tie, both non-empty and different: stay as they are");
  eq(L.decide(loc(100), { at: 900, empty: false }, true), "none", "same content: nothing, whoever is newer");
  eq(L.decide(loc(0), { at: 0, empty: false }, false), "none", "both unstamped and different: stay");

  console.log("-- envelope / compare");
  const env = L.packRemote(123, '{"v":1,"drawings":[{"id":"a"}]}');
  eq(env, { v: 1, at: 123, data: { v: 1, drawings: [{ id: "a" }] } }, "packRemote wraps the payload");
  eq(L.packRemote(1, "not json"), null, "packRemote refuses a non-JSON payload");
  eq(L.parseRemote(env), { at: 123, json: '{"v":1,"drawings":[{"id":"a"}]}' }, "parseRemote unwraps it");
  eq(L.parseRemote({ data: [1] })?.at, 0, "parseRemote: a missing at counts as 0");
  eq(L.parseRemote({ at: "x", data: [1] })?.at, 0, "parseRemote: a garbage at counts as 0");
  eq(L.parseRemote({ at: 5 }), null, "parseRemote: no payload is ignored");
  eq(L.parseRemote(null), null, "parseRemote: null is ignored");
  eq(L.parseRemote([1, 2]), null, "parseRemote: an array is ignored");
  ok(L.canonJson('{"b":1,"a":{"d":2,"c":[3,{"z":1,"y":2}]}}') === L.canonJson('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}'), "canonJson ignores key order (jsonb)");
  ok(L.canonJson("[1,2]") !== L.canonJson("[2,1]"), "canonJson keeps array order");
  eq(L.isForeign(undefined, "u1"), false, "legacy local copy is not foreign");
  eq(L.isForeign("u1", "u1"), false, "own local copy is not foreign");
  eq(L.isForeign("u1", "u2"), true, "another account's local copy is foreign");
  eq(L.recheckDue(100_000, 50_000), false, "re-check throttled inside a minute");
  eq(L.recheckDue(120_000, 50_000), true, "re-check allowed after a minute");

  console.log("-- keys");
  eq(L.paneKey(undefined), "main", "main chart -> main");
  eq(L.paneKey("p2"), "p2", "multi-chart pane -> its storageId");
  eq(L.paneKey("bad key!"), null, "unsafe pane id: not synced");
  eq(L.drawingsKey("moex", "SBER"), "moex:SBER", "drawings key = source:ticker");
  eq(L.drawingsKey("bybit", "BTCUSDT"), "bybit:BTCUSDT", "drawings key (crypto)");
  eq(L.drawingsKey("moex", "A".repeat(200)), null, "a key over 110 chars is not synced");
  eq(L.drawingsKey("moex", "A B"), null, "a ticker with a space is not synced");
  ok(`${"x".repeat(7)}:${"A".repeat(110 - 8)}`.length <= 120, "keys stay within the route's 120 chars");

  console.log("-- size caps");
  const mk = (n: number, pad = 0) => JSON.stringify({ v: 1, drawings: Array.from({ length: n }, (_, i) => ({ id: "d" + i, pad: "x".repeat(pad) })) });
  eq(L.fitDrawings(mk(10)), mk(10), "small payload is untouched");
  const trimmed = JSON.parse(L.fitDrawings(mk(700)) as string) as { drawings: { id: string }[] };
  eq([trimmed.drawings.length, trimmed.drawings[0].id, trimmed.drawings[trimmed.drawings.length - 1].id], [500, "d200", "d699"], "over 500 items: the oldest are dropped, the newest kept");
  const big = L.fitDrawings(mk(400, 2000)) as string; // ~800 KB
  ok(big.length <= L.MAX_DRAWINGS_CHARS && JSON.parse(big).drawings.length > 50, "over the byte cap: trimmed to fit, a useful part kept", String(big.length));
  eq(L.fitDrawings("garbage"), null, "not JSON: null (no push)");
  eq(L.fitDrawings('{"v":1}'), null, "no drawings array: null");
  eq(L.fitDrawings(JSON.stringify({ v: 1, drawings: [{ pad: "x".repeat(500_000) }] })), null, "a single drawing over the cap: null (stays local)");
  eq([L.isEmptyDrawings(""), L.isEmptyDrawings('{"v":1,"drawings":[]}'), L.isEmptyDrawings(mk(1)), L.isEmptyIndicators("[]"), L.isEmptyIndicators('[{"id":"sma"}]')], [true, true, false, true, false], "emptiness helpers");

  console.log("-- push scheduling");
  eq(L.retryDelay(429, 0), 30000, "429: wait 30 s");
  eq(L.retryDelay(0, 1), 10000, "network error: backoff grows");
  eq([L.retryDelay(413, 0), L.retryDelay(409, 0), L.retryDelay(401, 0), L.retryDelay(500, 4)], [null, null, null, null], "refused / hopeless: drop (local stays, the next load pushes again)");
  eq([L.nextSendAt(1000, 900, 700), L.nextSendAt(1000, 100, 700), L.nextSendAt(500, 0, 700)], [1600, 1000, 700], "PUTs are spaced");

  /* ───────────── channels over the stub server ───────────── */
  type Ch = ReturnType<typeof S.openChannel>;
  const applied: string[] = [];
  const mkChan = (kind: string, key: string | null, lsKey: string, live: { v: string }, opts: Partial<Parameters<typeof S.openChannel>[0]> = {}): Ch =>
    S.openChannel({
      kind,
      key,
      lsKey,
      current: () => live.v,
      apply: (j) => {
        applied.push(j);
        live.v = j;
      },
      isEmpty: L.isEmptyIndicators,
      emptyJson: "[]",
      ...opts,
    });
  const putsOf = () => log.filter((l) => l.method === "PUT");
  const reset = () => {
    log.length = 0;
    applied.length = 0;
    putStatus = 0;
  };
  const IND = [{ id: "ema", params: { len: 20 }, visible: true }];
  const IND2 = [{ id: "rsi", params: { len: 14 }, visible: true }];
  const j = (v: unknown) => JSON.stringify(v);

  console.log("-- PC -> account -> phone");
  store = devices.pc;
  sessionUser = "u1";
  reset();
  const pcLive = { v: "[]" };
  const pc = mkChan("chart_indicators", "main", "fomo-chart-indicators", pcLive);
  await pc.start();
  eq(putsOf().length, 0, "a fresh device with nothing stored pushes nothing");
  pcLive.v = j(IND);
  for (let i = 0; i < 20; i++) pc.changed(j([{ ...IND[0], params: { len: 30 + i } }]));
  pc.changed(j(IND));
  await sleep(120);
  eq(putsOf().length, 1, "20 quick changes -> one PUT (coalesced)");
  const stored = db.u1.get("chart_indicators|main") as { v: number; at: number; data: unknown };
  ok(!!stored && stored.v === 1 && stored.at > 0 && j(stored.data) === j(IND), "the account copy is {v, at, data} with the list");
  const meta = JSON.parse(store.get("fomo-chart-sync:fomo-chart-indicators") || "{}");
  ok(meta.at === stored.at && meta.uid === "u1", "local meta holds at and the account id", j(meta));
  ok(store.get("fomo-chart-indicators") === j(IND), "local copy written in the same format as before");

  store = devices.phone;
  reset();
  const phLive = { v: "[]" };
  const ph = mkChan("chart_indicators", "main", "fomo-chart-indicators", phLive);
  await ph.start();
  eq(applied.map(L.canonJson), [L.canonJson(j(IND))], "phone (empty): the account copy is applied to the live chart");
  ok(store.get("fomo-chart-indicators") !== undefined && JSON.parse(store.get("fomo-chart-sync:fomo-chart-indicators") as string).at === stored.at, "phone: local copy and its at updated");
  eq(putsOf().length, 0, "phone: pulling does not push back");
  pc.dispose();

  console.log("-- same content, other key order (jsonb)");
  reset();
  const pc2Live = { v: j([{ visible: true, params: { len: 20 }, id: "ema" }]) };
  store = devices.pc;
  const pc2 = mkChan("chart_indicators", "main", "fomo-chart-indicators", pc2Live);
  await pc2.start();
  await sleep(60);
  eq([applied.length, putsOf().length], [0, 0], "equal content in another key order: no pull, no push");
  pc2.dispose();

  console.log("-- newer wins");
  store = devices.phone;
  reset();
  ph.changed(j(IND2)); // phone edit, newer than the account copy
  await sleep(120);
  eq(putsOf().length, 1, "phone edit pushed");
  store = devices.pc;
  reset();
  const pc3Live = { v: j(IND) };
  const pc3 = mkChan("chart_indicators", "main", "fomo-chart-indicators", pc3Live);
  await pc3.start();
  eq(applied.map(L.canonJson), [L.canonJson(j(IND2))], "PC comes back: the phone's newer list replaces its own");
  eq(putsOf().length, 0, "...and nothing is pushed");
  ph.dispose();

  console.log("-- local newer than the account -> push; no echo");
  store.set("fomo-chart-sync:fomo-chart-indicators", JSON.stringify({ at: Date.now() + 5000, uid: "u1" }));
  reset();
  pc3Live.v = j(IND);
  pc3.dispose();
  const pc4 = mkChan("chart_indicators", "main", "fomo-chart-indicators", pc3Live);
  await pc4.start();
  await sleep(80);
  eq([applied.length, putsOf().length], [0, 1], "local (stamped newer) differs from the account: pushed once");
  pc4.dispose();

  console.log("-- legacy local data (no meta)");
  store = new Map([["fomo-chart-indicators", j(IND)]]);
  db.u2.clear();
  sessionUser = "u2";
  reset();
  const lgLive = { v: j(IND) };
  const lg = mkChan("chart_indicators", "main", "fomo-chart-indicators", lgLive);
  await lg.start();
  await sleep(80);
  eq(putsOf().length, 1, "legacy non-empty local, account empty of it: pushed (first device wins)");
  const lgAt = (db.u2.get("chart_indicators|main") as { at: number }).at;
  ok(lgAt > 0, "the push is stamped with the current time");
  lg.dispose();
  // another legacy device with different data meets the stamped account copy
  store = new Map([["fomo-chart-indicators", j(IND2)]]);
  reset();
  const lg2Live = { v: j(IND2) };
  const lg2 = mkChan("chart_indicators", "main", "fomo-chart-indicators", lg2Live);
  await lg2.start();
  eq(applied.map(L.canonJson), [L.canonJson(j(IND))], "second legacy device adopts the stamped account copy");
  ok(store.get("fomo-chart-sync-bak:fomo-chart-indicators") === j(IND2), "...after keeping a one-time backup of what it replaced");
  lg2.dispose();
  // legacy non-empty local vs an EMPTY newer account copy
  db.u2.set("chart_indicators|main", { v: 1, at: Date.now() + 1000, data: [] });
  store = new Map([["fomo-chart-indicators", j(IND2)]]);
  reset();
  const lg3Live = { v: j(IND2) };
  const lg3 = mkChan("chart_indicators", "main", "fomo-chart-indicators", lg3Live);
  await lg3.start();
  await sleep(80);
  eq([applied.length, putsOf().length], [0, 1], "an empty account copy never wipes a legacy non-empty local list (it is pushed instead)");
  lg3.dispose();

  console.log("-- other account's local copy (shared browser)");
  store = new Map([
    ["fomo-chart-indicators", j(IND)],
    ["fomo-chart-sync:fomo-chart-indicators", JSON.stringify({ at: 5000, uid: "u1" })],
  ]);
  db.u2.clear();
  sessionUser = "u2";
  reset();
  const fgLive = { v: j(IND) };
  const fg = mkChan("chart_indicators", "main", "fomo-chart-indicators", fgLive);
  await fg.start();
  await sleep(80);
  eq([applied, putsOf().length], [["[]"], 0], "u2 has nothing: u1's indicators are wiped from the screen and NOT pushed to u2");
  ok(!store.has("fomo-chart-indicators") && JSON.parse(store.get("fomo-chart-sync:fomo-chart-indicators") as string).uid === "u2", "local copy removed, meta now u2's");
  fg.dispose();
  store = new Map([
    ["fomo-chart-indicators", j(IND)],
    ["fomo-chart-sync:fomo-chart-indicators", JSON.stringify({ at: 5000, uid: "u1" })],
  ]);
  db.u2.set("chart_indicators|main", { v: 1, at: 1000, data: IND2 }); // older than u1's local, but u1's local is foreign
  reset();
  const fg2Live = { v: j(IND) };
  const fg2 = mkChan("chart_indicators", "main", "fomo-chart-indicators", fg2Live);
  await fg2.start();
  eq(applied.map(L.canonJson), [L.canonJson(j(IND2))], "u2 has a copy: it replaces u1's local list even though u1's local stamp is newer");
  fg2.dispose();

  console.log("-- guest");
  store = devices.phone;
  sessionUser = null;
  reset();
  const gLive = { v: "[]" };
  const g = mkChan("chart_indicators", "main", "fomo-chart-indicators", gLive);
  await g.start();
  eq(log.map((l) => l.status), [401], "guest: one GET answered 401");
  g.changed(j(IND));
  await sleep(120);
  eq(putsOf().length, 0, "guest: no PUT");
  ok(store.get("fomo-chart-indicators") === j(IND), "guest: kept in localStorage as before");
  const meta2 = JSON.parse(store.get("fomo-chart-sync:fomo-chart-indicators") as string);
  ok(meta2.at > 0 && meta2.uid === undefined, "guest: stamped, no account id");
  const before = log.length;
  const g2 = mkChan("chart_indicators", "main", "x", { v: "[]" });
  await g2.start();
  eq(log.length, before, "guest status is remembered: no more requests for a while");
  eq(S.hasAccountHint(), false, "no account hint for a guest");
  g.dispose();
  g2.dispose();

  console.log("-- a guest signs in without a page reload");
  sessionUser = "u1";
  reset();
  S.noteSignedIn();
  const g3Live = { v: j(IND2) };
  const g3 = mkChan("chart_indicators", "main", "fomo-chart-indicators", g3Live);
  const g3Before = log.length;
  await g3.start();
  ok(log.length > g3Before && log[log.length - 1].status === 200, "noteSignedIn: the guest verdict is forgotten at once, the account is asked again (no wait for the guest window)");
  g3.changed(j([...IND, ...IND2]));
  await sleep(120);
  eq(putsOf().length >= 1, true, "after signing in, changes reach the account");
  ok(S.hasAccountHint(), "the browser knows it is signed in now");
  g3.dispose();
  await sleep(450);
  sessionUser = "u1";

  console.log("-- fail soft");
  store = devices.pc;
  reset();
  const fsLive = { v: "[]" };
  const fs = mkChan("chart_indicators", "p1", "fomo-chart-indicators:p1", fsLive);
  await fs.start();
  putStatus = 413;
  fs.changed(j(IND));
  await sleep(120);
  eq(putsOf().length, 1, "413: one attempt, then dropped (no retry storm)");
  ok(store.get("fomo-chart-indicators:p1") === j(IND), "413: the local copy is intact");
  putStatus = 0;
  const nk = mkChan("chart_indicators", null, "k", { v: "[]" });
  await nk.start();
  nk.changed(j(IND));
  await sleep(100);
  eq(putsOf().length, 1, "a null account key is never synced");
  fs.dispose();
  nk.dispose();

  console.log("-- spacing between PUTs, drawings caps through the channel");
  reset();
  const ids = ["moex:A", "moex:B", "moex:C"];
  const chans = ids.map((id) => mkChan("chart_drawings", id, "d:" + id, { v: '{"v":1,"drawings":[]}' }, { isEmpty: L.isEmptyDrawings, emptyJson: "", fit: L.fitDrawings }));
  const t0 = Date.now();
  chans.forEach((c, i) => c.changed(mk(i === 2 ? 700 : 3)));
  await sleep(250);
  eq(putsOf().length, 3, "three symbols -> three PUTs");
  ok(Date.now() - t0 >= 40 + 2 * 25, "PUTs are spaced by the minimum gap");
  const d2 = db.u1.get("chart_drawings|moex:C") as { data: { drawings: unknown[] } };
  eq(d2.data.drawings.length, 500, "700 drawings: 500 newest go to the account");
  ok((JSON.parse(store.get("d:moex:C") as string).drawings as unknown[]).length === 700, "...the local copy keeps all 700");
  chans.forEach((c) => c.dispose());

  console.log("-- pagehide flush");
  reset();
  const pgLive = { v: "[]" };
  const pg = mkChan("chart_prefs", "main", "fomo-chart-prefs-v1", pgLive, { isEmpty: () => false });
  await pg.start();
  pg.changed('{"interval":"60"}');
  (winL["pagehide"] || []).forEach((f) => f());
  await sleep(10);
  eq([putsOf().length, putsOf()[0]?.keepalive], [1, true], "pagehide: the waiting write goes out at once with keepalive");
  await sleep(100);
  eq(putsOf().length, 1, "...and is not sent a second time");
  pg.dispose();

  console.log("-- re-check on return to the tab");
  store = devices.phone;
  reset();
  const rcLive = { v: j(IND) };
  db.u1.set("chart_indicators|main", { v: 1, at: 10, data: IND });
  store.set("fomo-chart-indicators", j(IND));
  store.set("fomo-chart-sync:fomo-chart-indicators", JSON.stringify({ at: 10, uid: "u1" }));
  const rc = mkChan("chart_indicators", "main", "fomo-chart-indicators", rcLive);
  await rc.start();
  const g0 = log.filter((l) => l.method === "GET").length;
  (docL["visibilitychange"] || []).forEach((f) => f());
  await sleep(30);
  eq(log.filter((l) => l.method === "GET").length - g0, 0, "return to the tab right away: throttled, no request");
  db.u1.set("chart_indicators|main", { v: 1, at: Date.now() + 100, data: IND2 });
  await sleep(180);
  (docL["visibilitychange"] || []).forEach((f) => f());
  await sleep(40);
  eq(applied.map(L.canonJson), [L.canonJson(j(IND2))], "after the throttle: the newer account copy is pulled into the live chart");
  doc.visibilityState = "hidden";
  (docL["visibilitychange"] || []).forEach((f) => f());
  doc.visibilityState = "visible";
  rc.dispose();

  console.log("-- terminal_last (never empty, plain string)");
  store = new Map();
  db.u1.set("terminal_last|default", { v: 1, at: 77, data: { source: "moex", dataTicker: "GAZP" } });
  sessionUser = "u1";
  reset();
  const lsRaw = () => store.get("fomo-terminal-last-v1") ?? "";
  const last = S.openChannel({ kind: "terminal_last", key: "default", lsKey: "fomo-terminal-last-v1", current: lsRaw, apply: () => {}, isEmpty: (x) => !x, emptyJson: "" });
  await last.start();
  eq(JSON.parse(lsRaw()), { source: "moex", dataTicker: "GAZP" }, "no local last symbol: the account's one is written locally for the page to use");
  eq(S.hasAccountHint(), true, "hint: this browser is signed in");
  last.changed(JSON.stringify({ source: "bybit", dataTicker: "BTCUSDT" }));
  await sleep(120);
  eq((db.u1.get("terminal_last|default") as { data: unknown }).data, { dataTicker: "BTCUSDT", source: "bybit" }, "a new symbol goes to the account");
  last.dispose();

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
