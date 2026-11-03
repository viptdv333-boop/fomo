import { prisma } from "@/lib/prisma";

/** What a buyer sees when a tariff has no card / QR of its own: the author's saved methods (the default one first), then the legacy profile fields. */
export interface AuthorPayDefaults {
  cardNumber: string | null;
  sbpQrUrl: string | null;
}

export async function authorPayDefaults(authorId: string): Promise<AuthorPayDefaults> {
  const [methods, user] = await Promise.all([
    prisma.paymentMethod.findMany({
      where: { userId: authorId, type: { in: ["card", "sbp"] } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { type: true, details: true },
    }),
    prisma.user.findUnique({ where: { id: authorId }, select: { paymentCard: true, sbpQrUrl: true } }),
  ]);
  const pick = (type: string, key: string): string | null => {
    for (const m of methods) {
      if (m.type !== type) continue;
      const v = (m.details as Record<string, unknown> | null)?.[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  return {
    cardNumber: pick("card", "cardNumber") ?? (user?.paymentCard?.trim() || null),
    sbpQrUrl: pick("sbp", "qrImageUrl") ?? (user?.sbpQrUrl?.trim() || null),
  };
}

/** The tariff's own value, or (for an accepted method with an empty value) the author's default. */
export function withPayDefaults<T extends { paymentMethods?: string[] | null; cardNumber?: string | null; sbpQrUrl?: string | null }>(row: T, d: AuthorPayDefaults): T {
  const methods = row.paymentMethods ?? ["card"];
  return {
    ...row,
    cardNumber: row.cardNumber?.trim() ? row.cardNumber : methods.includes("card") ? d.cardNumber : row.cardNumber ?? null,
    sbpQrUrl: row.sbpQrUrl?.trim() ? row.sbpQrUrl : methods.includes("sbp") ? d.sbpQrUrl : row.sbpQrUrl ?? null,
  };
}
