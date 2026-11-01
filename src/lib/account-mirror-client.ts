// Sending side of the account mirror (see account-mirror.ts for the design). Every function is fire-and-forget and NEVER throws or
// blocks the caller: the local sign-up / login / password change has already succeeded, the copy to the other site is best-effort
// (timeout ~3.5 s per try, 3 tries with backoff, in-process). With the mirror switched off (a variable missing) every call returns at once.
// No Node-only imports (fetch + Web Crypto), so auth.ts can import it without trouble for the edge bundle. Logs carry the operation
// and the outcome only: never an address, a hash or the secret.
import {
  BACKOFF_MS,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  MIRROR_PATH,
  REQUEST_TIMEOUT_MS,
  mirrorConfig,
  mirroredStatus,
  profileFromUser,
  shouldRetryStatus,
  signRequest,
  type MirrorMessage,
  type MirrorProfile,
  type MirrorResult,
} from "./account-mirror";

type Outcome = { delivered: boolean; result?: MirrorResult };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function deliver(msg: MirrorMessage): Promise<Outcome> {
  const cfg = mirrorConfig();
  if (!cfg) return { delivered: false };
  const body = JSON.stringify(msg);
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    if (BACKOFF_MS[attempt] > 0) await sleep(BACKOFF_MS[attempt]);
    try {
      // a fresh signature (timestamp, nonce) for every try
      const sig = await signRequest(cfg.secret, body);
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { result?: MirrorResult } | null;
        return { delivered: true, result: json?.result };
      }
      if (!shouldRetryStatus(res.status)) {
        // 404: the peer has the feature off or another secret; 400: it refused the data. Neither gets better with a retry.
        console.warn(`[account-mirror] ${msg.op}: peer answered ${res.status}, giving up`);
        return { delivered: false };
      }
      console.warn(`[account-mirror] ${msg.op}: peer answered ${res.status} (try ${attempt + 1}/${BACKOFF_MS.length})`);
    } catch (e) {
      console.warn(`[account-mirror] ${msg.op}: ${e instanceof Error ? e.name : "error"} (try ${attempt + 1}/${BACKOFF_MS.length})`);
    }
  }
  return { delivered: false };
}

// Requests about one account go out one after another (an edit never overtakes the previous one inside this process).
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

function send(msg: MirrorMessage, key: string, after?: (o: Outcome) => void): void {
  try {
    if (!mirrorConfig()) return;
    void enqueue(key.trim().toLowerCase(), async () => {
      const o = await deliver(msg);
      try {
        after?.(o);
      } catch {
        // bookkeeping only
      }
    }).catch(() => {});
  } catch {
    // never let the mirror break the local flow
  }
}

/** The account a flow has just written, in the shape the senders need. Only the whitelisted profile fields are ever sent. */
export interface MirrorUser {
  email: string;
  passwordHash: string;
  status?: string | null;
  displayName: string;
  [k: string]: unknown;
}

function newAccountMessage(op: "register" | "ensure", u: MirrorUser): MirrorMessage | null {
  const profile = profileFromUser(u);
  if (!profile.displayName) return null;
  return { op, email: u.email, passwordHash: u.passwordHash, profile: profile as MirrorProfile & { displayName: string } };
}

/** Sign-up (or completing an abandoned sign-up) on this site: create the same account on the other one. */
export function mirrorRegister(u: MirrorUser): void {
  if (mirroredStatus(u.status ?? "APPROVED") === null) return;
  const msg = newAccountMessage("register", u);
  if (msg) send(msg, u.email);
}

// Addresses the peer is known to have already (or to refuse): one lookup per address and process per 6 hours, so a login costs no extra request.
const ENSURED_TTL_MS = 6 * 60 * 60 * 1000;
const ENSURED_MAX = 5000;
const ensured = new Map<string, number>();

/**
 * After a successful credentials login: if the other site has no account with this address, create it there (full profile, same
 * hash). An existing account over there is left alone (different passwords stay different until a change / reset aligns them).
 */
export function mirrorEnsure(u: MirrorUser): void {
  if (mirroredStatus(u.status) === null) return;
  const key = u.email.trim().toLowerCase();
  const until = ensured.get(key);
  if (until && until > Date.now()) return;
  const msg = newAccountMessage("ensure", u);
  if (!msg) return;
  send(msg, u.email, (o) => {
    if (!o.delivered) return;
    if (ensured.size >= ENSURED_MAX) {
      const oldest = ensured.keys().next().value;
      if (oldest !== undefined) ensured.delete(oldest);
    }
    ensured.set(key, Date.now() + ENSURED_TTL_MS);
  });
}

/** Password change / reset: the other site takes the new hash for the account with this address and drops its old sessions. */
export function mirrorPassword(email: string, passwordHash: string): void {
  send({ op: "password", email, passwordHash }, email);
}

/** E-mail change: the other site renames the account found by the OLD address. */
export function mirrorEmail(oldEmail: string, newEmail: string): void {
  send({ op: "email", email: oldEmail, newEmail }, oldEmail);
}

/** Profile edit: `changed` is the set of columns that was written (anything outside the whitelist is dropped here). */
export function mirrorProfile(email: string | null | undefined, changed: Record<string, unknown>): void {
  if (!email) return;
  const profile = profileFromUser(changed);
  if (Object.keys(profile).length === 0) return;
  send({ op: "profile", email, profile }, email);
}
