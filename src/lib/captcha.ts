import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

// Self-hosted proof-of-work captcha (Altcha-compatible payload). Nothing is
// loaded from third parties, so it works wherever the site itself opens
// (Cloudflare/Google widgets are throttled or blocked in RU and CN).
const SECRET =
  process.env.CAPTCHA_SECRET ||
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  randomBytes(32).toString("hex");

const MAX_NUMBER = 100_000;
const TTL_MS = 10 * 60 * 1000;

const used = new Map<string, number>();

function sweepUsed() {
  const now = Date.now();
  for (const [salt, exp] of used) if (exp < now) used.delete(salt);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sign = (challenge: string) => createHmac("sha256", SECRET).update(challenge).digest("hex");

export function createChallenge() {
  const expires = Date.now() + TTL_MS;
  const salt = `${randomBytes(12).toString("hex")}?expires=${expires}`;
  const number = randomInt(0, MAX_NUMBER + 1);
  const challenge = sha256(salt + number);
  return { algorithm: "SHA-256", challenge, salt, signature: sign(challenge), maxnumber: MAX_NUMBER };
}

export async function verifyCaptcha(token: string | undefined, _ip?: string): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  try {
    const p = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as {
      algorithm?: string;
      challenge?: string;
      salt?: string;
      signature?: string;
      number?: number;
    };
    if (p.algorithm !== "SHA-256" || !p.challenge || !p.salt || !p.signature) return false;
    if (typeof p.number !== "number" || !Number.isInteger(p.number) || p.number < 0 || p.number > MAX_NUMBER) return false;

    const expected = Buffer.from(sign(p.challenge));
    const given = Buffer.from(p.signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    if (sha256(p.salt + p.number) !== p.challenge) return false;

    const expires = Number(new URLSearchParams(p.salt.split("?")[1] ?? "").get("expires"));
    if (!expires || expires < Date.now()) return false;

    sweepUsed();
    if (used.has(p.salt)) return false;
    used.set(p.salt, expires);
    return true;
  } catch {
    return false;
  }
}
