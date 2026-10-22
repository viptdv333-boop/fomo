import { prisma } from "@/lib/prisma";
import { isLinkRef, linkRefId } from "@/lib/payment-link";
import type { TariffErrorCode } from "@/lib/tariff-validation";

const PLAIN_METHODS = new Set(["card", "yukassa", "sbp", "crypto"]);

/**
 * Validates a tariff's `paymentMethods` array. Returns an error code
 * (i18n key `api.tariffErr.<code>`, see tariff-validation.ts), or null when fine. "link:<id>" entries must point at a payment method of
 * type "link" owned by the same author (no pointing at someone else's link).
 */
export async function validateTariffMethods(authorId: string, methods: unknown): Promise<TariffErrorCode | null> {
  if (!Array.isArray(methods) || methods.length > 20) return "methodsInvalid";
  const linkIds: string[] = [];
  for (const m of methods) {
    if (typeof m !== "string") return "methodsInvalid";
    if (PLAIN_METHODS.has(m)) continue;
    if (isLinkRef(m)) {
      const id = linkRefId(m);
      if (id) linkIds.push(id);
      continue;
    }
    return "methodUnknown";
  }
  if (linkIds.length > 0) {
    const own = await prisma.paymentMethod.count({
      where: { userId: authorId, type: "link", id: { in: linkIds } },
    });
    if (own !== new Set(linkIds).size) return "methodLinkMissing";
  }
  return null;
}
