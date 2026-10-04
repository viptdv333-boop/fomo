/* One-off: registers the inbound webhooks of the notification bots.
   Run on the server after setting the env vars (see docs/notifications.md):
     set -a; . ./.env; set +a; npx tsx scripts/notify-setup-webhooks.ts
   Idempotent — safe to re-run. VK is configured by hand in the community settings (Callback API). */
import { tgCall } from "../src/lib/tg-transport";
import { maxApiBase, maxHeaders } from "../src/lib/notify-channels/max";

const SITE = (process.env.NOTIFY_PUBLIC_URL || "https://fomo.spot").replace(/\/+$/, "");

async function telegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return console.log("telegram: skipped (TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET not set)");
  const url = `${SITE}/api/notification-settings/webhooks/telegram`;
  const r = await tgCall(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "my_chat_member"],
    drop_pending_updates: false,
  });
  console.log("telegram setWebhook:", r.ok ? `ok -> ${url}` : `FAILED ${r.description}`);
  const info = await tgCall(token, "getWebhookInfo");
  console.log("telegram getWebhookInfo:", JSON.stringify(info.result ?? info));
}

async function max() {
  if (!process.env.MAX_BOT_TOKEN || !process.env.MAX_WEBHOOK_SECRET) return console.log("max: skipped (MAX_BOT_TOKEN / MAX_WEBHOOK_SECRET not set)");
  const url = `${SITE}/api/notification-settings/webhooks/max`;
  const res = await fetch(`${maxApiBase()}/subscriptions`, {
    method: "POST",
    headers: maxHeaders(),
    body: JSON.stringify({ url, update_types: ["bot_started", "message_created", "bot_stopped"], secret: process.env.MAX_WEBHOOK_SECRET }),
    signal: AbortSignal.timeout(15000),
  });
  console.log("max POST /subscriptions:", res.status, await res.text().catch(() => ""));
}

(async () => {
  await telegram();
  await max();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
