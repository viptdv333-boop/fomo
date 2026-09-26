import { NextRequest, NextResponse } from "next/server";
import { createChallenge } from "@/lib/captcha";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(`captcha:ip:${clientIp(req)}`, 60, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  return NextResponse.json(createChallenge(), { headers: { "Cache-Control": "no-store" } });
}
