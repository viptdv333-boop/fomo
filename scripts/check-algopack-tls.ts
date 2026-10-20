/* Offline check of the ALGOPACK gateway TLS trust (src/lib/algopack-tls.ts, apFetch in src/lib/algopack.ts):
   the extra CA from ALGOPACK_CA_FILE is used for https://apim.moex.com only, never for other hosts or the local mock, the loading
   falls back to the default trust (one warning) on a missing / invalid file, and a REAL local HTTPS server signed by a throw-away
   CA proves that the default trust rejects it while the dedicated agent accepts it (verification stays on).
   Needs the `openssl` binary for the throw-away certificate (the real-server part is skipped, with a notice, when it is missing).
   Run: npx tsx scripts/check-algopack-tls.ts */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { apFetch } from "../src/lib/algopack";
import { fetchWithCa, gatewayCaList, gatewayDispatcher, gatewayExtraCa, isGatewayUrl, resetGatewayTls, tlsErrorClass } from "../src/lib/algopack-tls";

let fails = 0;
function ok(cond: unknown, name: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) fails++;
}

const dir = mkdtempSync(join(tmpdir(), "algopack-tls-"));
const warnings: string[] = [];
const realWarn = console.warn;
console.warn = (...a: unknown[]) => void warnings.push(a.join(" "));
const realFetch = globalThis.fetch;
const globalCalls: string[] = [];
(globalThis as any).fetch = async (url: string) => {
  globalCalls.push(String(url));
  return new Response("{}", { status: 200 });
};

