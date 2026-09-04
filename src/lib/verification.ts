import { prisma } from "@/lib/prisma";
import { MAX_CODE_ATTEMPTS } from "@/lib/account-security";

/**
 * Single place where an emailed code is checked.
 *
 * Every route used to do its own `findFirst` and return a plain 400 on a miss,
 * with nothing counting the misses — a six-digit secret with a fifteen-minute
 * life and unlimited guesses. Now a wrong guess is recorded against the newest
 * live code for that address, and the code is burned once the cap is reached.
 */

export type CodePurpose = "register" | "reset_password" | "change_email";

export type CodeCheck =
  | { ok: true; verificationId: string }
  | { ok: false; error: string; status: number };

export async function consumeCode(
  email: string,
  code: string,
  purpose: CodePurpose
): Promise<CodeCheck> {
  const match = await prisma.emailVerification.findFirst({
    where: { email, code, purpose, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (match) {
    await prisma.emailVerification.update({
      where: { id: match.id },
      data: { used: true },
    });
    return { ok: true, verificationId: match.id };
  }

  // Wrong code: charge the attempt to whichever code is currently live for this
  // address AND purpose, so guessing burns the real one rather than costing
  // nothing (and doesn't spuriously burn attempts on an unrelated flow's code).
  const live = await prisma.emailVerification.findFirst({
    where: { email, purpose, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (live) {
    const attempts = live.attempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await prisma.emailVerification.update({
        where: { id: live.id },
        data: { attempts, used: true },
      });
      return {
        ok: false,
        error: "Слишком много неверных попыток. Запросите новый код",
        status: 429,
      };
    }
    await prisma.emailVerification.update({
      where: { id: live.id },
      data: { attempts },
    });
  }

  return { ok: false, error: "Неверный или просроченный код подтверждения", status: 400 };
}
