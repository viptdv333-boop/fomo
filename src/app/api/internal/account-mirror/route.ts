import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  MAX_BODY_BYTES,
  NonceCache,
  mirrorConfig,
  mirrorMessageSchema,
  verifyRequest,
} from "@/lib/account-mirror";
import { applyMirrorMessage } from "@/lib/account-mirror-server";

// Server-to-server only: the other instance of this site (fomo.spot <-> terminal.fomo.spot) copies accounts here. See docs/terminal-instance.md.
// Authentication is an HMAC-SHA256 signature over timestamp + nonce + body with ACCOUNT_MIRROR_SECRET (60 s replay window, nonces
// remembered, constant-time compare). While the secret / peer URL is unset, and for every request with a missing or wrong signature, the
// route answers 404 as if it did not exist; nothing else is revealed. Only after the signature checks out: rate limit, body validation.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const nonces = new NonceCache();

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const cfg = mirrorConfig();
  if (!cfg) return notFound();

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return notFound();
  const body = await req.text().catch(() => "");
  if (body.length > MAX_BODY_BYTES) return notFound();

  const ok = await verifyRequest({
    secret: cfg.secret,
    body,
    timestamp: req.headers.get(HEADER_TIMESTAMP),
    nonce: req.headers.get(HEADER_NONCE),
    signature: req.headers.get(HEADER_SIGNATURE),
  });
  if (!ok) return notFound();
  // a captured request cannot be replayed inside its time window
  if (!nonces.fresh(req.headers.get(HEADER_NONCE) as string)) return notFound();

  // after the signature on purpose: unsigned traffic cannot use up the allowance of the real peer
  const limit = await rateLimit("account-mirror:in", 300, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
  const parsed = mirrorMessageSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  try {
    const reply = await applyMirrorMessage(parsed.data);
    console.log(`[account-mirror] ${parsed.data.op}: ${reply.result}${reply.skipped?.length ? ` (skipped: ${reply.skipped.join(",")})` : ""}${reply.fomoIdChanged ? " (fomoId changed)" : ""}`);
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
