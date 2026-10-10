/* FOMO offline OUTBOX: the write queue (likes, comments, chat / DM messages sent without a network go out when it is back).
   One plain file used by BOTH the page (src/lib/outbox/*, imported as a module) and the service worker (importScripts, Background Sync),
   so the state machine exists once. The state machine is pure (no IndexedDB, no fetch of its own): the storage and the fetch function are
   passed in, which is also how scripts/check-outbox.ts tests it in node.   Run: npx tsx scripts/check-outbox.ts

   Item:  { clientId, uid, kind, target, url, method, body, createdAt, seq, attempts, nextAt, status, error?, serverId?, sentAt?,
            coalesceKey?, preview? }
   status: queued | sending | retry | auth | failed | sent
     queued/retry  waiting for its turn (retry has a backoff time `nextAt`)
     sending       the request is in flight (after a crash it is treated as retry: the server's clientId guard makes a replay safe)
     auth          the server said 401: kept until the same user is signed in again
     failed        permanent (4xx other than 401 / 408 / 409 / 425 / 429): stays visible with «Повторить / Удалить», never dropped silently
     sent          delivered; kept ~a minute so the screen can swap the temporary item for the server one without a flash
   Order: items of one `target` (a room, a conversation, a comment thread) are sent strictly in `seq` order, one at a time; a retry of the
   first blocks the ones behind it. A failed item does not block. Different targets are independent. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FomoOutboxCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  var DB_NAME = "fomo-outbox";
  var STORE = "items";
  var BACKOFF_BASE = 2000;
  var BACKOFF_MAX = 5 * 60 * 1000;
  /** transient SERVER-side failures before an item is declared failed (network errors never count) */
  var MAX_SERVER_ATTEMPTS = 12;
  var SENT_GRACE_MS = 60 * 1000;
  var SHOW_SENT_MS = 15 * 1000;
  var STALE_SENDING_MS = 90 * 1000;
  var MAX_ITEMS = 300;

  /** Queued kinds: the only requests that may wait for the network. Everything else (payments, subscribing, publishing, uploads ...) fails with «Нет сети». */
  var KINDS = ["idea_vote", "comment_reaction", "idea_comment", "room_message", "dm_message"];
  var ROUTES = [
    ["idea_vote", "POST", /^\/api\/ideas\/[^/]+\/vote$/],
    ["comment_reaction", "POST", /^\/api\/ideas\/comments\/reactions$/],
    ["idea_comment", "POST", /^\/api\/ideas\/[^/]+\/comments$/],
    ["room_message", "POST", /^\/api\/chat\/messages$/],
    ["dm_message", "POST", /^\/api\/messages\/conversations\/[^/]+\/messages$/],
  ];

  /** kind of a request that may be queued, or "" */
  function kindOf(method, pathname) {
    var m = String(method || "GET").toUpperCase();
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i][1] === m && ROUTES[i][2].test(pathname)) return ROUTES[i][0];
    return "";
  }

  function backoffMs(attempts, rnd) {
    var n = Math.max(1, attempts | 0);
    var base = Math.min(BACKOFF_MAX, BACKOFF_BASE * Math.pow(2, n - 1));
    var r = typeof rnd === "number" ? rnd : 0.5; // 0..1 -> -20%..+20%
    return Math.round(base * (0.8 + 0.4 * r));
  }

  /** "done" | "retry" | "auth" | "failed" for an HTTP status (0 = the network is gone) */
  function classify(status) {
    if (status >= 200 && status < 300) return "done";
    if (status === 0) return "retry";
    if (status === 401) return "auth";
    if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return "retry";
    return "failed";
  }

  function newClientId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    var s = "";
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s.slice(0, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16) + "-" + s.slice(16, 20) + "-" + s.slice(20);
  }

  /** opts: { clientId?, uid, kind, target, url, method?, body, coalesceKey?, preview? } */
  function makeItem(opts, now, seq) {
    var clientId = opts.clientId || newClientId();
    var body = {};
    var src = opts.body || {};
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) body[k] = src[k];
    body.clientId = clientId;
    return {
      clientId: clientId,
      uid: opts.uid,
      kind: opts.kind,
      target: opts.target || opts.kind,
      url: opts.url,
      method: opts.method || "POST",
      body: body,
      createdAt: now,
      seq: seq,
      attempts: 0,
      nextAt: 0,
      status: "queued",
      coalesceKey: opts.coalesceKey || "",
      preview: opts.preview || null,
    };
  }

  function nextSeq(items) {
    var m = 0;
    for (var i = 0; i < items.length; i++) if (items[i].seq > m) m = items[i].seq;
    return m + 1;
  }

  function waiting(it) {
    return it.status === "queued" || it.status === "retry" || it.status === "auth" || it.status === "sending";
  }

  /** a newer like / reaction replaces an older not-yet-sent one for the same thing: clientIds to delete before adding `item` */
  function coalesceDeletes(items, item) {
    var out = [];
    if (!item.coalesceKey) return out;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.uid === item.uid && it.coalesceKey === item.coalesceKey && (it.status === "queued" || it.status === "retry" || it.status === "auth")) out.push(it.clientId);
    }
    return out;
  }

  /** the oldest items beyond MAX_ITEMS of sent / failed are dropped first; a waiting item is never dropped, the new one is refused instead */
  function canAdd(items) {
    return items.length < MAX_ITEMS;
  }

  /**
   * The item to send now, and when to look again.
   * Returns { item, wakeMs }: item null when nothing is due; wakeMs null when nothing is waiting on a timer.
   */
  function pickNext(items, uid, now) {
    var byTarget = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.uid !== uid) continue;
      (byTarget[it.target] = byTarget[it.target] || []).push(it);
    }
    var best = null;
    var wake = null;
    for (var t in byTarget) {
      var list = byTarget[t].slice().sort(function (a, b) { return a.seq - b.seq; });
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (c.status === "failed" || c.status === "sent") continue;
        if (c.status === "auth") break; // blocked until the sign-in is back
        if (c.status === "sending") {
          if (now - (c.nextAt || c.createdAt) < STALE_SENDING_MS) break; // somebody (another tab) is sending it right now
        } else if (c.nextAt > now) {
          wake = wake === null ? c.nextAt - now : Math.min(wake, c.nextAt - now);
          break;
        }
        if (!best || c.seq < best.seq) best = c;
        break;
      }
    }
    return { item: best, wakeMs: wake };
  }

  function counts(items, uid) {
    var n = { pending: 0, failed: 0, auth: 0 };
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (uid !== undefined && it.uid !== uid) continue;
      if (it.status === "failed") n.failed++;
      else if (it.status === "auth") {
        n.auth++;
        n.pending++;
      } else if (waiting(it)) n.pending++;
    }
    return n;
  }

  /** items of this target the screen should draw, oldest first: waiting + failed ones, and just delivered ones the server list does not show yet */
  function mergePending(items, target, serverIds, now) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.target !== target) continue;
      if (it.status === "sent") {
        if (it.serverId && serverIds && serverIds.has(it.serverId)) continue;
        if (now - (it.sentAt || 0) > SHOW_SENT_MS) continue;
      }
      out.push(it);
    }
    return out.sort(function (a, b) { return a.seq - b.seq; });
  }

  /** clientIds to delete: everything (sign-out / «Очистить»), or everything not belonging to keepUid (another user signed in) */
  function purgeIds(items, opts) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      if (opts && opts.all) out.push(items[i].clientId);
      else if (opts && opts.keepUid && items[i].uid !== opts.keepUid) out.push(items[i].clientId);
    }
    return out;
  }

  function gcIds(items, now) {
    var out = [];
    for (var i = 0; i < items.length; i++) if (items[i].status === "sent" && now - (items[i].sentAt || 0) > SENT_GRACE_MS) out.push(items[i].clientId);
    return out;
  }

  /**
   * Sends what is due, one request at a time, in order. deps:
   *   getAll() -> items, put(item), del(clientId)           storage
   *   send(item) -> Promise<{ status, json? }>              status 0 = the network failed (never rejects)
   *   now() -> ms, rnd() -> 0..1, uid                       clock, jitter, the signed-in user
   *   onChange?(item, kind)                                 "sent" | "retry" | "failed" | "auth" (events for the screen)
   * Returns { sent, failed, stopped: "none"|"network"|"auth"|"limit", wakeMs }.
   */
  async function flushOnce(deps, maxRun) {
    var res = { sent: 0, failed: 0, stopped: "none", wakeMs: null };
    var limit = maxRun || 50;
    for (var n = 0; n < limit; n++) {
      var items = await deps.getAll();
      var now = deps.now();
      var pick = pickNext(items, deps.uid, now);
      res.wakeMs = pick.wakeMs;
      var it = pick.item;
      if (!it) return res;
      it.status = "sending";
      it.nextAt = now; // doubles as «sending since»
      await deps.put(it);
      var r;
      try {
        r = await deps.send(it);
      } catch (e) {
        r = { status: 0 };
      }
      if (!r || typeof r.status !== "number") r = { status: 0 };
      var verdict = classify(r.status);
      var after = deps.now();
      if (verdict === "done") {
        it.status = "sent";
        it.netFails = 0;
        it.sentAt = after;
        it.serverId = r.json && (r.json.id || (r.json.comment && r.json.comment.id)) ? String(r.json.id || r.json.comment.id) : it.serverId || "";
        it.error = "";
        await deps.put(it);
        res.sent++;
        if (deps.onChange) deps.onChange(it, "sent");
        continue;
      }
      if (verdict === "auth") {
        it.status = "auth";
        await deps.put(it);
        if (deps.onChange) deps.onChange(it, "auth");
        res.stopped = "auth";
        return res;
      }
      if (verdict === "retry") {
        if (r.status !== 0) it.attempts = (it.attempts || 0) + 1;
        else it.netFails = (it.netFails || 0) + 1;
        if (r.status !== 0 && it.attempts >= MAX_SERVER_ATTEMPTS) {
          it.status = "failed";
          it.error = "http " + r.status;
          await deps.put(it);
          res.failed++;
          if (deps.onChange) deps.onChange(it, "failed");
          continue;
        }
        it.status = "retry";
        it.nextAt = after + backoffMs((it.attempts || 0) + (it.netFails || 0), deps.rnd ? deps.rnd() : 0.5);
        it.error = r.status === 0 ? "network" : "http " + r.status;
        await deps.put(it);
        if (deps.onChange) deps.onChange(it, "retry");
        res.stopped = r.status === 0 ? "network" : "none";
        res.wakeMs = it.nextAt - after;
        if (r.status === 0) return res;
        continue;
      }
      it.status = "failed";
      it.error = (r.json && r.json.error ? String(r.json.error) : "http " + r.status).slice(0, 200);
      await deps.put(it);
      res.failed++;
      if (deps.onChange) deps.onChange(it, "failed");
    }
    res.stopped = "limit";
    return res;
  }

  /** «Повторить»: a failed item goes back to the queue (attempts reset) */
  function retryNow(it, now) {
    it.status = "queued";
    it.attempts = 0;
    it.netFails = 0;
    it.nextAt = 0;
    it.error = "";
    return it;
  }

  /** after a crash / reload: items stuck in "sending" become "retry" right away (the server's clientId guard makes the replay safe) */
  function recoverSending(items) {
    var changed = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === "sending") {
        items[i].status = "retry";
        items[i].nextAt = 0;
        changed.push(items[i]);
      }
    }
    return changed;
  }

  /** the signed-in user is back: items parked as "auth" go back to the queue */
  function resumeAuth(items, uid) {
    var changed = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].uid === uid && items[i].status === "auth") {
        items[i].status = "queued";
        items[i].nextAt = 0;
        changed.push(items[i]);
      }
    }
    return changed;
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // IndexedDB storage (page and service worker open the same database)
  // ---------------------------------------------------------------------------------------------------------------------------

  function reqP(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  /** Storage over an IDBFactory. Returns null when there is none (private mode ...): callers then keep the queue in memory. */
  function openStore(idb) {
    if (!idb) return null;
    var dbp = null;
    function db() {
      if (!dbp) {
        dbp = new Promise(function (resolve, reject) {
          var open = idb.open(DB_NAME, 1);
          open.onupgradeneeded = function () {
            var d = open.result;
            if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "clientId" });
          };
          open.onsuccess = function () { resolve(open.result); };
          open.onerror = function () { reject(open.error); };
          open.onblocked = function () { reject(new Error("blocked")); };
        });
        dbp.catch(function () { dbp = null; });
      }
      return dbp;
    }
    function tx(mode) {
      return db().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); });
    }
    return {
      getAll: function () { return tx("readonly").then(function (s) { return reqP(s.getAll()); }); },
      put: function (it) { return tx("readwrite").then(function (s) { return reqP(s.put(it)); }); },
      del: function (id) { return tx("readwrite").then(function (s) { return reqP(s.delete(id)); }); },
      clear: function () { return tx("readwrite").then(function (s) { return reqP(s.clear()); }); },
    };
  }

  return {
    DB_NAME: DB_NAME,
    STORE: STORE,
    KINDS: KINDS,
    MAX_ITEMS: MAX_ITEMS,
    MAX_SERVER_ATTEMPTS: MAX_SERVER_ATTEMPTS,
    SENT_GRACE_MS: SENT_GRACE_MS,
    kindOf: kindOf,
    backoffMs: backoffMs,
    classify: classify,
    newClientId: newClientId,
    makeItem: makeItem,
    nextSeq: nextSeq,
    coalesceDeletes: coalesceDeletes,
    canAdd: canAdd,
    pickNext: pickNext,
    counts: counts,
    mergePending: mergePending,
    purgeIds: purgeIds,
    gcIds: gcIds,
    flushOnce: flushOnce,
    retryNow: retryNow,
    recoverSending: recoverSending,
    resumeAuth: resumeAuth,
    openStore: openStore,
  };
});
