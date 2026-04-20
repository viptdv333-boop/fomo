const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "FOMO <no-reply@fomo.spot>";
const BASE_URL = process.env.NEXTAUTH_URL || "https://fomo.spot";

export async function sendVerificationCode(email: string, code: string) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: "Код подтверждения FOMO",
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 16px;">
          <h2 style="text-align: center; color: #111; margin-bottom: 8px;">FOMO</h2>
          <p style="text-align: center; color: #666; font-size: 14px;">Ваш код подтверждения:</p>
          <div style="text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111; margin: 24px 0; padding: 16px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
            ${code}
          </div>
          <p style="text-align: center; color: #999; font-size: 12px;">Код действителен 15 минут</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    console.error("Resend error:", error);
    throw new Error("Failed to send email");
  }

  return await res.json();
}

export async function sendBroadcastEmail(email: string, title: string, body: string | null, link: string | null) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const linkHtml = link
    ? `<p style="text-align: center; margin-top: 24px;"><a href="${link.startsWith("http") ? link : BASE_URL + link}" style="display: inline-block; padding: 12px 32px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Перейти</a></p>`
    : "";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: title,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 16px;">
          <h2 style="text-align: center; color: #111; margin-bottom: 16px;">FOMO</h2>
          <h3 style="color: #111; margin-bottom: 8px;">${title}</h3>
          ${body ? `<p style="color: #444; font-size: 15px; line-height: 1.6;">${body.replace(/\n/g, "<br>")}</p>` : ""}
          ${linkHtml}
          <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
          <p style="text-align: center; color: #999; font-size: 11px; margin-top: 16px;">
            Вы получили это письмо, потому что зарегистрированы на <a href="${BASE_URL}" style="color: #16a34a;">fomo.spot</a>
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    console.error("Resend broadcast error:", error);
    return false;
  }
  return true;
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
