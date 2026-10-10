/* The offline OUTBOX: state machine (public/sw-outbox-core.js), idempotency helpers (src/lib/client-request.ts), vote overlay (src/lib/outbox/votes.ts).
   Run: npx tsx scripts/check-outbox.ts   (exit code 1 on a failed assertion) */
import core from "../public/sw-outbox-core.js";
import type { OutboxItem } from "../public/sw-outbox-core";
import { applyPendingVote, pendingVoteOf } from "../src/lib/outbox/votes";
import { decideConflict, parseClientId, clampClientTime, STALE_CLAIM_MS, KEEP_MS } from "../src/lib/client-request";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// in-memory storage + a scriptable server
function makeStore(initial: OutboxItem[] = []) {
  const map = new Map<string, OutboxItem>(initial.map((i) => [i.clientId, { ...i }]));
  return {
    map,
    getAll: async () => Array.from(map.values()).map((i) => ({ ...i })),
    put: async (it: OutboxItem) => void map.set(it.clientId, { ...it }),
    del: async (id: string) => void map.delete(id),
  };
}
let nowMs = 1_000_000;
const clock = () => nowMs;
function add(store: ReturnType<typeof makeStore>, o: { uid?: string; kind?: any; target?: string; text?: string; coalesceKey?: string }) {
  const items = Array.from(store.map.values());
  const it = core.makeItem({ uid: o.uid ?? "u1", kind: o.kind ?? "dm_message", target: o.target ?? "dm:1", url: "/api/x", body: { text: o.text ?? "hi" }, coalesceKey: o.coalesceKey }, nowMs, core.nextSeq(items));
  for (const id of core.coalesceDeletes(items, it)) store.map.delete(id);
  store.map.set(it.clientId, it);
  return it;
}
type Reply = { status: number; json?: any };
async function flush(store: ReturnType<typeof makeStore>, replies: Reply[] | ((it: OutboxItem) => Reply), uid = "u1") {
  const sentLog: string[] = [];
  const events: string[] = [];
  let i = 0;
  const res = await core.flushOnce({
    getAll: store.getAll,
    put: store.put,
    del: store.del,
    uid,
    now: clock,
    rnd: () => 0.5,
    send: async (it) => {
      sentLog.push(String(it.body.text ?? it.body.state ?? it.clientId));
      return typeof replies === "function" ? replies(it) : replies[Math.min(i++, replies.length - 1)];
    },
    onChange: (it, kind) => events.push(`${kind}:${it.body.text ?? ""}`),
  });
  return { res, sentLog, events };
}

