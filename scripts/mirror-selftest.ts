/* Self-test of the account mirror between the two instances on this server: sends a signed, READ-ONLY `exists` request about an address that
   does not exist, in BOTH directions (terminal -> fomo.spot and fomo.spot -> terminal), and prints whether each side accepted it.
   Nothing is written anywhere; no secret or address is printed.
   Run (from /opt/fomo):  npx tsx scripts/mirror-selftest.ts
   Options: --main-env <file> (default /opt/fomo/.env), --terminal-env <file> (default /opt/fomo-terminal/.env) */
import { readFileSync } from "node:fs";
import { HEADER_NONCE, HEADER_SIGNATURE, HEADER_TIMESTAMP, MIRROR_PATH, mirrorConfig, mirrorDirection, signRequest } from "../src/lib/account-mirror";

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function parseEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

async function probe(label: string, from: "main" | "terminal", env: Record<string, string>): Promise<boolean> {
  const cfg = mirrorConfig(env);
  if (!cfg) {
    console.log(`${label}: FAIL - the mirror is OFF in the sender's .env (ACCOUNT_MIRROR_SECRET / ACCOUNT_MIRROR_PEER_URL missing or invalid)`);
    return false;
  }
  const body = JSON.stringify({ op: "exists", email: "mirror-selftest-nobody@example.com" });
  const direction = mirrorDirection(from, from === "main" ? "terminal" : "main");
  const sig = await signRequest(cfg.secret, body, { direction });
  try {
    const res = await fetch(cfg.peerUrl + MIRROR_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", [HEADER_TIMESTAMP]: sig.timestamp, [HEADER_NONCE]: sig.nonce, [HEADER_SIGNATURE]: sig.signature },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    let result = "";
    try {
      result = String((JSON.parse(text) as { result?: string }).result ?? "");
    } catch {
      // not JSON
    }
    if (res.ok) {
      console.log(`${label}: OK (HTTP ${res.status}, result: ${result || "-"})`);
      return true;
    }
    console.log(`${label}: FAIL - HTTP ${res.status}${res.status === 404 ? " (the peer refused: wrong secret / mirror off there / stale build; see pm2 logs of the receiver for 'inbound refused')" : ""}`);
  } catch (e) {
    console.log(`${label}: FAIL - ${e instanceof Error ? e.name : "error"} (peer not reachable on loopback)`);
  }
  return false;
}

async function main() {
  const mainEnv = parseEnv(arg("main-env", "/opt/fomo/.env"));
  const termEnv = parseEnv(arg("terminal-env", "/opt/fomo-terminal/.env"));
  const same = !!mainEnv.ACCOUNT_MIRROR_SECRET && mainEnv.ACCOUNT_MIRROR_SECRET === termEnv.ACCOUNT_MIRROR_SECRET;
  console.log(`secret identical in both .env files: ${same ? "yes" : "NO"}`);
  const a = await probe("terminal -> fomo.spot", "terminal", termEnv);
  const b = await probe("fomo.spot -> terminal", "main", mainEnv);
  console.log(a && b ? "\nMIRROR OK in both directions" : "\nMIRROR PROBLEM (see above)");
  process.exit(a && b ? 0 : 1);
}

main().catch((e) => {
  console.log("selftest error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
