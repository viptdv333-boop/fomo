import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Which release the server is running (NEXT_PUBLIC_BUILD_ID is inlined at build
// time — see next.config.ts). The client compares it with its own bundle's id.
export async function GET() {
  return NextResponse.json(
    { id: process.env.NEXT_PUBLIC_BUILD_ID || "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
