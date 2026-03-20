import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Import from server socket — works only in custom server mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getOnlineUsers } = require("../../../../../server/socket");
    const onlineUsers = getOnlineUsers() as Map<string, number>;
    return NextResponse.json([...onlineUsers.keys()]);
  } catch {
    // Fallback: return empty array if not running custom server
    return NextResponse.json([]);
  }
}
