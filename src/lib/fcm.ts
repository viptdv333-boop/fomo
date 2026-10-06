import crypto from "node:crypto";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { brandName, siteHost } from "@/lib/site-mode";

/**
 * Firebase Cloud Messaging (HTTP v1) delivery to the Android app (android/).
 *
 * No SDK: an OAuth2 access token is minted from a service-account key (RS256 JWT signed with node:crypto,
 * exchanged at the token endpoint, cached until ~5 minutes before it expires) and messages go to
 * POST https://fcm.googleapis.com/v1/projects/<project_id>/messages:send.
 *
 * Configuration (all optional — without a key every function here is a silent no-op, the channel stays Web-Push-only):
 *   FCM_SERVICE_ACCOUNT_FILE   path to the service-account JSON (preferred: chmod 600, outside the repo)
 *   FCM_SERVICE_ACCOUNT_JSON   the same JSON inline (alternative)
 *   FCM_PROJECT_ID             overrides project_id from the JSON (the owner's project is fomo3-c2798)
 *
 * The private key is never logged. Check: npx tsx scripts/check-fcm.ts
 */

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const REFRESH_MARGIN_S = 300;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 5000;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri: string;
}

/** What the dispatcher hands over; everything becomes strings in the FCM `data` map. */
export interface FcmPayload {
  title: string;
  body?: string;
  /** site path ("/ideas/1"); anything that is not a same-origin path is dropped */
  link?: string;
  /** Notification.type of the bell row */
  type: string;
  /** notification-events id (dm, price_alert...), chooses the Android channel */
  event?: string;
  /** same tag = the newer notification replaces the older one */
  tag?: string;
}

export interface FcmStore {
  listTokens(userId: string): Promise<Array<{ id: string; token: string }>>;
  deleteToken(id: string): Promise<void>;
}

export interface FcmDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  store?: FcmStore;
  /** override the env-derived account (tests) */
  account?: ServiceAccount | null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function parseAccount(raw: string, projectOverride?: string): ServiceAccount | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const client_email = typeof j.client_email === "string" ? j.client_email : "";
    const private_key = typeof j.private_key === "string" ? j.private_key : "";
    const project_id = (projectOverride || (typeof j.project_id === "string" ? j.project_id : "")).trim();
    const token_uri = typeof j.token_uri === "string" && /^https:\/\//.test(j.token_uri) ? j.token_uri : DEFAULT_TOKEN_URI;
    if (!client_email || !private_key.includes("PRIVATE KEY") || !project_id) return null;
    return { client_email, private_key, project_id, token_uri };
  } catch {
    return null;
  }
}

let envCache: { sig: string; account: ServiceAccount | null } | null = null;

/** The configured service account, or null (also when the file is missing or malformed). Re-read when the env changes. */
export function loadServiceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  const file = env.FCM_SERVICE_ACCOUNT_FILE?.trim();
  const inline = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  const project = env.FCM_PROJECT_ID?.trim();
  if (!file && !inline) return null;
  const sig = `${file ?? ""}|${inline ? inline.length : 0}|${project ?? ""}`;
  if (env === process.env && envCache?.sig === sig && envCache.account) return envCache.account;
  let raw = inline || "";
  if (!raw && file) {
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      console.error("[fcm] cannot read FCM_SERVICE_ACCOUNT_FILE");
      return null;
    }
  }
  const account = parseAccount(raw, project);
  if (!account) console.error("[fcm] service account JSON is invalid (need client_email, private_key, project_id)");
  if (env === process.env) envCache = { sig, account };
  return account;
}

export function isFcmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return loadServiceAccount(env) !== null;
}

