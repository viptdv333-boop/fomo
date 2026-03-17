const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "FOMO <no-reply@fomo.broker>";

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

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
