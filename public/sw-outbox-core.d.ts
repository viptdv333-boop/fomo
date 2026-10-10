// Types of public/sw-outbox-core.js (the plain file shared by the page and the service worker).
export type OutboxStatus = "queued" | "sending" | "retry" | "auth" | "failed" | "sent";
export type OutboxKind = "idea_vote" | "comment_reaction" | "idea_comment" | "room_message" | "dm_message";
export interface OutboxItem {
  clientId: string;
  uid: string;
  kind: OutboxKind;
  target: string;
  url: string;
  method: string;
  body: Record<string, unknown>;
  createdAt: number;
  seq: number;
  attempts: number;
  netFails?: number;
  nextAt: number;
  status: OutboxStatus;
  error?: string;
  serverId?: string;
  sentAt?: number;
  coalesceKey?: string;
  preview?: Record<string, unknown> | null;
}
export interface OutboxStore {
  getAll(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<unknown>;
  del(clientId: string): Promise<unknown>;
  clear(): Promise<unknown>;
}
export interface FlushDeps {
  getAll(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<unknown>;
  del?(clientId: string): Promise<unknown>;
  send(item: OutboxItem): Promise<{ status: number; json?: any }>;
  now(): number;
  rnd?(): number;
  uid: string;
  onChange?(item: OutboxItem, kind: "sent" | "retry" | "failed" | "auth"): void;
}
export interface FlushResult {
  sent: number;
  failed: number;
  stopped: "none" | "network" | "auth" | "limit";
  wakeMs: number | null;
}
export interface MakeItemOpts {
  clientId?: string;
  uid: string;
  kind: OutboxKind;
  target?: string;
  url: string;
  method?: string;
  body?: Record<string, unknown>;
  coalesceKey?: string;
  preview?: Record<string, unknown> | null;
}
declare const core: {
  DB_NAME: string;
  STORE: string;
  KINDS: OutboxKind[];
  MAX_ITEMS: number;
  MAX_SERVER_ATTEMPTS: number;
  SENT_GRACE_MS: number;
  kindOf(method: string, pathname: string): OutboxKind | "";
  backoffMs(attempts: number, rnd?: number): number;
  classify(status: number): "done" | "retry" | "auth" | "failed";
  newClientId(): string;
  makeItem(opts: MakeItemOpts, now: number, seq: number): OutboxItem;
  nextSeq(items: OutboxItem[]): number;
  coalesceDeletes(items: OutboxItem[], item: OutboxItem): string[];
  canAdd(items: OutboxItem[]): boolean;
  pickNext(items: OutboxItem[], uid: string, now: number): { item: OutboxItem | null; wakeMs: number | null };
  counts(items: OutboxItem[], uid?: string): { pending: number; failed: number; auth: number };
  mergePending(items: OutboxItem[], target: string, serverIds: Set<string> | null, now: number): OutboxItem[];
  purgeIds(items: OutboxItem[], opts: { all?: boolean; keepUid?: string }): string[];
  gcIds(items: OutboxItem[], now: number): string[];
  flushOnce(deps: FlushDeps, maxRun?: number): Promise<FlushResult>;
  retryNow(item: OutboxItem, now: number): OutboxItem;
  recoverSending(items: OutboxItem[]): OutboxItem[];
  resumeAuth(items: OutboxItem[], uid: string): OutboxItem[];
  openStore(idb: IDBFactory | null | undefined): OutboxStore | null;
};
export default core;
