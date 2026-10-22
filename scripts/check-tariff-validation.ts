/* Paid-channel tariff validation (src/lib/tariff-validation.ts), shared by the editor and the API routes.
   Regression: a new tariff added in the channel editor (weekly, 1000 RUB, one payment method) failed with the generic
   «Ошибка создания тарифа» because the editor sends `null` for unused columns and the old zod schema rejected null.
   Run: npx tsx scripts/check-tariff-validation.ts   (exit code 1 on a failed assertion) */
import { z } from "zod/v4";
import {
  TARIFF_DAYS_MAX,
  TARIFF_DAYS_MIN,
  TARIFF_NAME_MAX,
  TARIFF_PRICE_MAX,
  parseTariffInput,
  tariffErrorKey,
  tariffNameKey,
  validateTariffDays,
  validateTariffMethodList,
  type TariffErrorCode,
} from "../src/lib/tariff-validation";
import { isValidCustomFomoId } from "../src/lib/fomoId";
import { DICTIONARIES, translate } from "../src/lib/i18n/dictionaries";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const code = (r: { ok: boolean; error?: { code: string; field: string | null } }) => (r.ok ? "OK" : `${r.error!.field}:${r.error!.code}`);
const create = (b: unknown) => code(parseTariffInput(b, "create") as any);
const patch = (b: unknown) => code(parseTariffInput(b, "patch") as any);

// The body the channel editor (channels/edit/[id]) sends for «Тариф 2»: Неделя, 1000 RUB, 7 days, one card method, active.
// Unused columns are null, the channel description is empty => null.
const editorBody = {
  name: "Мой канал: Неделя",
  description: null,
  price: 1000,
  durationDays: 7,
  paymentMethods: ["card"],
  cardNumber: "2200123456782977",
  sbpQrUrl: null,
  yukassaShopId: null,
  yukassaSecret: null,
  avatarUrl: null,
  instrumentIds: [],
  isActive: true,
};

// ---- root cause: the previous POST schema rejected the editor's nulls ----
const legacySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive(),
  durationDays: z.number().int().min(1).max(365),
  cardNumber: z.string().max(30).optional(),
  sbpQrUrl: z.string().max(500).nullable().optional(),
  yukassaShopId: z.string().max(50).optional(),
  yukassaSecret: z.string().max(200).optional(),
  avatarUrl: z.string().optional().nullable(),
});
const legacy = legacySchema.safeParse(editorBody);
eq("legacy zod schema rejected the editor body (null description / yukassaShopId / yukassaSecret)", legacy.success, false);
eq(
  "legacy rejection paths",
  legacy.success ? [] : legacy.error.issues.map((i) => i.path.join(".")).sort(),
  ["description", "yukassaSecret", "yukassaShopId"],
);
eq("the same body with only the legacy-optional fields dropped passes the legacy schema (so 7 days was never the problem)", legacySchema.safeParse({ ...editorBody, description: undefined, yukassaShopId: undefined, yukassaSecret: undefined }).success, true);

// ---- the screenshot's input passes now ----
eq("weekly 7 days / 1000 RUB / one card method", create(editorBody), "OK");
const parsed = parseTariffInput(editorBody, "create");
eq("parsed data: 7 days, 1000, ['card'], nulls kept as null", parsed.ok && [parsed.data.durationDays, parsed.data.price, parsed.data.paymentMethods, parsed.data.description, parsed.data.yukassaShopId], [7, 1000, ["card"], null, null]);
eq("weekly tariff with a payment-link method", create({ ...editorBody, paymentMethods: ["link:cmabc123"] }), "OK");
eq("weekly tariff with link + card", create({ ...editorBody, paymentMethods: ["card", "link:cmabc123", "card"] }), "OK");
eq("duplicate methods are collapsed", parsed.ok && parseTariffInput({ ...editorBody, paymentMethods: ["card", "card"] }, "create").ok && (parseTariffInput({ ...editorBody, paymentMethods: ["card", "card"] }, "create") as any).data.paymentMethods, ["card"]);
eq("minimal body (profile TariffManager): methods default to ['card']", (parseTariffInput({ name: "Базовый", price: 500, durationDays: 30 }, "create") as any).data.paymentMethods, ["card"]);