async function main() {
  // --- classification
  eq("classify", [200, 201, 202, 0, 401, 403, 404, 400, 408, 409, 425, 429, 500, 503].map((s) => core.classify(s)), ["done", "done", "done", "retry", "auth", "failed", "failed", "failed", "retry", "retry", "retry", "retry", "retry", "retry"]);

  // --- which requests may be queued
  eq("queueable kinds", [
    core.kindOf("POST", "/api/ideas/abc/vote"),
    core.kindOf("POST", "/api/ideas/comments/reactions"),
    core.kindOf("POST", "/api/ideas/abc/comments"),
    core.kindOf("POST", "/api/chat/messages"),
    core.kindOf("POST", "/api/messages/conversations/c1/messages"),
  ], ["idea_vote", "comment_reaction", "idea_comment", "room_message", "dm_message"]);
  eq("NOT queueable: payments, subscribing, publishing, uploads, account, edits, GET", [
    core.kindOf("POST", "/api/payments"), core.kindOf("POST", "/api/yukassa/create"), core.kindOf("POST", "/api/subscriptions"), core.kindOf("POST", "/api/ideas"), core.kindOf("POST", "/api/upload"),
    core.kindOf("POST", "/api/auth/change-password"), core.kindOf("PATCH", "/api/chat/messages/m1"), core.kindOf("DELETE", "/api/ideas/abc/comments"), core.kindOf("GET", "/api/chat/messages"), core.kindOf("POST", "/api/users/u1/follow"),
  ], ["", "", "", "", "", "", "", "", "", ""]);

  // --- backoff
  eq("backoff doubles from 2 s and caps at 5 min", [1, 2, 3, 4, 8, 9, 20].map((n) => core.backoffMs(n, 0.5)), [2000, 4000, 8000, 16000, 256000, 300000, 300000]);
  eq("backoff jitter stays within +-20%", [core.backoffMs(3, 0), core.backoffMs(3, 1)], [6400, 9600]);

  // --- item
  const a0 = core.makeItem({ uid: "u1", kind: "dm_message", target: "dm:1", url: "/u", body: { text: "x" } }, 5, 1);
  eq("makeItem puts the clientId into the body and starts queued", [a0.body.clientId === a0.clientId, a0.status, a0.attempts, a0.clientId.length >= 16], [true, "queued", 0, true]);
  eq("client ids are unique", new Set(Array.from({ length: 200 }, () => core.newClientId())).size, 200);

  // --- order within a target, sequential, all delivered once
  {
    const s = makeStore();
    add(s, { text: "1" });
    add(s, { text: "2" });
    add(s, { text: "3" });
    const r = await flush(s, [{ status: 201, json: { id: "s1" } }, { status: 201, json: { id: "s2" } }, { status: 201, json: { id: "s3" } }]);
    eq("sent strictly in order, once each", [r.sentLog, r.res.sent, r.res.stopped], [["1", "2", "3"], 3, "none"]);
    eq("sent items keep the server id for the screen's no-flash swap", Array.from(s.map.values()).map((i) => [i.status, i.serverId]), [["sent", "s1"], ["sent", "s2"], ["sent", "s3"]]);
    const r2 = await flush(s, [{ status: 201 }]);
    eq("a second flush sends nothing (no duplicates)", [r2.sentLog, r2.res.sent], [[], 0]);
  }

  // --- the network is gone: the first item stays first, nothing behind it is tried
  {
    const s = makeStore();
    add(s, { text: "A" });
    add(s, { text: "B" });
    const r = await flush(s, [{ status: 0 }]);
    eq("network down: one attempt, stop", [r.sentLog, r.res.stopped, r.res.sent], [["A"], "network", 0]);
    const items = Array.from(s.map.values());
    eq("A is retry with a backoff, B untouched", [items[0].status, items[0].nextAt - nowMs, items[1].status, items[0].attempts], ["retry", 2000, "queued", 0]);
    const r2 = await flush(s, [{ status: 201 }]);
    eq("before the backoff ends nothing is sent", [r2.sentLog, r2.res.wakeMs], [[], 2000]);
    nowMs += 2001;
    const r3 = await flush(s, [{ status: 201, json: { id: "a" } }, { status: 201, json: { id: "b" } }]);
    eq("after it: A then B, in order", [r3.sentLog, r3.res.sent], [["A", "B"], 2]);
    nowMs += 10;
  }

  // --- repeated network failures grow the backoff but never fail the item
  {
    const s = makeStore();
    add(s, { text: "N" });
    const waits: number[] = [];
    for (let k = 0; k < 6; k++) {
      await flush(s, [{ status: 0 }]);
      const it = Array.from(s.map.values())[0];
      waits.push(it.nextAt - nowMs);
      nowMs = it.nextAt + 1;
    }
    const it = Array.from(s.map.values())[0];
    eq("offline for a long time: backoff 2,4,8,16,32,64 s; still waiting, never failed", [waits, it.status, it.attempts], [[2000, 4000, 8000, 16000, 32000, 64000], "retry", 0]);
  }

  // --- a retry of the first blocks the ones behind it in the SAME target, not other targets
  {
    const s = makeStore();
    add(s, { text: "R1", target: "room:a" });
    add(s, { text: "R2", target: "room:a" });
    add(s, { text: "D1", target: "dm:b" });
    const r = await flush(s, (it) => (it.body.text === "R1" ? { status: 503 } : { status: 201, json: { id: "ok" } }));
    eq("503 on R1: R2 waits behind it, the other thread goes on", [r.sentLog, r.res.sent], [["R1", "D1"], 1]);
    eq("R1 retry / R2 queued / D1 sent", Array.from(s.map.values()).map((i) => i.status), ["retry", "queued", "sent"]);
    nowMs += 3000;
    const r2 = await flush(s, () => ({ status: 201, json: { id: "ok2" } }));
    eq("later R1 then R2", r2.sentLog.length, 2);
  }

  // --- permanent failure: kept, visible, does not block, Повторить / Удалить
  {
    const s = makeStore();
    add(s, { text: "BAD" });
    add(s, { text: "GOOD" });
    const r = await flush(s, (it) => (it.body.text === "BAD" ? { status: 403, json: { error: "Access denied" } } : { status: 201, json: { id: "g" } }));
    const items = Array.from(s.map.values());
    eq("403: BAD is failed (kept, with the reason), GOOD goes through", [r.sentLog, items[0].status, items[0].error, items[1].status, r.res.failed], [["BAD", "GOOD"], "failed", "Access denied", "sent", 1]);
    eq("counts", core.counts(Array.from(s.map.values()), "u1"), { pending: 0, failed: 1, auth: 0 });
    core.retryNow(items[0], nowMs);
    await s.put(items[0]);
    const r2 = await flush(s, [{ status: 201, json: { id: "late" } }]);
    eq("Повторить puts it back and it is delivered", [r2.sentLog, Array.from(s.map.values())[0].status], [["BAD"], "sent"]);
  }

  // --- 429 / 5xx retry; after MAX_SERVER_ATTEMPTS server errors the item is failed (not silently dropped)
  {
    const s = makeStore();
    add(s, { text: "P" });
    for (let k = 0; k < core.MAX_SERVER_ATTEMPTS; k++) {
      await flush(s, [{ status: 500 }]);
      nowMs = Array.from(s.map.values())[0].nextAt + 1;
    }
    const it = Array.from(s.map.values())[0];
    eq("12 server errors -> failed, still in the queue", [it.status, it.attempts, s.map.size], ["failed", core.MAX_SERVER_ATTEMPTS, 1]);
  }

  // --- 401: parked until sign-in, nothing lost, nothing sent for another user
  {
    const s = makeStore();
    add(s, { text: "S1" });
    add(s, { text: "S2" });
    const r = await flush(s, [{ status: 401 }]);
    eq("401: stop, item parked as auth", [r.sentLog, r.res.stopped, Array.from(s.map.values())[0].status], [["S1"], "auth", "auth"]);
    eq("parked items count as waiting", core.counts(Array.from(s.map.values()), "u1"), { pending: 2, failed: 0, auth: 1 });
    const r2 = await flush(s, [{ status: 201 }]);
    eq("still no sending while parked", r2.sentLog, []);
    const changed = core.resumeAuth(Array.from(s.map.values()), "u1");
    for (const c of changed) await s.put(c);
    const r3 = await flush(s, [{ status: 201, json: { id: "x" } }, { status: 201, json: { id: "y" } }]);
    eq("signed in again: delivered in order", [r3.sentLog, r3.res.sent], [["S1", "S2"], 2]);
  }
  {
    const s = makeStore();
    add(s, { uid: "u1", text: "mine" });
    const r = await flush(s, [{ status: 201 }], "u2");
    eq("another user's queue is never sent as someone else", r.sentLog, []);
  }

  // --- restart: "sending" items come back as retry; the replay carries the SAME clientId
  {
    const s = makeStore();
    const it = add(s, { text: "RS" });
    it.status = "sending";
    it.nextAt = nowMs;
    s.map.set(it.clientId, it);
    const r0 = await flush(s, [{ status: 201 }]);
    eq("a fresh 'sending' item (another tab is on it) is left alone", r0.sentLog, []);
    const rec = core.recoverSending(Array.from(s.map.values()));
    for (const c of rec) await s.put(c);
    const ids: string[] = [];
    await core.flushOnce({ getAll: s.getAll, put: s.put, uid: "u1", now: clock, send: async (x) => (ids.push(x.body.clientId as string), { status: 201, json: { id: "z" } }) });
    eq("after recovery it is sent with the same clientId", ids, [it.clientId]);
    nowMs += core.SENT_GRACE_MS + 1;
    const stuck = add(s, { text: "OLD" });
    stuck.status = "sending";
    stuck.nextAt = nowMs - 200_000;
    s.map.set(stuck.clientId, stuck);
    const r1 = await flush(s, [{ status: 201, json: { id: "o" } }]);
    eq("an 'sending' item stuck for minutes is taken over", r1.sentLog, ["OLD"]);
  }

  // --- coalescing (likes)
  {
    const s = makeStore();
    add(s, { kind: "idea_vote", target: "vote:i1", coalesceKey: "vote:i1", text: "like" });
    add(s, { kind: "idea_vote", target: "vote:i1", coalesceKey: "vote:i1", text: "unlike" });
    add(s, { kind: "idea_vote", target: "vote:i1", coalesceKey: "vote:i1", text: "like2" });
    eq("three taps while offline leave one request: the last wish", Array.from(s.map.values()).map((i) => i.body.text), ["like2"]);
    add(s, { kind: "idea_vote", target: "vote:i2", coalesceKey: "vote:i2", text: "other" });
    eq("another idea is separate", s.map.size, 2);
    add(s, { uid: "u9", kind: "idea_vote", target: "vote:i1", coalesceKey: "vote:i1", text: "foreign" });
    eq("another user's item is never coalesced away", s.map.size, 3);
  }

  // --- purge
  {
    const s = makeStore();
    add(s, { uid: "u1", text: "a" });
    add(s, { uid: "u2", text: "b" });
    const items = Array.from(s.map.values());
    eq("sign-in as u2 removes u1's items only", core.purgeIds(items, { keepUid: "u2" }).length, 1);
    eq("sign-out / «Очистить» removes everything", core.purgeIds(items, { all: true }).length, 2);
    eq("no options -> nothing", core.purgeIds(items, {}).length, 0);
  }

  // --- the screen's view of a thread
  {
    const s = makeStore();
    const a = add(s, { target: "dm:1", text: "wait" });
    const b = add(s, { target: "dm:1", text: "done" });
    b.status = "sent";
    b.sentAt = nowMs - 1000;
    b.serverId = "srv-b";
    const c = add(s, { target: "dm:2", text: "elsewhere" });
    const all = [a, b, c];
    eq("pending + just delivered (not yet in the list) are shown, other threads not", core.mergePending(all, "dm:1", new Set(), nowMs).map((i) => i.body.text), ["wait", "done"]);
    eq("delivered and already in the server list -> not shown twice", core.mergePending(all, "dm:1", new Set(["srv-b"]), nowMs).map((i) => i.body.text), ["wait"]);
    eq("delivered long ago -> gone even if the list lags", core.mergePending(all, "dm:1", new Set(), nowMs + 20_000).map((i) => i.body.text), ["wait"]);
    eq("garbage collection of delivered items after a minute", [core.gcIds(all, nowMs).length, core.gcIds(all, nowMs + core.SENT_GRACE_MS + 5000).length], [0, 1]);
  }

  // --- queue size
  eq("the queue is bounded; a waiting item is never dropped, the new one is refused", [core.canAdd(new Array(core.MAX_ITEMS - 1).fill(0) as any), core.canAdd(new Array(core.MAX_ITEMS).fill(0) as any)], [true, false]);

  // --- a thrown send() counts as network failure, never kills the flush
  {
    const s = makeStore();
    add(s, { text: "T" });
    const r = await core.flushOnce({ getAll: s.getAll, put: s.put, uid: "u1", now: clock, send: async () => { throw new Error("boom"); } });
    eq("send() that throws -> retry, no crash", [r.stopped, Array.from(s.map.values())[0].status], ["network", "retry"]);
  }

  // --- vote overlay
  eq("like on top of nothing", applyPendingVote({ userVote: null, voteScore: 5 }, { value: 1, state: true }), { userVote: 1, voteScore: 6 });
  eq("unlike", applyPendingVote({ userVote: 1, voteScore: 6 }, { value: 1, state: false }), { userVote: null, voteScore: 5 });
  eq("switch dislike -> like", applyPendingVote({ userVote: -1, voteScore: 3 }, { value: 1, state: true }), { userVote: 1, voteScore: 5 });
  eq("like when already liked changes nothing", applyPendingVote({ userVote: 1, voteScore: 6 }, { value: 1, state: true }), { userVote: 1, voteScore: 6 });
  eq("remove a like that is not there", applyPendingVote({ userVote: null, voteScore: 5 }, { value: 1, state: false }), { userVote: null, voteScore: 5 });
  eq("nothing pending", applyPendingVote({ userVote: 1, voteScore: 6 }, null), { userVote: 1, voteScore: 6 });
  eq("preview parse", [pendingVoteOf({ value: 1, state: true }), pendingVoteOf({ value: 2, state: true }), pendingVoteOf(null), pendingVoteOf({ value: -1 })], [{ value: 1, state: true }, null, null, null]);

  // --- server side idempotency helper
  eq("clientId format", [parseClientId(core.newClientId()) !== null, parseClientId("short"), parseClientId("a".repeat(65)), parseClientId("bad id with spaces!!"), parseClientId(5), parseClientId(undefined), parseClientId("abcdefgh")], [true, null, null, null, null, null, "abcdefgh"]);
  const T0 = 1_000_000_000;
  eq("conflict: result known -> duplicate", decideConflict({ resourceId: "m1", createdAt: T0 }, T0 + 10), "duplicate");
  eq("conflict: still running -> busy (409, the client retries)", decideConflict({ resourceId: null, createdAt: T0 }, T0 + 1000), "busy");
  eq("conflict: no result for minutes -> stale (taken over)", decideConflict({ resourceId: null, createdAt: new Date(T0) }, T0 + STALE_CLAIM_MS + 1), "stale");
  eq("client time is clamped to [now-7d, now]", [clampClientTime(T0 + 99999, T0).getTime(), clampClientTime(T0 - 2 * KEEP_MS, T0).getTime(), clampClientTime(T0 - 1000, T0).getTime(), clampClientTime("x", T0).getTime()], [T0, T0 - KEEP_MS, T0 - 1000, T0]);

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
main();
