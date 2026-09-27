import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode, generateCode } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { normalizeEmail, isDisposableEmail } from "@/lib/account-security";
import { verifyCaptcha } from "@/lib/captcha";
import { getT } from "@/lib/i18n/server";

export async function POST(req: NextRequest) {
  const { locale, t } = await getT();
  try {
    const { email, captchaToken } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: t("api.emailRequired") }, { status: 400 });
    }

    const ip = clientIp(req);

    // The gate that costs an attacker effort per account rather than per
    // thousand (self-hosted proof-of-work, see lib/captcha.ts).
    if (!(await verifyCaptcha(captchaToken, ip))) {
      return NextResponse.json(
        { error: t("api.captchaFailed") },
        { status: 400 }
      );
    }

    // Per-IP cap. The per-email limit below did nothing against a bot that
    // simply cycles addresses — one Gmail account yields unlimited aliases.
    const ipLimit = await rateLimit(`signup:ip:${ip}`, 5, 60 * 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: t("api.tooManySignups") },
        { status: 429 }
      );
    }

    if (isDisposableEmail(email)) {
      return NextResponse.json(
        { error: t("api.disposableEmail") },
        { status: 400 }
      );
    }

    // Aliases of an existing account are the same person. Compared on the
    // normalised form so `u.ser+bot@gmail.com` can't become a second member.
    const normalized = normalizeEmail(email);
    const approved = await prisma.user.findMany({
      where: { status: "APPROVED" },
      select: { email: true },
    });
    const alreadyTaken = approved.some((u) => normalizeEmail(u.email) === normalized);

    // Deliberately the same reply whether or not the address is taken. The old
    // "user already registered" message let anyone test a leaked address list
    // against the site and assemble a target list for password guessing.
    const genericOk = NextResponse.json({ message: t("api.codeSentTo", { email }) });
    if (alreadyTaken) return genericOk;

    const recentCode = await prisma.emailVerification.findFirst({
      where: {
        email,
        createdAt: { gt: new Date(Date.now() - 60000) },
      },
    });
    if (recentCode) {
      return NextResponse.json(
        { error: t("api.waitBeforeResend") },
        { status: 429 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.emailVerification.create({
      data: { email, code, expiresAt, purpose: "register" },
    });

    await sendVerificationCode(email, code, locale);

    return genericOk;
  } catch (error) {
    console.error("Send code error:", error);
    return NextResponse.json({ error: t("api.sendCodeFailed") }, { status: 500 });
  }
}
