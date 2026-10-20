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
  const r = await loadBook(sec);
  console.log("orderbook:", { ok: r.ok, reason: r.reason, bids: r.book?.bids.length, asks: r.book?.asks.length });
}
main().catch((e) => console.log("probe error:", e instanceof Error ? e.message : String(e)));
