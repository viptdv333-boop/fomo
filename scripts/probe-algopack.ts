/**
 * Live probe of the ALGOPACK gateway with the server's own key (never prints the key): which reason does the order book / futoi
 * answer with from THIS machine? Run on the server:  cd /opt/fomo && npx tsx scripts/probe-algopack.ts [SECID]
 */
import { existsSync } from "fs";

if (existsSync(".env") && typeof (process as any).loadEnvFile === "function") (process as any).loadEnvFile(".env");

async function main() {
  const { algopackEnabled, algopackPublicFlag } = await import("../src/lib/algopack");
  const { loadBook } = await import("../src/lib/algopack-data");
  const { resolveMoex } = await import("../src/lib/moex-resolve");
  const secid = process.argv[2] || "SBER";
  console.log("enabled(key present):", algopackEnabled(), "| public flag:", algopackPublicFlag());
  const sec = await resolveMoex(secid);
  console.log("resolved:", sec ? `${sec.secid} ${sec.engine}/${sec.market}/${sec.board}` : "null");
  if (!sec) return;
  // the raw request with the same header, to see WHY a call fails (error class / code only, never the key)
  try {
    const key = process.env.ALGOPACK_KEY?.trim() || "";
    const res = await fetch("https://apim.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/SBER/orderbook.json?iss.meta=off&iss.only=orderbook", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const t = await res.text();
    console.log("raw fetch:", res.status, "len", t.length, "head:", t.slice(0, 120).replace(/\s+/g, " "));
  } catch (e) {
    const er = e as Error & { cause?: { code?: string; message?: string } };
    console.log("raw fetch error:", er.name, "|", er.message, "|", er.cause?.code, er.cause?.message);
  }
  console.log("key length:", (process.env.ALGOPACK_KEY || "").trim().length, "has CR/LF/space inside:", /[
\s]/.test((process.env.ALGOPACK_KEY || "").trim()));
  const r = await loadBook(sec);
  console.log("orderbook:", { ok: r.ok, reason: r.reason, bids: r.book?.bids.length, asks: r.book?.asks.length });
}
main().catch((e) => console.log("probe error:", e instanceof Error ? e.message : String(e)));
