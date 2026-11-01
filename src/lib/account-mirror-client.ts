// Sending side of the account mirror (see account-mirror.ts for the design). Every function is fire-and-forget and NEVER throws or
// blocks the caller: the local sign-up / login / password change has already succeeded, the copy to the other site is best-effort
// (timeout ~3.5 s per try; sign-up / password / e-mail messages are retried for about 5 minutes, the rest 3 times). The retries live in
// THIS process only: there is no persistent outbox, so a message still pending when the process stops is lost (docs/terminal-instance.md).
// No Node-only imports (fetch + Web Crypto), so auth.ts can import it without trouble for the edge bundle. Logs carry the operation
// and the outcome only: never an address, a hash, a payload or the secret.
import {
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  MIRROR_PATH,
  NOT_FOUND_PAUSES_MS,
  REQUEST_TIMEOUT_AVATAR_MS,
  REQUEST_TIMEOUT_MS,
  REQUEST_TIMEOUT_SYNC_MS,
  backoffFor,
  isSyncOp,
  mirrorConfig,
  mirrorDirection,
  mirroredStatus,
  profileFromUser,
  profileSchema,
  shouldRetryStatus,
  signRequest,
  type MirrorMessage,
  type MirrorProfile,
  type MirrorResult,
} from "./account-mirror";
import { siteMode } from "./site-mode";

type Outcome = { delivered: boolean; result?: MirrorResult; profile?: MirrorProfile; reason?: string; privileged?: boolean };

/** Waits without keeping the process alive: a graceful shutdown never waits for a retry timer. */
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms) as unknown as { unref?: () => void };
    t.unref?.();
  });

/** This site -> the other one, as part of the signed text ("main>terminal" / "terminal>main"). */
function outgoingDirection(): string {
  const me = siteMode();
  return mirrorDirection(me, me === "terminal" ? "main" : "terminal");
}

/** A peer that has not got the account (yet): a rename or the sign-up copy may still be on its way. */
const RETRY_NOT_FOUND = new Set(["password", "reset", "profile"]);

function hasAvatar(msg: MirrorMessage): boolean {
  return "profile" in msg && typeof msg.profile.avatarUrl === "string";
}

async function deliver(msg: MirrorMessage): Promise<Outcome> {
  const cfg = mirrorConfig();
  if (!cfg) return { delivered: false };
  const body = JSON.stringify(msg);
  const schedule = backoffFor(msg.op);
  const timeout = hasAvatar(msg) ? REQUEST_TIMEOUT_AVATAR_MS : isSyncOp(msg.op) ? REQUEST_TIMEOUT_SYNC_MS : REQUEST_TIMEOUT_MS;
  const direction = outgoingDirection();
  let notFound = 0;
  let reason = "unreachable";
  for (let attempt = 0; attempt < schedule.length; attempt++) {
    if (schedule[attempt] > 0) await sleep(schedule[attempt]);
    try {
      // a fresh signature (timestamp, nonce) for every try
      const sig = await signRequest(cfg.secret, body, { direction });
      const res = await fetch(cfg.peerUrl + MIRROR_PATH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [HEADER_TIMESTAMP]: sig.timestamp,
          [HEADER_NONCE]: sig.nonce,
          [HEADER_SIGNATURE]: sig.signature,
        },
        body,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { result?: MirrorResult; profile?: unknown; privileged?: boolean } | null;
        if (json?.result === "not_found" && RETRY_NOT_FOUND.has(msg.op) && notFound < NOT_FOUND_PAUSES_MS.length) {
          await sleep(NOT_FOUND_PAUSES_MS[notFound++]);
          attempt--; // this was an answer, not a failed try
          continue;
        }
        // the answer to `pull` carries a profile: trusted only after it passes the same schema as an incoming one
        const pulled = json?.profile !== undefined ? profileSchema.safeParse(json.profile) : null;
        return { delivered: true, result: json?.result, ...(json?.privileged === true ? { privileged: true } : {}), ...(pulled?.success ? { profile: pulled.data } : {}), ...(json?.profile !== undefined && !pulled?.success ? { reason: "bad_profile" } : {}) };
      }
      if (res.status === 400) {
        console.warn(`[account-mirror] ${msg.op}: peer refused the data (400), giving up`);
        return { delivered: false, reason: "invalid_data" };
      }
      if (!shouldRetryStatus(res.status)) {
        // 404: the peer has the feature off or another secret. It does not get better with a retry.
        console.warn(`[account-mirror] ${msg.op}: peer answered ${res.status}, giving up`);
        return { delivered: false, reason: res.status === 404 ? "peer_off_or_secret" : `http_${res.status}` };
      }
      reason = `http_${res.status}`;
      console.warn(`[account-mirror] ${msg.op}: peer answered ${res.status} (try ${attempt + 1}/${schedule.length})`);
    } catch (e) {
      reason = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "unreachable";
      console.warn(`[account-mirror] ${msg.op}: ${e instanceof Error ? e.name : "error"} (try ${attempt + 1}/${schedule.length})`);
    }
  }
  return { delivered: false, reason };
}

