const SECRET = process.env.HCAPTCHA_SECRET;

/**
 * hCaptcha server-side validation.
 *
 * Rate limits and alias normalisation stop bulk automation, but not a
 * determined person cycling proxies. This is the gate that costs an attacker
 * real effort per account.
 *
 * Note the failure mode: if hCaptcha is unreachable, we let the request
 * through. A captcha service outage taking registration down with it is a
 * worse outcome than a short window where sign-ups are only protected by the
 * other limits.
 */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<boolean> {
  // Not configured — nothing to check. Registration keeps working on the other
  // defences; see .env.example for the two keys this needs.
  if (!SECRET) return true;

  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret: SECRET, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error("hCaptcha siteverify returned", res.status);
      return true;
    }

    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) {
      console.warn("hCaptcha rejected token:", data["error-codes"]);
    }
    return data.success === true;
  } catch (error) {
    console.error("hCaptcha siteverify failed:", error);
    return true;
  }
}

/** Whether the widget should be rendered at all. */
export const CAPTCHA_ENABLED = Boolean(process.env.HCAPTCHA_SECRET);
