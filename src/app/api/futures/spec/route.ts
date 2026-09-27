import { NextRequest, NextResponse } from "next/server";
import { FUTURES_LIST, getFuturesSpec } from "@/lib/moex-futures-spec";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// GET (no params) — the calculator's asset list.
// GET ?ticker=BR — that ticker's live front-month contract from MOEX ISS.
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const { t } = await getT();
  if (!ticker) {
    // Display names in the requester's language; the ticker stays the lookup key.
    return NextResponse.json(FUTURES_LIST.map((i) => ({ ...i, name: t(`api.futures.${i.ticker}`) })));
  }

  try {
    const spec = await getFuturesSpec(ticker);
    if (!spec) {
      return NextResponse.json({ error: t("api.futuresNotFound") }, { status: 404 });
    }
    return NextResponse.json(spec, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: t("api.futuresFetchFailed") }, { status: 502 });
  }
}