// Messages about one account (keyed by the SENDER's user id, so an e-mail change does not split the order) go out one after another:
// an edit never overtakes the previous one inside this process, and a rename is always sent before whatever follows it.
const chains = new Map<string, Promise<unknown>>();
function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(task, task);
  chains.set(key, next);
  const clear = () => {
    if (chains.get(key) === next) chains.delete(key);
  };
  next.then(clear, clear);
  return next;
}

/** Queues the message; the returned promise settles (never rejects) when it was delivered or given up on and `after` has run. */
function send(msg: MirrorMessage, userId: string, after?: (o: Outcome) => void | Promise<void>): Promise<void> {
  try {
    if (!mirrorConfig() || !userId) return Promise.resolve();
    return enqueue(userId, async () => {
      const o = await deliver(msg);
      try {
        await after?.(o);
      } catch {
        // bookkeeping only
      }
    }).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    // never let the mirror break the local flow
    return Promise.resolve();
  }
}

/** The account a flow has just written, in the shape the senders need. Only the whitelisted profile fields are ever sent. */
export interface MirrorUser {
  id: string;
  email: string;
  passwordHash: string;
  status?: string | null;
  [k: string]: unknown;
}

/** What a signed-in session knows without a database read. */
export interface MirrorSessionUser {
  id: string;
  email: string;
  status?: string | null;
}
function isFullUser(u: MirrorUser | MirrorSessionUser): u is MirrorUser {
  return typeof (u as MirrorUser).passwordHash === "string";
}

function newAccountMessage(op: "register" | "ensure", u: MirrorUser): MirrorMessage | null {
  const profile = profileFromUser(u);
  if (!profile.displayName) return null;
  return { op, email: u.email, passwordHash: u.passwordHash, profile: profile as MirrorProfile & { displayName: string } };
}

/** Is the mirror on? Callers use it to skip work (reading the previous values) that only the mirror needs. */
export function mirrorActive(): boolean {
  return mirrorConfig() !== null;
}

/** Sign-up (or completing an abandoned sign-up) on this site: create the same account on the other one. */
export function mirrorRegister(u: MirrorUser): void {
  if (mirroredStatus(u.status ?? "APPROVED") === null) return;
  const msg = newAccountMessage("register", u);
  if (msg) void send(msg, u.id);
}

// Addresses the peer is known to have already (or to refuse): one lookup per address and process per 6 hours, so a login costs no extra request.
const ENSURED_TTL_MS = 6 * 60 * 60 * 1000;
const ENSURED_MAX = 5000;
const ensured = new Map<string, number>();

/**
 * After a successful credentials login: if the other site has no account with this address, create it there (full profile, same
 * hash). An existing account over there is left alone (different passwords stay different until a change / reset aligns them).
 */
export function mirrorEnsure(u: MirrorUser): Promise<void> {
  if (mirroredStatus(u.status) === null) return Promise.resolve();
  const key = u.email.trim().toLowerCase();
  const until = ensured.get(key);
  if (until && until > Date.now()) return Promise.resolve();
  const msg = newAccountMessage("ensure", u);
  if (!msg) return Promise.resolve();
  return send(msg, u.id, (o) => remember(key, o));
}

function remember(key: string, o: Outcome): void {
  if (!o.delivered) return;
  if (ensured.size >= ENSURED_MAX) {
    const oldest = ensured.keys().next().value;
    if (oldest !== undefined) ensured.delete(oldest);
  }
  ensured.set(key, Date.now() + ENSURED_TTL_MS);
}

