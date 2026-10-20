import { NextResponse } from "next/server";
import { getViewer, PRIVATE_HEADERS } from "@/lib/algopack-access";
import { moexSecondsOn } from "@/lib/moex-seconds";

export const dynamic = "force-dynamic";

/**
 * Are second candles available for MOEX instruments to this requester? (the terminal shows the «Секунды» group for MOEX only when this says yes)
 *   off    MOEX_SECONDS=0 (kill switch)
 *   token  no TINKOFF_TOKEN on the server
 *   guest  real-time MOEX trades go to signed-in users only (the Socket.IO feed needs a session)
 * The token itself is never part of the answer. Whether the exchange is open is not decided here: a closed market shows an empty chart with a note.
 */
export async function GET() {
  const headers = { ...PRIVATE_HEADERS };
  if (!moexSecondsOn()) return NextResponse.json({ enabled: false, reason: "off" }, { headers });
  if (!process.env.TINKOFF_TOKEN) return NextResponse.json({ enabled: false, reason: "token" }, { headers });
  const v = await getViewer();
  if (!v.signedIn) return NextResponse.json({ enabled: false, reason: "guest" }, { headers });
  return NextResponse.json({ enabled: true }, { headers });
}