// ---- durationDays boundaries: 1..365, no minimum of 30 ----
eq("days range constants", [TARIFF_DAYS_MIN, TARIFF_DAYS_MAX], [1, 365]);
for (const [d, want] of [
  [0, "durationDays:daysRange"],
  [1, "OK"],
  [7, "OK"],
  [14, "OK"],
  [30, "OK"],
  [365, "OK"],
  [366, "durationDays:daysRange"],
  [-7, "durationDays:daysRange"],
  [7.5, "durationDays:daysInvalid"],
  [NaN, "durationDays:daysInvalid"],
  [null, "durationDays:daysInvalid"],
  [undefined, "durationDays:daysInvalid"],
  ["7", "OK"],
  ["", "durationDays:daysInvalid"],
  ["abc", "durationDays:daysInvalid"],
] as const) {
  eq(`days ${JSON.stringify(d)} -> ${want}`, code(validateTariffDays(d) as any), want);
}
eq("days error carries min/max for the text", (validateTariffDays(366) as any).error.vars, { min: 1, max: 365 });

// ---- price ----
for (const [p, want] of [
  [0, "price:priceInvalid"],
  [-1, "price:priceInvalid"],
  [0.01, "OK"],
  [1000, "OK"],
  [TARIFF_PRICE_MAX, "OK"],
  [TARIFF_PRICE_MAX + 1, "price:priceTooHigh"],
  [1e12, "price:priceTooHigh"],
  [NaN, "price:priceInvalid"],
  [Infinity, "price:priceInvalid"],
  [null, "price:priceInvalid"],
  [undefined, "price:priceInvalid"],
  ["1000", "OK"],
  ["", "price:priceInvalid"],
] as const) {
  eq(`price ${JSON.stringify(p)} -> ${want}`, create({ ...editorBody, price: p }), want);
}
eq("price rounds to kopecks", (parseTariffInput({ ...editorBody, price: 99.999 }, "create") as any).data.price, 100);

// ---- name ----
eq("name empty", create({ ...editorBody, name: "   " }), "name:nameRequired");
eq("name missing", create({ ...editorBody, name: undefined }), "name:nameRequired");
eq(`name ${TARIFF_NAME_MAX} chars`, create({ ...editorBody, name: "я".repeat(TARIFF_NAME_MAX) }), "OK");
eq(`name ${TARIFF_NAME_MAX + 1} chars`, create({ ...editorBody, name: "я".repeat(TARIFF_NAME_MAX + 1) }), "name:nameTooLong");
eq("name is trimmed", (parseTariffInput({ ...editorBody, name: "  Канал: Неделя " }, "create") as any).data.name, "Канал: Неделя");
eq("description 500 ok / 501 too long", [create({ ...editorBody, description: "a".repeat(500) }), create({ ...editorBody, description: "a".repeat(501) })], ["OK", "description:descriptionTooLong"]);
eq("empty description becomes null", (parseTariffInput({ ...editorBody, description: "  " }, "create") as any).data.description, null);

// ---- payment methods ----
eq("no methods on an active tariff", create({ ...editorBody, paymentMethods: [] }), "paymentMethods:methodsRequired");
eq("no methods on an inactive tariff (draft) is allowed", create({ ...editorBody, paymentMethods: [], isActive: false }), "OK");
eq("methods not an array", create({ ...editorBody, paymentMethods: "card" }), "paymentMethods:methodsInvalid");
eq("methods with a non-string", create({ ...editorBody, paymentMethods: [1] }), "paymentMethods:methodsInvalid");
eq("unknown method", create({ ...editorBody, paymentMethods: ["paypal"] }), "paymentMethods:methodUnknown");
eq("malformed link ref", create({ ...editorBody, paymentMethods: ["link:a b"] }), "paymentMethods:methodUnknown");
eq("21 methods", create({ ...editorBody, paymentMethods: Array.from({ length: 21 }, (_, i) => `link:m${i}`) }), "paymentMethods:methodsInvalid");
eq("validateTariffMethodList(requireOne=false) allows []", code(validateTariffMethodList([], false) as any), "OK");
eq("isActive must be boolean", create({ ...editorBody, isActive: "yes" }), "isActive:invalidData");
eq("card number too long", create({ ...editorBody, cardNumber: "1".repeat(31) }), "cardNumber:fieldTooLong");
eq("body is not an object", [create(null), create([]), create("x")], ["null:invalidData", "null:invalidData", "null:invalidData"]);

