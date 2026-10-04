import { createHmac, randomUUID } from "node:crypto";
import { assertResolvesPublic, safeLookup, validateOutboundUrl } from "@/lib/ssrf";
import { absoluteAsset } from "@/lib/notify-text";
import { absoluteLink, errMsg, suppressedNote, SEND_TIMEOUT_MS, type AdapterDeps, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/**
 * Generic webhook: the user's own HTTPS URL gets a signed JSON POST.
 *   X-Fomo-Timestamp: <unix seconds>
 *   X-Fomo-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 * The JSON also carries `text` (Slack-compatible) and `content` (Discord-compatible),
 * so a Slack/Discord incoming-webhook URL works as-is, while Zapier/Make/own
 * services can verify the signature.
 * SSRF-safe: https only, DNS name only (no IP literals), ports 443/8443, host must
 * resolve to public addresses (checked before sending AND at connect time),
 * no redirects, 8 s timeout.
 */

export function isConfigured(): boolean {
  return true; // needs nothing from the admin
}

export function sign(secret: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function buildWebhookBody(msg: ChannelMessage, now: number = Date.now()) {
  const link = absoluteLink(msg.link, msg.locale);
  const note = suppressedNote(msg);
  const text = [msg.title, msg.body ?? "", link ?? "", note].filter(Boolean).join("\n");
  return {
    event: "notification",
    id: randomUUID(),
    ts: Math.floor(now / 1000),
    title: msg.title,
    body: msg.body ?? "",
    // Additive: the FULL text of the item ("" when the notification has none or this recipient
    // may not read it), its author and picture URLs. `body`/`text`/`content` keep the short form.
    fullText: msg.fullText ?? "",
    author: msg.author ?? null,
    images: msg.fullText ? (msg.images ?? []).map(absoluteAsset).filter((u): u is string => Boolean(u)) : [],
    link: link ?? null,
    locale: msg.locale,
    suppressed: msg.suppressed ?? 0,
    text,
    content: text.slice(0, 1900), // Discord rejects > 2000 chars
  };
}

let safeAgent: unknown;
async function undiciSafeFetch(url: string, init: RequestInit): Promise<Response> {
  const { Agent, fetch: undiciFetch } = await import("undici");
  safeAgent ??= new Agent({ connect: { lookup: safeLookup as any } });
  return (await undiciFetch(url, { ...(init as any), dispatcher: safeAgent as any })) as unknown as Response;
}

export async function send(row: ChannelRowLite, msg: ChannelMessage, deps?: AdapterDeps): Promise<SendResult> {
  if (!row.address) return { ok: false, error: "no url", permanent: true };
  const check = validateOutboundUrl(row.address);
  if (!check.ok) return { ok: false, error: `url rejected: ${check.reason}`, permanent: true };
  if (!row.secret) return { ok: false, error: "no signing secret", permanent: true };

  // Resolve first and refuse a host that points inside our network. Resolution is
  // repeated at connect time by safeLookup (DNS rebinding) when the default
  // fetch is used; tests inject their own fetch + lookup.
  const resolved = await assertResolvesPublic(check.url.hostname, deps?.lookup);
  if (!resolved.ok) return { ok: false, error: `url rejected: ${resolved.reason}`, permanent: resolved.reason !== "dns_failed" };

  const body = JSON.stringify(buildWebhookBody(msg, deps?.now ? deps.now() : Date.now()));
  const timestamp = String(Math.floor((deps?.now ? deps.now() : Date.now()) / 1000));
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "FOMO-Notifications/1.0",
      "X-Fomo-Timestamp": timestamp,
      "X-Fomo-Signature": sign(row.secret, timestamp, body),
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  };
  try {
    const res = await (deps?.fetch ? deps.fetch(check.url.toString(), init) : undiciSafeFetch(check.url.toString(), init));
    if (res.status >= 200 && res.status < 300) return { ok: true };
    if (res.status >= 300 && res.status < 400) return { ok: false, error: `redirect ${res.status} not followed`, permanent: true };
    // 404/410: the hook was deleted on the other side. Other 4xx may be a transient quota.
    return { ok: false, error: `HTTP ${res.status}`, permanent: res.status === 404 || res.status === 410 };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}