async function main() {
  /* host rule */
  ok(isGatewayUrl("https://apim.moex.com/iss/x.json"), "gateway URL is recognised");
  ok(isGatewayUrl("https://APIM.moex.com:443/iss/x.json"), "case / explicit 443");
  for (const u of ["https://iss.moex.com/iss/x.json", "http://apim.moex.com/iss/x", "https://apim.moex.com.evil.example/iss", "https://evil.example/apim.moex.com/", "https://apim.moex.com:8443/iss", "http://localhost:5099/iss", "https://api.bybit.com/v5", "not a url"])
    ok(!isGatewayUrl(u), `not the gateway: ${u}`);

  /* loading / fallback */
  delete process.env.ALGOPACK_CA_FILE;
  resetGatewayTls();
  ok(gatewayExtraCa() === null && gatewayCaList() === null, "no ALGOPACK_CA_FILE -> default trust");
  ok((await gatewayDispatcher("https://apim.moex.com/iss/x")) === undefined, "no dispatcher without the file");

  process.env.ALGOPACK_CA_FILE = join(dir, "missing.pem");
  resetGatewayTls();
  warnings.length = 0;
  ok(gatewayExtraCa() === null && gatewayExtraCa() === null, "missing file -> null (twice)");
  ok(warnings.length === 1 && /ALGOPACK_CA_FILE ignored/.test(warnings[0]) && !warnings[0].includes(dir), `missing file -> exactly one warning without the path (${warnings.length})`);
  ok((await gatewayDispatcher("https://apim.moex.com/iss/x")) === undefined, "missing file -> still no dispatcher (default trust)");

  writeFileSync(join(dir, "junk.pem"), "this is not a certificate\n");
  process.env.ALGOPACK_CA_FILE = join(dir, "junk.pem");
  resetGatewayTls();
  warnings.length = 0;
  ok(gatewayExtraCa() === null && warnings.length === 1, "junk file -> null + one warning");
  writeFileSync(join(dir, "corrupt.pem"), "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n");
  process.env.ALGOPACK_CA_FILE = join(dir, "corrupt.pem");
  resetGatewayTls();
  warnings.length = 0;
  ok(gatewayExtraCa() === null && warnings.length === 1, "corrupt certificate block -> null + one warning");

  /* a throw-away CA + a real local HTTPS server */
  let pem = "";
  let keyPem = "";
  try {
    const key = join(dir, "k.pem");
    const crt = join(dir, "c.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", key, "-out", crt, "-days", "2", "-subj", "/CN=algopack-test-root", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"], { stdio: "ignore" });
    pem = readFileSync(crt, "utf8");
    keyPem = readFileSync(key, "utf8");
  } catch {
    console.log("INFO  openssl is not available: the real-server part is skipped");
  }

  process.env.ALGOPACK_CA_FILE = pem ? join(dir, "c.pem") : join(dir, "junk.pem");
  resetGatewayTls();
  warnings.length = 0;
  if (pem) {
    ok(typeof gatewayExtraCa() === "string" && warnings.length === 0, "valid PEM loaded, no warning");
    const list = gatewayCaList()!;
    ok(Array.isArray(list) && list.length === rootCertificates.length + 1 && list[0] === rootCertificates[0], "CA list = Node default roots + the extra one");
    const d1 = await gatewayDispatcher("https://apim.moex.com/iss/x");
    const d2 = await gatewayDispatcher("https://apim.moex.com/iss/y");
    ok(d1 !== undefined && d1 === d2, "gateway URL -> one cached dedicated agent");
    for (const u of ["https://iss.moex.com/iss/x", "https://api.bybit.com/v5/market", "https://apim.moex.com.evil.example/iss", "http://127.0.0.1:5099/iss"])
      ok((await gatewayDispatcher(u)) === undefined, `other host never gets the extra CA: ${u}`);

    const server = https.createServer({ key: keyPem, cert: pem }, (_req, res) => res.end('{"ok":true}'));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `https://127.0.0.1:${(server.address() as { port: number }).port}/iss/ping`;
    try {
      let err: unknown = null;
      try {
        await realFetch(url, { signal: AbortSignal.timeout(4000) });
      } catch (e) {
        err = e;
      }
      ok(err !== null && /CERT|SELF_SIGNED|ISSUER/i.test(tlsErrorClass(err)), `default trust rejects the server (${tlsErrorClass(err)})`);
      const res = await fetchWithCa(url, { signal: AbortSignal.timeout(4000) }, gatewayCaList()!);
      ok(res.status === 200 && (await res.text()) === '{"ok":true}', "dedicated CA list accepts the same server");
      // the very agent apFetch hands to the gateway requests (same object, undici fetch like gatewayFetch)
      const { fetch: undiciFetch } = await import("undici");
      const viaAgent = await undiciFetch(url, { dispatcher: d1 as any, signal: AbortSignal.timeout(4000) });
      ok(viaAgent.status === 200 && viaAgent.headers.get("retry-after") === null && (await viaAgent.text()) === '{"ok":true}', "the cached gateway agent itself accepts the server (status / headers / text work)");
      let err2: unknown = null;
      try {
        await fetchWithCa(url, { signal: AbortSignal.timeout(4000) }, [...rootCertificates]);
      } catch (e) {
        err2 = e;
      }
      ok(err2 !== null, "defaults-only list still rejects (verification is on)");
    } finally {
      server.close();
    }
  }

  /* routing of apFetch */
  globalCalls.length = 0;
  await apFetch("https://iss.moex.com/iss/x.json");
  await apFetch("https://api.bybit.com/v5/market/time");
  await apFetch("http://127.0.0.1:5099/iss/x.json");
  ok(globalCalls.length === 3, "other hosts and the local mock use the plain global fetch even with ALGOPACK_CA_FILE set");
  if (pem) {
    globalCalls.length = 0;
    let routed = "";
    try {
      await apFetch("https://apim.moex.com/iss/index.json", { signal: AbortSignal.timeout(2500) });
      routed = "answered";
    } catch (e) {
      routed = tlsErrorClass(e);
    }
    ok(globalCalls.length === 0, `gateway URL with the CA file bypasses the global fetch (dedicated agent used; offline result: ${routed})`);
  }
  delete process.env.ALGOPACK_CA_FILE;
  resetGatewayTls();
  globalCalls.length = 0;
  await apFetch("https://apim.moex.com/iss/index.json");
  ok(globalCalls.length === 1, "without ALGOPACK_CA_FILE the gateway uses the plain global fetch (mockable, default trust)");
}

main()
  .catch((e) => {
    console.log("FAIL  unexpected error:", e instanceof Error ? e.message : String(e));
    fails++;
  })
  .finally(() => {
    console.warn = realWarn;
    (globalThis as any).fetch = realFetch;
    rmSync(dir, { recursive: true, force: true });
    console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
    process.exit(fails ? 1 : 0);
  });