// ---- PATCH: only present keys are checked ----
eq("patch: only isActive", patch({ isActive: false }), "OK");
eq("patch: only duration 7", patch({ durationDays: 7 }), "OK");
eq("patch: duration 0", patch({ durationDays: 0 }), "durationDays:daysRange");
eq("patch: price 0", patch({ price: 0 }), "price:priceInvalid");
eq("patch: methods [] for an active tariff", patch({ paymentMethods: [] }), "paymentMethods:methodsRequired");
eq("patch: methods [] while deactivating", patch({ paymentMethods: [], isActive: false }), "OK");
eq("patch: editor body for an existing tariff", patch(editorBody), "OK");
eq("patch: nothing present keeps nothing", JSON.stringify((parseTariffInput({}, "patch") as any).data), "{}");
eq("patch: null yukassa/card values pass through as null", (parseTariffInput({ cardNumber: null, yukassaShopId: null }, "patch") as any).data, { cardNumber: null, yukassaShopId: null });

// ---- names / slugs: no auto slug is generated, and the "unique name" check is case/space-insensitive ----
eq("tariffNameKey: case and spaces", tariffNameKey("  Мой канал:   Неделя ") === tariffNameKey("мой канал: НЕДЕЛЯ"), true);
eq("tariffNameKey: different Cyrillic names differ", tariffNameKey("Мой канал: Неделя") === tariffNameKey("Мой канал: Месяц"), false);
eq("two weekly tariffs of one author collide by name", [tariffNameKey("Канал: Неделя"), tariffNameKey("Канал: неделя")].reduce((a, b) => (a === b ? "same" : "diff")), "same");
eq("tariff slug is never derived from the (Cyrillic) name: a Cyrillic custom id is rejected, a Latin one accepted", [isValidCustomFomoId("Неделя"), isValidCustomFomoId("Недельный"), isValidCustomFomoId("weekly_1")], [false, false, true]);
eq("POST body has no slug: slug stays null, so channelRoomId/slug @unique cannot collide on create", Object.keys((parseTariffInput(editorBody, "create") as any).data).includes("slug"), false);

// ---- texts: every error code has ru / en / cn text, placeholders get filled ----
const codes: TariffErrorCode[] = [
  "nameRequired", "nameTooLong", "nameTaken", "descriptionTooLong", "priceInvalid", "priceTooHigh", "daysInvalid", "daysRange",
  "methodsRequired", "methodsInvalid", "methodUnknown", "methodLinkMissing", "fieldTooLong", "invalidData", "saveFailed",
];
for (const loc of ["ru", "en", "cn"]) {
  const missing = codes.filter((c) => !DICTIONARIES[loc][tariffErrorKey(c)]);
  eq(`${loc}: all ${codes.length} tariff error texts exist`, missing, []);
  const raw = translate(loc, tariffErrorKey("daysRange"), { min: 1, max: 365 });
  eq(`${loc}: daysRange text has the numbers and no leftover {placeholder}`, /1/.test(raw) && /365/.test(raw) && !/[{}]/.test(raw), true);
}
eq("ru wording", [translate("ru", tariffErrorKey("daysRange"), { min: 1, max: 365 }), translate("ru", tariffErrorKey("methodsRequired"))], ["Срок от 1 до 365 дней", "Выберите способ оплаты"]);

if (fails) {
  console.error(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log("\nall tariff validation checks passed");
