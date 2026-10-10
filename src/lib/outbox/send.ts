// What a component calls instead of `fetch(POST)` for the five things that may wait for the network (idea vote, comment reaction, idea comment,
// room message, DM). Online and nothing waiting before it in the same thread: sent at once, like before. Offline, a network error, a 5xx / 429 or a
// backlog: it goes into the outbox (IndexedDB) and is sent later, in order, exactly once (the clientId makes a replay harmless on the server).
import core from "../../../public/sw-outbox-core.js";
import { rawFetch } from "../offline/fetch-guard";
import { isOnline, noteNetworkError, markReachable } from "../offline/online";
import { noteWrite } from "../offline/sw-bridge";
import { enqueue, outboxSnapshot, outboxUid, type EnqueueInput, type OutboxItem } from "./outbox";

export type QueueResult =
  | { state: "sent"; res: Response; data: any }
  | { state: "queued"; item: OutboxItem }
  | { state: "rejected"; res: Response | null; data: any; error: string };

function hasBacklog(target: string): boolean {
  const uid = outboxUid();
  return outboxSnapshot().some((i) => i.uid === uid && i.target === target && (i.status === "queued" || i.status === "retry" || i.status === "sending" || i.status === "auth"));
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function sendOrQueue(input: EnqueueInput): Promise<QueueResult> {
  const uid = outboxUid();
  const body = JSON.stringify;
  // not signed in (or the outbox is not started): the plain request, nothing to queue
  if (!uid) {
    try {
      const res = await fetch(input.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body(input.body) });
      const data = await readJson(res);
      return res.ok ? { state: "sent", res, data } : { state: "rejected", res, data, error: String(data?.error || res.status) };
    } catch (e) {
      return { state: "rejected", res: null, data: null, error: e instanceof Error ? e.message : "network" };
    }
  }

  const queue = async (clientId?: string): Promise<QueueResult> => {
    const item = await enqueue(clientId ? { ...input, clientId } : input);
    return item ? { state: "queued", item } : { state: "rejected", res: null, data: null, error: "queue" };
  };

  if (!isOnline() || hasBacklog(input.target)) return queue();

  const clientId = core.newClientId();
  try {
    const res = await rawFetch(input.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ ...input.body, clientId }) });
    const data = await readJson(res);
    if (res.ok) {
      markReachable();
      noteWrite();
      return { state: "sent", res, data };
    }
    const verdict = core.classify(res.status);
    if (verdict === "retry" || verdict === "auth") return queue(clientId);
    return { state: "rejected", res, data, error: String(data?.error || res.status) };
  } catch {
    // the request may or may not have reached the server: the same clientId on the retry makes it safe
    void noteNetworkError();
    return queue(clientId);
  }
}
