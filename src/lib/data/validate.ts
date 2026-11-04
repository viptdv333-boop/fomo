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

export async function checkKey(provider: string, key: string): Promise<KeyCheck> {
  let status = 0;
  if (provider === "algopack") {
    status = await call(`${DEFAULT_BASE}/engines.json?iss.meta=off`, { Authorization: `Bearer ${key}` }, true);
  } else if (provider === "databento") {
    status = await call("https://hist.databento.com/v0/metadata.list_datasets", { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` });
  } else return "error";
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "invalid";
  return "error";
}