// ---- profile reconcile at login (terminal only) ----
// The terminal cannot import the database / image code (this file also ends up in the edge bundle), so the code that applies a pulled
// profile registers itself here (src/lib/account-mirror-pull.ts, imported by the next-auth route).
/** What the applier reports: `changed` = the profile fields that really changed locally (empty = nothing to do), `skipped` = fields it could not apply. */
export type PullApplyResult = { applied?: boolean; changed?: string[]; skipped?: string[] };
export type PullApplier = (userId: string, profile: MirrorProfile) => Promise<PullApplyResult | void>;
const APPLIER_KEY = "__accountMirrorPullApplier";
export function registerPullApplier(fn: PullApplier): void {
  (globalThis as unknown as Record<string, unknown>)[APPLIER_KEY] = fn;
}
function pullApplier(): PullApplier | null {
  const fn = (globalThis as unknown as Record<string, unknown>)[APPLIER_KEY];
  return typeof fn === "function" ? (fn as PullApplier) : null;
}

/**
 * Everything the mirror does after a successful credentials login. On fomo.spot: `mirrorEnsure` (create the account on the terminal if it
 * is absent there). On the TERMINAL: ask fomo.spot for its profile of the same address (`pull`) and apply it here, main wins for every
 * field that has a value there (avatar included); if fomo.spot has no such address, create it there (`ensure`) as before. Throttled like
 * `ensure` (once per address and process per 6 hours); failures are silent and never block the login. Passwords are not touched.
 */
export function mirrorLogin(u: MirrorUser | MirrorSessionUser, loadFull?: () => Promise<MirrorUser | null>): Promise<void> {
  if (siteMode() !== "terminal") return isFullUser(u) ? mirrorEnsure(u) : Promise.resolve();
  const applier = pullApplier();
  if (!applier) return isFullUser(u) ? mirrorEnsure(u) : Promise.resolve();
  if (mirroredStatus(u.status) === null) return Promise.resolve();
  const key = u.email.trim().toLowerCase();
  const until = ensured.get(key);
  if (until && until > Date.now()) return Promise.resolve();
  const running = pulling.get(key);
  if (running) return running; // a reconcile of this address is already on its way (login and profile page at the same time)
  const p = send({ op: "pull", email: u.email }, u.id, async (o) => {
    // one log line per outcome, without addresses: pull: pulled | nochange | skipped | failed:<reason>
    if (!o.delivered) {
      console.log(`[account-mirror] pull: failed:${o.reason ?? "unknown"}`);
      return;
    }
    if (o.result === "not_found") {
      // fomo.spot has no account with this address: create it there (it remembers the address once that went through)
      console.log("[account-mirror] pull: skipped (not_found: no account with this address on fomo.spot, creating it there)");
      const full = isFullUser(u) ? u : await loadFull?.().catch(() => null);
      const msg = full ? newAccountMessage("ensure", full) : null;
      if (msg) void send(msg, u.id, (e) => remember(key, e));
      return;
    }
    if (o.result !== "pulled" || !o.profile) {
      if (!o.reason) remember(key, o); // an answer that could not be used is asked again next time
      console.log(o.reason ? `[account-mirror] pull: failed:${o.reason}` : `[account-mirror] pull: skipped (${o.result ?? "no answer"})`);
      return;
    }
    let r: PullApplyResult | void;
    try {
      r = await applier(u.id, o.profile);
    } catch {
      console.log("[account-mirror] pull: failed:apply_error");
      return;
    }
    remember(key, o);
    const changed = r?.changed;
    if (r && r.applied === false) console.log("[account-mirror] pull: skipped (no local account)");
    else if (changed && changed.length === 0) console.log(`[account-mirror] pull: nochange${r?.skipped?.length ? ` (skipped: ${r.skipped.join(",")})` : ""}`);
    else console.log(`[account-mirror] pull: pulled${changed ? ` (fields: ${changed.join(",")})` : ""}${r?.skipped?.length ? ` (skipped: ${r.skipped.join(",")})` : ""}`);
  });
  pulling.set(key, p);
  void p.then(() => pulling.delete(key));
  return p;
}

const pulling = new Map<string, Promise<void>>();

// ---- fomo.spot is the master account (the owner's rule: one login and password on both sites) ----
export type LoginAligner = (p: { email: string; password: string; userId?: string | null; profile: MirrorProfile }) => Promise<"created" | "password" | null>;
const ALIGNER_KEY = "__accountMirrorLoginAligner";
export function registerLoginAligner(fn: LoginAligner): void {
  (globalThis as unknown as Record<string, unknown>)[ALIGNER_KEY] = fn;
}

