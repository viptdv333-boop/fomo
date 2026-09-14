import { NextRequest, NextResponse } from "next/server";

// Diagnostic beacon called from the service worker's push handler itself —
// see public/sw.js. No auth: it fires from a background SW context that may
// not carry a fresh session, and the payload carries nothing sensitive.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ua = request.headers.get("user-agent") || "unknown";
  console.log(`[push-beacon] stage=${body.stage} detail=${body.detail || ""} ua=${ua}`);
  return NextResponse.json({ ok: true });
}
