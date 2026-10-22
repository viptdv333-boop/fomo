/**
 * Paid-channel tariff (SubscriptionTariff) input validation.
 *
 * Pure functions, no Node-only imports: the same code runs in the browser
 * (instant feedback next to the field) and in the API routes (the only
 * validation that is trusted). Errors are { field, code, vars }; the text is
 * the i18n key `api.tariffErr.<code>` (ru / en / cn), see tariffErrorKey().
 *
 * Why these limits:
 *  - durationDays 1..365: Subscription.durationDays / extendedEnd() in
 *    subscription-renew.ts accept 1..365; there is NO minimum of 30 — a weekly
 *    (7-day) tariff is valid by design.
 *  - price: Prisma Decimal(10,2) => at most 99 999 999.99.
 *  - name: stored as "<channel name>: <tariff name>", up to 100 chars.
 */

export const TARIFF_DAYS_MIN = 1;
export const TARIFF_DAYS_MAX = 365;
export const TARIFF_PRICE_MAX = 99_999_999.99;
export const TARIFF_NAME_MAX = 100;
export const TARIFF_DESCRIPTION_MAX = 500;
export const TARIFF_METHODS_MAX = 20;

export type TariffField =
  | "name"
  | "description"
  | "price"
  | "durationDays"
  | "paymentMethods"
  | "cardNumber"
  | "sbpQrUrl"
  | "yukassaShopId"
  | "yukassaSecret"
  | "avatarUrl"
  | "instrumentIds"
  | "isActive";

export type TariffErrorCode =
  | "nameRequired"
  | "nameTooLong"
  | "nameTaken"
  | "descriptionTooLong"
  | "priceInvalid"
  | "priceTooHigh"
  | "daysInvalid"
  | "daysRange"
  | "methodsRequired"
  | "methodsInvalid"
  | "methodUnknown"
  | "methodLinkMissing"
  | "fieldTooLong"
  | "invalidData"
  | "saveFailed";

export interface TariffError {
  field: TariffField | null;
  code: TariffErrorCode;
  vars?: Record<string, string | number>;
}

export const tariffErrorKey = (code: TariffErrorCode) => `api.tariffErr.${code}`;

/** Normal form of a tariff name for "already taken" checks: trimmed, single spaces, case-insensitive. */
export function tariffNameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

const PLAIN_METHOD = /^(card|yukassa|sbp|crypto)$/;
const LINK_METHOD = /^link(:[A-Za-z0-9_-]{1,64})?$/;

export interface TariffData {
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  paymentMethods: string[];
  cardNumber: string | null;
  sbpQrUrl: string | null;
  yukassaShopId: string | null;
  yukassaSecret: string | null;
  avatarUrl: string | null;
  instrumentIds: string[];
  isActive: boolean;
}

/** Fields present in a PATCH body (everything optional) or complete (POST, with defaults). */
export type TariffPatch = Partial<TariffData>;

export type TariffResult<T> = { ok: true; data: T } | { ok: false; error: TariffError };

const fail = (field: TariffField | null, code: TariffErrorCode, vars?: Record<string, string | number>): { ok: false; error: TariffError } => ({
  ok: false,
  error: { field, code, vars },
});

/** null / undefined / "" => null; a string => trimmed; anything else => undefined (invalid). */
function optString(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s === "" ? null : s.length > max ? undefined : s;
}

export function validateTariffName(raw: unknown): TariffResult<string> {
  if (typeof raw !== "string" || raw.trim() === "") return fail("name", "nameRequired");
  const name = raw.trim();
  if (name.length > TARIFF_NAME_MAX) return fail("name", "nameTooLong", { max: TARIFF_NAME_MAX });
  return { ok: true, data: name };
}

export function validateTariffPrice(raw: unknown): TariffResult<number> {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return fail("price", "priceInvalid");
  if (n > TARIFF_PRICE_MAX) return fail("price", "priceTooHigh", { max: TARIFF_PRICE_MAX });
  return { ok: true, data: Math.round(n * 100) / 100 };
}

