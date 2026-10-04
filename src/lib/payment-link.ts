/**
 * "Оплата по ссылке" — payment method type "link".
 *
 * An author pastes a payment URL from any external service (YooMoney, T-Bank,
 * CloudTips, Boosty, PayPal.me, Stripe Payment Link ...). The buyer opens it in
 * a new tab, pays there, then confirms with a receipt screenshot; the author
 * verifies manually (same flow as card / SBP). Access is NEVER granted on a
 * link click.
 *
 * Pure functions, no Node-only imports: the same validator runs in the browser
 * (instant feedback) and on the server (the only one that is trusted).
 */

export const PAYMENT_LINK_MAX_URL = 500;
export const PAYMENT_LINK_MAX_INSTRUCTION = 300;
export const PAYMENT_LINK_MAX_LABEL = 60;

export type PayLinkErrorCode =
  | "empty"
  | "too_long"
  | "invalid"
  | "not_https"
  | "credentials"
  | "bad_host"
  | "private_host"
  | "bad_port"
  | "instruction_too_long";

/** Russian texts for API responses (the client maps codes to i18n keys `pay.link.err.<code>`). */
export const PAYMENT_LINK_ERRORS_RU: Record<PayLinkErrorCode, string> = {
  empty: "Укажите ссылку на оплату",
  too_long: `Ссылка слишком длинная (максимум ${PAYMENT_LINK_MAX_URL} символов)`,
  invalid: "Некорректная ссылка. Вставьте полный адрес, например https://yoomoney.ru/...",
  not_https: "Разрешены только ссылки https:// (http://, javascript: и другие схемы запрещены)",
  credentials: "Ссылка не должна содержать логин и пароль (user:pass@)",
  bad_host: "Недопустимый адрес сайта. Нужен обычный домен, например yoomoney.ru",
  private_host: "Локальные адреса и IP-адреса не допускаются",
  bad_port: "Нестандартные порты не допускаются",
  instruction_too_long: `Инструкция слишком длинная (максимум ${PAYMENT_LINK_MAX_INSTRUCTION} символов)`,
};

export type PayLinkResult =
  | { ok: true; url: string; host: string }
  | { ok: false; code: PayLinkErrorCode };

const BLOCKED_SUFFIXES = [
  ".localhost", ".local", ".localdomain", ".internal", ".intranet", ".lan", ".home", ".corp", ".private", ".test", ".invalid", ".example", ".home.arpa",
];

/** Hostname after WHATWG normalisation (lowercase, punycode, decimal/hex IPv4 already turned into dotted quad). */
function hostIssue(hostname: string): PayLinkErrorCode | null {
  let h = hostname.toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (!h) return "bad_host";
  // IPv6 literal (URL keeps the brackets) or anything with a colon
  if (h.startsWith("[") || h.includes(":")) return "private_host";
  // IPv4 literal in any form — after normalisation it is dotted quad
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return "private_host";
  if (h === "localhost" || BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return "private_host";
  // Only real DNS names: at least two labels, LDH characters, alphabetic/punycode TLD
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return "bad_host";
  const tld = h.slice(h.lastIndexOf(".") + 1);
  if (/^\d+$/.test(tld) || tld.length < 2) return "bad_host";
  if (h.length > 253) return "bad_host";
  return null;
}

/** Validates and normalises a payment URL. Never throws. */
export function validatePaymentLink(input: unknown): PayLinkResult {
  if (typeof input !== "string") return { ok: false, code: "invalid" };
  const raw = input.trim();
  if (!raw) return { ok: false, code: "empty" };
  if (raw.length > PAYMENT_LINK_MAX_URL) return { ok: false, code: "too_long" };
  // whitespace / control characters inside a URL are never legitimate (and enable tricks)
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\u2028\u2029]/.test(raw)) return { ok: false, code: "invalid" };

  // Scheme check on the raw text first so "javascript:..." / "data:..." / "http://" get the precise message.
  const scheme = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!scheme) return { ok: false, code: "invalid" };
  if (scheme[1].toLowerCase() !== "https") return { ok: false, code: "not_https" };

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (u.protocol !== "https:") return { ok: false, code: "not_https" };
  if (u.username || u.password) return { ok: false, code: "credentials" };
  // Reject "https://user@host" written with an encoded @ as well
  if (/^https:\/\/[^/?#]*@/i.test(raw)) return { ok: false, code: "credentials" };
  if (u.port && u.port !== "443") return { ok: false, code: "bad_port" };
  const issue = hostIssue(u.hostname);
  if (issue) return { ok: false, code: issue };

  const url = u.toString();
  if (url.length > PAYMENT_LINK_MAX_URL) return { ok: false, code: "too_long" };
  return { ok: true, url, host: paymentLinkHost(url) };
}

/** Host to show in the UI: "yoomoney.ru" (no www., no port). Empty string when unparsable. */
export function paymentLinkHost(url: unknown): string {
  if (typeof url !== "string") return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Strips control chars, normalises newlines, trims. Does not truncate. */
export function sanitizeInstruction(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type LinkDetailsResult =
  | { ok: true; details: { url: string; instruction?: string }; host: string }
  | { ok: false; code: PayLinkErrorCode };

/** Validates the `details` JSON of a PaymentMethod of type "link" and returns the canonical shape. */
export function normalizeLinkDetails(details: unknown): LinkDetailsResult {
  const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
  const link = validatePaymentLink(d.url);
  if (!link.ok) return link;
  const instruction = sanitizeInstruction(d.instruction);
  if (instruction.length > PAYMENT_LINK_MAX_INSTRUCTION) return { ok: false, code: "instruction_too_long" };
  return {
    ok: true,
    host: link.host,
    details: instruction ? { url: link.url, instruction } : { url: link.url },
  };
}

// ---- tariff.paymentMethods entries ----------------------------------------
// A tariff may accept several of the author's link methods, so the String[]
// holds "link:<PaymentMethod.id>" entries (no schema change). A bare "link"
// is tolerated and means "all of the author's link methods".

const LINK_REF_RE = /^link(?::([A-Za-z0-9_-]{1,64}))?$/;

export function isLinkRef(entry: unknown): entry is string {
  return typeof entry === "string" && LINK_REF_RE.test(entry);
}

/** "link:abc" -> "abc", "link" -> null (all), anything else -> undefined. */
export function linkRefId(entry: string): string | null | undefined {
  const m = LINK_REF_RE.exec(entry);
  if (!m) return undefined;
  return m[1] ?? null;
}

export function linkRef(paymentMethodId: string): string {
  return `link:${paymentMethodId}`;
}

/** Does a tariff's method list reference link payments at all? */
export function hasLinkRef(methods: readonly string[] | null | undefined): boolean {
  return !!methods && methods.some((m) => isLinkRef(m));
}

/** Public, buyer-facing shape of an author's link method. */
export interface PublicPayLink {
  id: string;
  label: string;
  url: string;
  host: string;
  instruction: string;
}
