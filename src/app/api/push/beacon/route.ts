import { NextRequest, NextResponse } from "next/server";

const KNOWN_STAGES = new Set(["received", "shown", "error"]);

// Strip control chars (incl. \r\n and ANSI CSI) so a value can't forge extra
// log lines or terminal escapes, then cap length.
function sanitize(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, maxLen);
}

// Diagnostic beacon called from the service worker's push handler itself —
// see public/sw.js. No auth: it fires from a background SW context that may
// not carry a fresh session, and the payload carries nothing sensitive. Input
// is still untrusted (any caller can POST here), so it's sanitized before
// ever reaching the log.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const stage = KNOWN_STAGES.has(body?.stage) ? body.stage : "unknown";
  const detail = sanitize(body?.detail, 200);
  const ua = sanitize(request.headers.get("user-agent"), 200) || "unknown";
  console.log(`[push-beacon] stage=${stage} detail=${detail} ua=${ua}`);
  return NextResponse.json({ ok: true });
}
