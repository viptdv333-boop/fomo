/**
 * Rules that keep one person from turning into a hundred accounts, and keep
 * passwords above the floor where online guessing works.
 */

/**
 * Collapses the aliases that resolve to one real mailbox.
 *
 * Gmail ignores dots and everything after a `+`, so `u.ser+1@gmail.com` and
 * `user@gmail.com` are the same inbox — which is how a single address was able
 * to pass registration an unlimited number of times. Stored addresses stay
 * untouched; this is only used to decide whether two of them are the same
 * person.
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);

  // Dots are only insignificant at Google-run domains.
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    return `${local}@gmail.com`;
  }

  return `${local}@${domain}`;
}

/** Throwaway mailbox providers — signing up through one is not a real account. */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "getnada.com",
  "trashmail.com", "sharklasers.com", "grr.la", "maildrop.cc",
  "dispostable.com", "fakeinbox.com", "mailnesia.com", "mytemp.email",
  "emailondeck.com", "moakt.com", "tempr.email", "spamgourmet.com",
  "mail.tm", "temp-mail.io", "1secmail.com", "harakirimail.com",
  "vipmail.ru", "mail-temp.com", "inboxkitten.com", "burnermail.io",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return DISPOSABLE_DOMAINS.has(domain);
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * The passwords that turn up first in every credential-stuffing list. A short
 * blocklist is not a substitute for a breach database, but it removes the
 * handful that account for most of the easy takeovers.
 */
const COMMON_PASSWORDS = new Set([
  "password", "12345678", "123456789", "1234567890", "qwerty123", "password1",
  "password123", "111111111", "123123123", "qwertyui", "iloveyou", "admin123",
  "welcome1", "abc12345", "1q2w3e4r", "qazwsxedc", "zxcvbnm1", "trustno1",
  "letmein1", "monkey12", "dragon12", "sunshine", "princess", "football",
  "baseball", "superman", "starwars", "whatever", "computer", "internet",
  "йцукенг", "пароль123", "qwerty12", "asdfghjk", "11223344", "00000000",
]);

export interface PasswordCheck {
  ok: boolean;
  error?: string;
}

export function checkPassword(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, error: "Этот пароль слишком распространён — придумайте другой" };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, error: "Пароль не может состоять из одного повторяющегося символа" };
  }
  return { ok: true };
}

/** How many wrong guesses a verification code survives before it is burned. */
export const MAX_CODE_ATTEMPTS = 5;
