import { prisma } from "@/lib/prisma";
import { isLinkRef, linkRefId } from "@/lib/payment-link";

const PLAIN_METHODS = new Set(["card", "yukassa", "sbp", "crypto"]);

/**
 * Validates a tariff's `paymentMethods` array. Returns a Russian error text,
 * or null when fine. "link:<id>" entries must point at a payment method of
 * type "link" owned by the same author (no pointing at someone else's link).
 */
export async function validateTariffMethods(authorId: string, methods: unknown): Promise<string | null> {
  if (!Array.isArray(methods) || methods.length > 20) return "Некорректный список способов оплаты";
  const linkIds: string[] = [];
  for (const m of methods) {
    if (typeof m !== "string") return "Некорректный список способов оплаты";
    if (PLAIN_METHODS.has(m)) continue;
    if (isLinkRef(m)) {
      const id = linkRefId(m);
      if (id) linkIds.push(id);
      continue;
    }
    return "Неизвестный способ оплаты";
  }
  if (linkIds.length > 0) {
    const own = await prisma.paymentMethod.count({
      where: { userId: authorId, type: "link", id: { in: linkIds } },
    });
    if (own !== new Set(linkIds).size) return "Способ оплаты по ссылке не найден";
  }
  return null;
}
