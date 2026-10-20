/**
 * TLS for the ALGOPACK gateway ONLY (server-side; never import this from client code).
 *
 * https://apim.moex.com is signed by the Russian Trusted Root CA (Минцифры), which Node's bundled list does not contain, so a plain
 * fetch fails with SELF_SIGNED_CERT_IN_CHAIN. The fix must not widen trust for the other outbound hosts (Bybit, YooKassa, T-Invest, mail ...),
 * so NODE_EXTRA_CA_CERTS (process-wide) is NOT used. Instead the gateway requests get their own undici Agent whose CA list is
 * Node's default roots (tls.rootCertificates) + the PEM from the file named by ALGOPACK_CA_FILE. Every other host keeps the default trust.
 *
 * Never disables verification. A missing / unreadable / not-a-certificate file logs ONE warning (no secrets, no file content) and falls
 * back to the default trust (the calls then fail soft with reason "network", as before).
 * See docs/algopack-tls.md for how to produce the PEM on the server.
 */
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

export const GATEWAY_HOST = "apim.moex.com";

/** Only https://apim.moex.com[:443]/... gets the extra CA (a local http mock and every other host never do). */
export function isGatewayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.toLowerCase() === GATEWAY_HOST && (u.port === "" || u.port === "443");
  } catch {
    return false;
  }
}

let warned = new Set<string>();
function warnOnce(code: string): void {
  if (warned.has(code)) return;
  warned.add(code);
  console.warn(`[algopack] ALGOPACK_CA_FILE ignored (${code}); the gateway uses the default TLS trust`);
}

let caCache: { file: string; pem: string | null } | null = null;

/** The extra CA PEM from ALGOPACK_CA_FILE (read once per path), or null. */
export function gatewayExtraCa(): string | null {
  const file = (process.env.ALGOPACK_CA_FILE ?? "").trim();
  if (!file) return null;
  if (caCache && caCache.file === file) return caCache.pem;
  let pem: string | null = null;
  try {
    const txt = readFileSync(file, "utf8");
    const blocks = txt.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    if (!blocks.length) warnOnce("no-certificate-in-file");
    else {
      for (const b of blocks) new X509Certificate(b); // throws on a corrupt block
      pem = blocks.join("\n") + "\n";
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    warnOnce(typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "unreadable-or-invalid");
  }
  caCache = { file, pem };
  return pem;
}

/** Default roots + the extra CA, or null when no (valid) extra CA is configured. */
export function gatewayCaList(): string[] | null {
  const extra = gatewayExtraCa();
  return extra ? [...rootCertificates, extra] : null;
}

let agentCache: { pem: string; agent: unknown } | null = null;

/** The dedicated undici Agent (cached), or undefined when the default trust applies / the URL is not the gateway. */
export async function gatewayDispatcher(url: string): Promise<unknown | undefined> {
  if (!isGatewayUrl(url)) return undefined;
  const extra = gatewayExtraCa();
  if (!extra) return undefined;
  if (agentCache && agentCache.pem === extra) return agentCache.agent;
  const { Agent } = await import("undici");
  const agent = new Agent({ connect: { ca: [...rootCertificates, extra] } });
  agentCache = { pem: extra, agent };
  return agent;
}

/** fetch through an undici Agent trusting `ca` (the verification stays on). No host check: callers decide. */
export async function fetchWithCa(url: string, init: RequestInit, ca: string[]): Promise<Response> {
  const { Agent, fetch: undiciFetch } = await import("undici");
  const agent = new Agent({ connect: { ca } });
  try {
    const res = await undiciFetch(url, { ...(init as any), dispatcher: agent });
    // the body must be read before the agent goes away: buffer it so the caller gets a plain, self-contained response
    const buf = await res.arrayBuffer();
    return new Response(buf.byteLength ? buf : null, { status: res.status, statusText: res.statusText, headers: [...res.headers] as [string, string][] });
  } finally {
    void agent.close();
  }
}

/** Gateway request with the dedicated trust, or null when the default fetch should be used (other host / no extra CA / undici unavailable). */
export async function gatewayFetch(url: string, init: RequestInit): Promise<Response | null> {
  let dispatcher: unknown;
  try {
    dispatcher = await gatewayDispatcher(url);
  } catch {
    warnOnce("undici-unavailable");
    return null;
  }
  if (!dispatcher) return null;
  const { fetch: undiciFetch } = await import("undici");
  return (await undiciFetch(url, { ...(init as any), dispatcher: dispatcher as any })) as unknown as Response;
}

/** Short, secret-free class of a fetch failure for diagnostics: "TypeError/SELF_SIGNED_CERT_IN_CHAIN" ... */
export function tlsErrorClass(e: unknown): string {
  const er = e as Error & { cause?: { code?: string } };
  return `${er?.name ?? "Error"}/${er?.cause?.code ?? (er as any)?.code ?? "?"}`;
}

/** Tests: forget the cached CA, agent and warnings. */
export function resetGatewayTls(): void {
  caCache = null;
  warned = new Set();
  const a = agentCache?.agent as { close?: () => Promise<void> } | undefined;
  agentCache = null;
  void a?.close?.();
}
