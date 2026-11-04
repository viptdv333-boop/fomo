/**
 * Checks a pasted key against the provider with one cheap read-only request (server only). The key goes only into the Authorization header of the
 * provider's own host; it is never logged or put into an error message.
 */
import { ruCaFetch } from "../algopack-tls";
import { DEFAULT_BASE } from "../algopack";

export type KeyCheck = "ok" | "invalid" | "error";

async function call(url: string, headers: Record<string, string>, useRuCa = false): Promise<number> {
  try {
    const ctl = AbortSignal.timeout(12_000);
    const res = await (useRuCa ? ruCaFetch(url, { headers, signal: ctl, cache: "no-store" }) : fetch(url, { headers, signal: ctl, cache: "no-store" }));
    return res.status;
  } catch {
    return 0;
  }
}

async function callPost(url: string, headers: Record<string, string>, useRuCa = false): Promise<number> {
  try {
    const init = { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(12_000), cache: "no-store" as const };
    const res = await (useRuCa ? ruCaFetch(url, init) : fetch(url, init));
    return res.status;
  } catch {
    return 0;
  }
}

/** Twelve Data answers HTTP 200 with {code:401} for a bad key: read the body. */
async function checkTwelve(key: string): Promise<KeyCheck> {
  try {
    const res = await fetch(`https://api.twelvedata.com/api_usage?apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const j = (await res.json().catch(() => null)) as { code?: number; current_usage?: unknown; plan_category?: unknown } | null;
    if (res.status === 401 || res.status === 403 || j?.code === 401 || j?.code === 403) return "invalid";
    if (res.ok && j && (j.current_usage !== undefined || j.plan_category !== undefined)) return "ok";
    return "error";
  } catch {
    return "error";
  }
}

export async function checkKey(provider: string, key: string): Promise<KeyCheck> {
  let status = 0;
  if (provider === "algopack") {
    status = await call(`${DEFAULT_BASE}/engines.json?iss.meta=off`, { Authorization: `Bearer ${key}` }, true);
  } else if (provider === "tinvest") {
    status = await callPost("https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1/UsersService/GetAccounts", { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, true);
  } else if (provider === "twelvedata") {
    return checkTwelve(key);
  } else if (provider === "databento") {
    status = await call("https://hist.databento.com/v0/metadata.list_datasets", { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` });
  } else return "error";
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "invalid";
  return "error";
}
