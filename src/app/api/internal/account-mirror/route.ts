import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  MAX_BODY_BYTES,
  MIRROR_PATH,
  NonceCache,
  inboundBucket,
  mirrorConfig,
  mirrorDirection,
  mirrorMessageSchema,
  verifyRequest,
} from "@/lib/account-mirror";
import { applyMirrorMessage } from "@/lib/account-mirror-server";
import { siteMode } from "@/lib/site-mode";

// Server-to-server only: the other instance of this site (fomo.spot <-> terminal.fomo.spot) copies accounts here. See docs/terminal-instance.md.
// Authentication is an HMAC-SHA256 signature over version, method, path, direction, timestamp, nonce and body with ACCOUNT_MIRROR_SECRET (60 s replay window, nonces
// remembered, constant-time compare). While the secret / peer URL is unset, and for every request with a missing or wrong signature, the
// route answers 404 as if it did not exist; nothing else is revealed. Only after the signature checks out: rate limit, body validation.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const nonces = new NonceCache();

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

// Why a request that CARRIES our signature headers got the 404 (the answer itself stays identical for everyone): one line per reason per minute,
// no addresses, no secrets. Unsigned internet probes are never logged.
const lastRefusal = new Map<string, number>();
function refuse(req: NextRequest, reason: string) {
  if (req.headers.has(HEADER_SIGNATURE)) {
    const now = Date.now();
    if (now - (lastRefusal.get(reason) ?? 0) > 60_000) {
      lastRefusal.set(reason, now);
      console.warn(`[account-mirror] inbound refused: ${reason}`);
    }
  }
  return notFound();
}

// There is deliberately NO check for proxy headers (x-forwarded-*): Next.js adds them to the loopback requests of the peer too, so such a check
// refused the real peer. The HMAC signature with the shared secret is what protects this route; an nginx `location = ... { return 404; }` for
// the public vhosts is an optional extra (docs/terminal-instance.md).
export async function POST(req: NextRequest) {
  const cfg = mirrorConfig();
  if (!cfg) return refuse(req, "mirror off here (ACCOUNT_MIRROR_SECRET / ACCOUNT_MIRROR_PEER_URL missing or invalid)");

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return refuse(req, "body too large");
  const body = await req.text().catch(() => "");
  if (body.length > MAX_BODY_BYTES) return refuse(req, "body too large");

  const ok = await verifyRequest({
    secret: cfg.secret,
    body,
    // signed text: version | POST | path | direction | timestamp | nonce | body; the direction is "<sender site>><this site>"
    method: req.method,
    path: MIRROR_PATH,
    direction: mirrorDirection(siteMode() === "terminal" ? "main" : "terminal", siteMode()),
    timestamp: req.headers.get(HEADER_TIMESTAMP),
    nonce: req.headers.get(HEADER_NONCE),
    signature: req.headers.get(HEADER_SIGNATURE),
  });
  if (!ok) return refuse(req, "bad signature (secret, direction, path, clock or format)");
  // a captured request cannot be replayed inside its time window
  if (!nonces.fresh(req.headers.get(HEADER_NONCE) as string)) return refuse(req, "replayed nonce");

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
  const parsed = mirrorMessageSchema.safeParse(json);
  if (!parsed.success) {
    // field names only, never values
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(body)"))].slice(0, 8).join(",");
    console.warn(`[account-mirror] refused invalid data (fields: ${fields})`);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  // After the signature on purpose (unsigned traffic cannot use up the allowance of the real peer) and per class of operation: profile
  // edits and login-time copies have their own bucket, so they can never starve a sign-up, a password change / reset or an e-mail change.
  const bucket = inboundBucket(parsed.data.op);
  const limit = await rateLimit(bucket.key, bucket.limit, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }

  // fomo.spot is the master of the account: only it answers `pull`, `verify` and `exists`
  if (siteMode() === "terminal" && (parsed.data.op === "pull" || parsed.data.op === "exists")) {
    return NextResponse.json({ ok: true, result: "not_found" }, { headers: { "Cache-Control": "no-store" } });
  }
  if (siteMode() === "terminal" && parsed.data.op === "verify") {
    return NextResponse.json({ ok: true, result: "denied" }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const reply = await applyMirrorMessage(parsed.data);
    console.log(`[account-mirror] ${parsed.data.op}: ${reply.result}${reply.reason ? `/${reply.reason}` : ""}${reply.skipped?.length ? ` (skipped: ${reply.skipped.join(",")})` : ""}${reply.fomoIdChanged ? " (fomoId changed)" : ""}`);
    return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // the error object can carry query parameters: log its class only
    console.error(`[account-mirror] ${parsed.data.op}: failed (${e instanceof Error ? e.name : "error"})`);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// every other method looks like a missing route
export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
