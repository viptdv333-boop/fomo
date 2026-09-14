const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    Boolean(PUBLIC_KEY)
  );
}

// Web Push wants the VAPID key as a raw Uint8Array, but env vars can only
// carry the base64url string form — convert at the point of use.
function urlBase64ToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "denied" };

  const registration = await navigator.serviceWorker.ready;

  let subscription: PushSubscription;
  try {
    // The one call in this flow with no browser-chrome fallback if it fails
    // silently: pushManager.subscribe() talks to the browser's own push
    // registration service (Google's for Chrome) over the network, and a
    // rejection here used to propagate uncaught out of the caller, leaving
    // the toggle's on/off state stuck with zero feedback about why.
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!),
    });
  } catch (err) {
    return { ok: false, error: `subscribe:${err instanceof Error ? err.name + ":" + err.message : String(err)}` };
  }

  let res: Response;
  try {
    res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch (err) {
    await subscription.unsubscribe().catch(() => {});
    return { ok: false, error: `network:${err instanceof Error ? err.message : String(err)}` };
  }

  if (!res.ok) {
    await subscription.unsubscribe().catch(() => {});
    return { ok: false, error: `server:${res.status}` };
  }

  return { ok: true };
}

// Called on every app load for logged-in users. Three states to cover:
// browser already subscribed — re-POST to the server, because the DB row can
// be gone while the browser still holds the subscription (cleanup after a
// transient 404/410, or the original POST failed) and the endpoint upserts
// by endpoint so this is idempotent; no subscription + permission not yet
// decided — subscribeToPush() shows the native prompt; permission denied —
// subscribeToPush() no-ops without any prompt.
export async function ensurePushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  const existing = await getExistingPushSubscription().catch(() => null);
  if (existing) {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing.toJSON()),
    }).catch(() => {});
    return;
  }
  await subscribeToPush().catch(() => {});
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;

  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});

  await subscription.unsubscribe().catch(() => {});
}