/**
 * Terminal login whose password did not match the LOCAL account (or there is no local account): ask fomo.spot whether the typed password is
 * right for that address. The plaintext password is in this one signed request body (loopback) and nowhere else: never logged, never stored.
 * If the master confirms it (and the account there is APPROVED), the local account is created or its password replaced by the typed one
 * (hashed here, no hash travels), the master profile is applied, and true is returned so the login can complete. Anything else (denied,
 * rate limited, a ban there, fomo.spot unreachable, the mirror off) is false: the normal local "invalid credentials", never an error.
 */
export async function mirrorAlignLogin(p: { email: string; password: string; ip?: string; userId?: string | null }): Promise<boolean> {
  try {
    if (siteMode() !== "terminal" || !mirrorConfig()) return false;
    const aligner = (globalThis as unknown as Record<string, unknown>)[ALIGNER_KEY] as LoginAligner | undefined;
    if (!aligner) return false;
    const o = await deliver({ op: "verify", email: p.email, password: p.password, ...(p.ip ? { ip: p.ip.slice(0, 64) } : {}) });
    if (!o.delivered) {
      console.log(`[account-mirror] verify: failed:${o.reason ?? "unknown"}`);
      return false;
    }
    if (o.result !== "verified" || !o.profile) {
      console.log("[account-mirror] verify: denied");
      return false;
    }
    const how = await aligner({ email: p.email, password: p.password, userId: p.userId ?? null, profile: o.profile });
    if (!how) {
      console.log("[account-mirror] verify: failed:align");
      return false;
    }
    console.log(`[account-mirror] verify: aligned (${how})`);
    remember(p.email.trim().toLowerCase(), { delivered: true }); // the profile was merged just now: no second pull
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign-up (or a password change / reset) on the terminal: does fomo.spot already know this address? null = cannot tell (not the terminal, the
 * mirror off, fomo.spot unreachable): the caller then carries on as before.
 */
export async function mirrorExists(email: string): Promise<{ exists: boolean; privileged: boolean } | null> {
  try {
    if (siteMode() !== "terminal" || !mirrorConfig()) return null;
    const o = await deliver({ op: "exists", email });
    if (!o.delivered) return null;
    if (o.result === "exists") return { exists: true, privileged: o.privileged === true };
    return o.result === "not_found" ? { exists: false, privileged: false } : null;
  } catch {
    return null;
  }
}

/**
 * The same reconcile for an ALREADY signed-in user (a session cookie lives 30 days, so a long-lived user is never asked to log in again).
 * Called from the route that serves the user's own profile (GET /api/users/<own id>), which the profile page and the app profile screen
 * open. Terminal only, only when the mirror is configured, throttled like the login (once per address and process per 6 hours; a call
 * inside the window returns at once, no database work, no request). When a reconcile is due, the caller waits for it up to `waitMs`, so the
 * profile it is about to read is already the merged one; if the peer is slow the request is not held longer and the next read is fresh.
 */
export async function mirrorSession(u: MirrorSessionUser, waitMs: number, loadFull?: () => Promise<MirrorUser | null>): Promise<void> {
  try {
    if (siteMode() !== "terminal" || !mirrorConfig()) return;
    const p = mirrorLogin(u, loadFull);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      p,
      new Promise<void>((r) => {
        timer = setTimeout(r, waitMs);
        (timer as unknown as { unref?: () => void }).unref?.();
      }),
    ]);
    if (timer) clearTimeout(timer);
  } catch {
    // never let the mirror break the request
  }
}

/**
 * Password change by the signed-in user: the other site takes the new hash ONLY if its account still has the old one (so accounts whose
 * passwords differ stay as they are) and drops its old sessions.
 */
export function mirrorPassword(userId: string, email: string, oldHash: string, passwordHash: string): void {
  send({ op: "password", email, passwordHash, oldHash }, userId);
}

/** Password reset by a code from the mailbox (ownership proven): the other site takes the new hash whatever it had (plain USER accounts only). */
export function mirrorReset(userId: string, email: string, passwordHash: string): void {
  send({ op: "reset", email, passwordHash }, userId);
}

/** E-mail change: the other site renames its account found by the OLD address, if that account has the same current hash. */
export function mirrorEmail(userId: string, oldEmail: string, newEmail: string, passwordHash: string): void {
  send({ op: "email", email: oldEmail, newEmail, passwordHash }, userId);
}

/** Profile edit: `changed` is the set of columns that was written (anything outside the whitelist is dropped here). */
export function mirrorProfile(userId: string, email: string | null | undefined, changed: Record<string, unknown>): void {
  if (!email) return;
  const profile = profileFromUser(changed);
  if (Object.keys(profile).length === 0) return;
  send({ op: "profile", email, profile }, userId);
}
