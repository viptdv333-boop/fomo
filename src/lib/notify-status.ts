/** Browser-safe helpers for the channel cards (no Node imports). */

export type ChannelStatus = "not_configured" | "not_connected" | "pending" | "connected" | "paused" | "error";

/**
 * not_configured — the admin has not set the env vars for this channel (never for Telegram:
 *                  it runs on the user's own bot, no env needed);
 * not_connected  — the user has no row; pending — waiting for the code / the
 * deep-link tap; connected — verified and on; paused — verified but switched off
 * (by the user, or by the dispatcher after repeated hard failures: then lastError is set);
 * error — verified & on, but the last delivery failed.
 */
export function channelStatus(
  configured: boolean,
  row: { verified: boolean; enabled: boolean; lastError: string | null } | null
): ChannelStatus {
  if (!configured) return "not_configured";
  if (!row) return "not_connected";
  if (!row.verified) return "pending";
  if (!row.enabled) return "paused";
  return row.lastError ? "error" : "connected";
}

/** "a***@gmail.com", "+7•••••1234", "chat •••123" — never show a full address back in the list. */
export function maskAddress(channel: string, address: string | null): string | null {
  if (!address) return null;
  if (channel === "email") {
    const [local, domain] = address.split("@");
    if (!domain) return "•••";
    return `${local.slice(0, 1)}***@${domain}`;
  }
  if (channel === "whatsapp") return `+${address.slice(0, 2)}•••••${address.slice(-3)}`;
  if (channel === "webhook") {
    try {
      const u = new URL(address);
      return `${u.protocol}//${u.hostname}/•••`;
    } catch {
      return "•••";
    }
  }
  return `•••${address.slice(-3)}`;
}