// ---------------------------------------------------------------------------
// OAuth2: JWT bearer assertion -> access token
// ---------------------------------------------------------------------------

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Signed RS256 assertion for the token endpoint. Exported for the test. */
export function signJwt(account: ServiceAccount, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: account.token_uri, iat, exp: iat + 3600 }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(account.private_key))}`;
}

interface TokenState {
  token: string;
  expiresAtMs: number;
}

class AccessTokens {
  private state: TokenState | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private account: ServiceAccount,
    private doFetch: typeof fetch,
    private now: () => number
  ) {}

  invalidate() {
    this.state = null;
  }

  async get(): Promise<string> {
    if (this.state && this.now() < this.state.expiresAtMs - REFRESH_MARGIN_S * 1000) return this.state.token;
    // concurrent senders share one token request
    this.inflight ??= this.mint().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async mint(): Promise<string> {
    const assertion = signJwt(this.account, this.now());
    const res = await this.doFetch(this.account.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`token endpoint answered ${res.status}`);
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error("token endpoint returned no access_token");
    this.state = { token: j.access_token, expiresAtMs: this.now() + Math.max(60, Number(j.expires_in) || 3600) * 1000 };
    return j.access_token;
  }
}

// ---------------------------------------------------------------------------
// Message building / error mapping (pure)
// ---------------------------------------------------------------------------

/** Android notification channel ids — must match android/…/Notifications.kt. */
export type AndroidChannel = "messages" | "terminal" | "calendar" | "general";

const MESSAGE_EVENTS = new Set(["dm", "chat_room_message", "room_join", "mention", "quote_me"]);
const TERMINAL_EVENTS = new Set(["price_alert", "line_alert"]);

export function androidChannelFor(event: string | undefined): AndroidChannel {
  if (!event) return "general";
  if (MESSAGE_EVENTS.has(event)) return "messages";
  if (TERMINAL_EVENTS.has(event)) return "terminal";
  if (event === "calendar_reminder") return "calendar";
  return "general";
}

/** Only a same-origin path survives: "/ideas/1?x=1" yes; "https://evil", "//evil", "javascript:" no. */
export function safeLink(link: string | undefined): string {
  if (!link) return "";
  // the host of THIS site: fomo.spot on the main site, terminal.fomo.spot on the terminal instance
  const m = /^https?:\/\/(?:www\.)?([^\/:?#]+)(\/.*)?$/i.exec(link);
  const own = m && m[1].toLowerCase() === siteHost().toLowerCase() ? m : null;
  if (own) link = own[2] || "/";
  if (!link.startsWith("/") || link.startsWith("//") || link.includes("\\") || /[\u0000-\u001f]/.test(link)) return "";
  return link.slice(0, 500);
}

function clip(s: string | undefined, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

/** The FCM HTTP v1 request body for one device token. */
export function buildMessage(token: string, p: FcmPayload): { message: Record<string, unknown> } {
  const link = safeLink(p.link);
  const channel = androidChannelFor(p.event);
  const tag = clip(p.tag || `${p.event || p.type}:${link}`, 100);
  return {
    message: {
      token,
      notification: { title: clip(p.title, 100) || brandName(), body: clip(p.body, 180) },
      data: { type: p.type.slice(0, 60), event: (p.event ?? "").slice(0, 60), link, tag, channel },
      android: {
        priority: "HIGH",
        collapse_key: tag,
        ttl: "86400s",
        notification: { channel_id: channel, tag },
      },
    },
  };
}

export interface FcmFailure {
  status: number;
  code: string;
  /** the token is permanently invalid: delete it */
  dead: boolean;
  /** worth retrying later (429 / 5xx) */
  retryable: boolean;
}

/** HTTP status + parsed error body -> what to do about it. */
export function classifyError(status: number, body: unknown): FcmFailure {
  const err = (body && typeof body === "object" ? (body as { error?: Record<string, unknown> }).error : undefined) ?? {};
  const details = Array.isArray(err.details) ? (err.details as Array<Record<string, unknown>>) : [];
  const fcmDetail = details.find((d) => typeof d?.errorCode === "string");
  const code = String(fcmDetail?.errorCode ?? err.status ?? status);
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  const tokenViolation = details.some((d) => Array.isArray(d?.fieldViolations) && (d.fieldViolations as Array<{ field?: string }>).some((v) => String(v?.field ?? "").toLowerCase().includes("token")));
  const tokenMessage = message.includes("registration token") || message.includes("not a valid fcm");

  let dead = false;
  if (code === "UNREGISTERED") dead = true;
  else if (err.status === "NOT_FOUND") dead = Boolean(fcmDetail) || tokenMessage; // a bare NOT_FOUND may be a wrong project, not a dead token
  else if (err.status === "INVALID_ARGUMENT") dead = tokenViolation || tokenMessage; // other bad arguments are OUR payload, never delete tokens for them
  const retryable = status === 429 || status >= 500 || code === "QUOTA_EXCEEDED" || code === "UNAVAILABLE" || code === "INTERNAL";
  return { status, code, dead, retryable };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type SendOutcome = { ok: true } | ({ ok: false } & FcmFailure) | { ok: false; status: 0; code: string; dead: false; retryable: boolean };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class FcmClient {
  private tokens: AccessTokens;
  private doFetch: typeof fetch;
  private sleep: (ms: number) => Promise<void>;

  constructor(
    private account: ServiceAccount,
    deps: FcmDeps
  ) {
    this.doFetch = deps.fetch ?? ((...a) => globalThis.fetch(...a));
    this.sleep = deps.sleep ?? defaultSleep;
    this.tokens = new AccessTokens(account, this.doFetch, deps.now ?? Date.now);
  }

  async send(deviceToken: string, payload: FcmPayload): Promise<SendOutcome> {
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.project_id)}/messages:send`;
    const body = JSON.stringify(buildMessage(deviceToken, payload));
    let last: SendOutcome = { ok: false, status: 0, code: "unknown", dead: false, retryable: true };
    let refreshedAuth = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        const access = await this.tokens.get();
        res = await this.doFetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        last = { ok: false, status: 0, code: e instanceof Error && /token endpoint/.test(e.message) ? "auth" : "network", dead: false, retryable: true };
        await this.sleep(Math.min(MAX_RETRY_WAIT_MS, 300 * 4 ** attempt));
        continue;
      }
      if (res.ok) return { ok: true };
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        /* non-JSON error body */
      }
      if (res.status === 401 && !refreshedAuth) {
        // the cached access token was revoked or expired early: mint a new one once
        refreshedAuth = true;
        this.tokens.invalidate();
        attempt--;
        continue;
      }
      const f = classifyError(res.status, parsed);
      last = { ok: false, ...f };
      if (f.dead || !f.retryable) return last;
      const ra = Number(res.headers.get("retry-after"));
      await this.sleep(Math.min(MAX_RETRY_WAIT_MS, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 300 * 4 ** attempt));
    }
    return last;
  }
}

