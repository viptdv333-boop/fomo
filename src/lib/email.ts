import nodemailer from "nodemailer";

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "25"),
  secure: process.env.SMTP_SECURE === "true",
  ...(smtpUser && smtpPass ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
  tls: { rejectUnauthorized: false },
});

export async function sendVerificationCode(email: string, code: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"FOMO" <${process.env.SMTP_USER}>`,
    to: email,
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
  });
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
