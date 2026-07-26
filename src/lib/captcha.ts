const SERVER_KEY = process.env.SMARTCAPTCHA_SERVER_KEY;

/**
 * Yandex SmartCaptcha server-side validation.
 *
 * Rate limits and alias normalisation stop bulk automation, but not a
 * determined person cycling proxies. This is the gate that costs an attacker
 * real effort per account.
 *
 * Note the failure mode: if Yandex is unreachable, we let the request through.
 * A captcha service outage taking registration down with it is a worse outcome
 * than a short window where sign-ups are only protected by the other limits.
 */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<boolean> {
  // Not configured — nothing to check. Registration keeps working on the other
  // defences; see docs for the two keys this needs.
  if (!SERVER_KEY) return true;

  if (!token) return false;

  try {
    const url = new URL("https://smartcaptcha.yandexcloud.net/validate");
    url.searchParams.set("secret", SERVER_KEY);
    url.searchParams.set("token", token);
    url.searchParams.set("ip", ip);

    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error("SmartCaptcha validate returned", res.status);
      return true;
    }

    const data = (await res.json()) as { status?: string; message?: string };
    return data.status === "ok";
  } catch (error) {
    console.error("SmartCaptcha validate failed:", error);
    return true;
  }
}

/** Whether the widget should be rendered at all. */
export const CAPTCHA_ENABLED = Boolean(process.env.SMARTCAPTCHA_SERVER_KEY);