const clients = new Map<string, FcmClient>();

function clientFor(deps: FcmDeps): FcmClient | null {
  const account = deps.account !== undefined ? deps.account : loadServiceAccount();
  if (!account) return null;
  // the default client keeps its cached access token between calls; tests pass their own fetch and get a fresh one
  if (deps.fetch || deps.now || deps.sleep) return new FcmClient(account, deps);
  const key = `${account.client_email}|${account.project_id}`;
  let c = clients.get(key);
  if (!c) clients.set(key, (c = new FcmClient(account, deps)));
  return c;
}

const prismaStore: FcmStore = {
  async listTokens(userId) {
    return prisma.fcmToken.findMany({ where: { userId }, select: { id: true, token: true } });
  },
  async deleteToken(id) {
    await prisma.fcmToken.delete({ where: { id } }).catch(() => {});
  },
};

/**
 * Sends to every Android device of the user. Never throws; resolves to how many devices accepted the message.
 * Dead tokens are deleted. Not configured / no devices -> 0.
 */
export async function sendFcmToUser(userId: string, payload: FcmPayload, deps: FcmDeps = {}): Promise<{ sent: number; devices: number }> {
  const client = clientFor(deps);
  if (!client) return { sent: 0, devices: 0 };
  const store = deps.store ?? prismaStore;
  let tokens: Array<{ id: string; token: string }>;
  try {
    tokens = await store.listTokens(userId);
  } catch (e) {
    console.error("[fcm] token lookup failed:", e instanceof Error ? e.message : e);
    return { sent: 0, devices: 0 };
  }
  let sent = 0;
  await Promise.all(
    tokens.map(async (t) => {
      try {
        const r = await client.send(t.token, payload);
        if (r.ok) sent++;
        else if (r.dead) await store.deleteToken(t.id);
        else console.error(`[fcm] send failed for device ${t.id}: status ${r.status} ${r.code}`);
      } catch (e) {
        console.error("[fcm] send error:", e instanceof Error ? e.message : "unknown");
      }
    })
  );
  return { sent, devices: tokens.length };
}

/** Bell row + event -> push payload (used by the dispatcher, kept here so it is testable without a DB). */
export function payloadForNotification(n: { type: string; event: string; title: string; body?: string; link?: string }): FcmPayload {
  return { title: n.title, body: n.body, link: n.link, type: n.type, event: n.event };
}
