// Telegram Bot API transport, shared by the legacy own-bot flow
// (src/lib/telegram.ts) and the site-bot notification channel
// (src/lib/notify-channels/telegram.ts). Next-free on purpose: it is also loaded
// from the custom server (server/*.ts), where next/headers must not be imported.
//
// api.telegram.org is blocked from Russian hosting (the VPS is in Moscow), so
// every call goes through TELEGRAM_API_BASE — a relay outside Russia that
// forwards /bot<token>/<method> to Telegram (e.g. a Cloudflare Worker).
// TELEGRAM_RELAY_SECRET, if set, is sent as x-relay-secret so the relay can
// refuse strangers. Unset → talks to Telegram directly (works outside RU).

export function tgApiBase(): string {
  return (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");
}

/// sendMessage is always called with parse_mode: "HTML" — any user/bot-authored
/// text interpolated into a message must be escaped first, or a stray `<`/`&`
/// makes Telegram reject the whole message as invalid markup.
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface TelegramApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

let proxyAgent: import("undici").ProxyAgent | undefined;

// Same idea as terminal-3's tg_publish.tg_proxies(): an HTTP proxy used ONLY
// for Telegram (not process-wide, so MOEX/Tinkoff keep going direct). On this
// server it's the local Xray→VLESS proxy, e.g. http://127.0.0.1:10809.
async function tgFetch(url: string, init: RequestInit & { signal: AbortSignal }): Promise<Response> {
  const proxy = process.env.TELEGRAM_PROXY || "";
  if (!proxy) return fetch(url, init);
  const { ProxyAgent, fetch: undiciFetch } = await import("undici");
  proxyAgent ??= new ProxyAgent(proxy);
  return (await undiciFetch(url, { ...(init as any), dispatcher: proxyAgent })) as unknown as Response;
}

export async function tgCall<T>(botToken: string, method: string, body?: object): Promise<TelegramApiResult<T>> {
  const relaySecret = process.env.TELEGRAM_RELAY_SECRET || "";
  const res = await tgFetch(`${tgApiBase()}/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(relaySecret ? { "x-relay-secret": relaySecret } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    // Without a cap a blocked route hangs the profile page's "Сохранить"
    // for minutes instead of failing fast.
    signal: AbortSignal.timeout(10000),
  });
  return res.json();
}