export function validateTariffDays(raw: unknown): TariffResult<number> {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    return fail("durationDays", "daysInvalid", { min: TARIFF_DAYS_MIN, max: TARIFF_DAYS_MAX });
  }
  if (n < TARIFF_DAYS_MIN || n > TARIFF_DAYS_MAX) {
    return fail("durationDays", "daysRange", { min: TARIFF_DAYS_MIN, max: TARIFF_DAYS_MAX });
  }
  return { ok: true, data: n };
}

/**
 * Syntax check of the methods list. Existence of "link:<id>" methods in the DB is
 * checked on the server (payment-link-server.ts). An empty list is an error for an
 * active tariff: nobody could pay it.
 */
export function validateTariffMethodList(raw: unknown, requireOne: boolean): TariffResult<string[]> {
  if (!Array.isArray(raw) || raw.length > TARIFF_METHODS_MAX) return fail("paymentMethods", "methodsInvalid");
  const out: string[] = [];
  for (const m of raw) {
    if (typeof m !== "string") return fail("paymentMethods", "methodsInvalid");
    if (!PLAIN_METHOD.test(m) && !LINK_METHOD.test(m)) return fail("paymentMethods", "methodUnknown");
    if (!out.includes(m)) out.push(m);
  }
  if (requireOne && out.length === 0) return fail("paymentMethods", "methodsRequired");
  return { ok: true, data: out };
}

/**
 * Validates a tariff body. mode "create": name / price / durationDays are required,
 * the rest gets defaults (paymentMethods defaults to ["card"] only when omitted — an
 * explicit empty list is an error). mode "patch": only the present keys are checked
 * and returned. `null` is accepted wherever the column is nullable (the editor sends
 * null for "not set").
 */
export function parseTariffInput(body: unknown, mode: "create"): TariffResult<TariffData>;
export function parseTariffInput(body: unknown, mode: "patch"): TariffResult<TariffPatch>;
export function parseTariffInput(body: unknown, mode: "create" | "patch"): TariffResult<TariffPatch> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(null, "invalidData");
  const b = body as Record<string, unknown>;
  const has = (k: string) => b[k] !== undefined;
  const create = mode === "create";
  const out: TariffPatch = {};

  if (create || has("name")) {
    const r = validateTariffName(b.name);
    if (!r.ok) return r;
    out.name = r.data;
  }
  if (create || has("price")) {
    const r = validateTariffPrice(b.price);
    if (!r.ok) return r;
    out.price = r.data;
  }
  if (create || has("durationDays")) {
    const r = validateTariffDays(b.durationDays);
    if (!r.ok) return r;
    out.durationDays = r.data;
  }

  if (has("description")) {
    const d = optString(b.description, TARIFF_DESCRIPTION_MAX);
    if (d === undefined) return fail("description", "descriptionTooLong", { max: TARIFF_DESCRIPTION_MAX });
    out.description = d;
  } else if (create) out.description = null;

  const isActive = has("isActive") ? b.isActive : true;
  if (typeof isActive !== "boolean") return fail("isActive", "invalidData");
  if (create || has("isActive")) out.isActive = isActive;

  if (has("paymentMethods")) {
    const r = validateTariffMethodList(b.paymentMethods, isActive !== false);
    if (!r.ok) return r;
    out.paymentMethods = r.data;
  } else if (create) out.paymentMethods = ["card"];

  const strFields: [TariffField, number][] = [
    ["cardNumber", 30],
    ["sbpQrUrl", 500],
    ["yukassaShopId", 50],
    ["yukassaSecret", 200],
    ["avatarUrl", 1000],
  ];
  for (const [k, max] of strFields) {
    if (has(k)) {
      const v = optString(b[k], max);
      if (v === undefined) return fail(k, "fieldTooLong", { max });
      (out as Record<string, unknown>)[k] = v;
    } else if (create) (out as Record<string, unknown>)[k] = null;
  }

  if (has("instrumentIds")) {
    const ids = b.instrumentIds;
    if (!Array.isArray(ids) || ids.length > 50 || ids.some((x) => typeof x !== "string")) return fail("instrumentIds", "invalidData");
    out.instrumentIds = ids as string[];
  } else if (create) out.instrumentIds = [];

  return { ok: true, data: out };
}
