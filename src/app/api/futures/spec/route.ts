import { NextRequest, NextResponse } from "next/server";
import { FUTURES_LIST, getFuturesSpec } from "@/lib/moex-futures-spec";

export const dynamic = "force-dynamic";

// GET (no params) — the calculator's asset list.
// GET ?ticker=BR — that ticker's live front-month contract from MOEX ISS.
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json(FUTURES_LIST);
  }

  try {
    const spec = await getFuturesSpec(ticker);
    if (!spec) {
      return NextResponse.json({ error: "Инструмент не найден" }, { status: 404 });
    }
    return NextResponse.json(spec, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Не удалось получить данные биржи" }, { status: 502 });
  }
}
